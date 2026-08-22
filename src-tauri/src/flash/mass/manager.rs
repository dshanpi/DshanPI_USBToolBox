use log::debug;
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Listener, Manager, Runtime};

use crate::app_error::AppError;
use crate::efex::device;

use crate::flash::types::{
    FlashConfirmRequestEvent, FlashLogEvent, FlashOptions, FlashProgressEvent, FlashStateEvent,
};
use crate::hotplug::types::{UsbHotPlugCallback, UsbHotPlugEvent};
use crate::hotplug::watcher::{register_hotplug_callback, unregister_hotplug_callback};

use super::events::{emit_mass_log, emit_mass_state, emit_slot_update};
use super::slot::{MassSlot, SlotStatus};
use super::types::{MassConfig, MassManagerState, MassStatusSnapshot};

pub const SUNXI_USB_VENDOR: u16 = 0x1f3a;
pub const SUNXI_USB_PRODUCT: u16 = 0xefe8;
const MAX_SLOTS: u16 = 48;

pub struct MassProductionManager {
    state: MassManagerState,
    config: Option<MassConfig>,
    slots: Vec<MassSlot>,
    task_to_slot: HashMap<u64, u16>,
    active_task_ids: HashSet<u64>,
    /// Device paths currently being flashed — used to skip hotplug events
    /// for devices that reconnect during FEL→SRV transition.
    active_device_paths: HashSet<String>,
    /// Maps task_id → device_path so we can clean up active_device_paths on completion.
    task_to_device_path: HashMap<u64, String>,
    total_success: u32,
    total_failed: u32,
    hotplug_callback_id: Option<usize>,
    listener_ids: Vec<u32>,
}

impl MassProductionManager {
    pub fn new() -> Self {
        Self {
            state: MassManagerState::Stopped,
            config: None,
            slots: Vec::new(),
            task_to_slot: HashMap::new(),
            active_task_ids: HashSet::new(),
            active_device_paths: HashSet::new(),
            task_to_device_path: HashMap::new(),
            total_success: 0,
            total_failed: 0,
            hotplug_callback_id: None,
            listener_ids: Vec::new(),
        }
    }

    pub fn is_running(&self) -> bool {
        self.state == MassManagerState::Running
    }

    pub fn is_device_path_active(&self, device_path: &str) -> bool {
        self.active_device_paths
            .contains(&device_path.to_ascii_lowercase())
    }

    pub fn get_status(&self) -> MassStatusSnapshot {
        let in_progress = self
            .slots
            .iter()
            .filter(|s| matches!(s.status, SlotStatus::Flashing | SlotStatus::Waiting))
            .count() as u32;
        MassStatusSnapshot {
            state: self.state,
            slots: self.slots.clone(),
            total: self.total_success + self.total_failed,
            success: self.total_success,
            failed: self.total_failed,
            in_progress,
        }
    }

    fn reset_runtime_state(&mut self, clear_slots: bool) {
        self.task_to_slot.clear();
        self.active_task_ids.clear();
        self.active_device_paths.clear();
        self.task_to_device_path.clear();
        self.total_success = 0;
        self.total_failed = 0;

        if clear_slots {
            for slot in &mut self.slots {
                slot.clear();
            }
        }
    }

    pub fn start<R: Runtime>(
        &mut self,
        app_handle: &AppHandle<R>,
        image_path: String,
        options: FlashOptions,
        max_slots: u16,
    ) -> Result<(), AppError> {
        if self.state == MassManagerState::Running {
            self.stop(app_handle)?;
        }

        // Validate image can be parsed
        crate::firmware::parse_image(&image_path)
            .map_err(|e| AppError::internal(format!("Invalid firmware image: {}", e)))?;

        let slot_count = max_slots.min(MAX_SLOTS);
        self.slots = (0..slot_count).map(MassSlot::new).collect();
        self.reset_runtime_state(false);
        self.config = Some(MassConfig {
            image_path,
            options,
            max_slots: slot_count,
        });
        self.state = MassManagerState::Running;

        // Register hotplug callback
        let app_clone = app_handle.clone();
        let cb_id = register_hotplug_callback(move |event| {
            if event.vendor_id != SUNXI_USB_VENDOR || event.product_id != SUNXI_USB_PRODUCT {
                return;
            }
            let _ = app_clone.emit("mass-hotplug-internal", event);
        });
        self.hotplug_callback_id = Some(cb_id);

        // Listen for internal hotplug events to process in async context
        self.setup_listeners(app_handle);

        emit_mass_state(
            app_handle,
            MassManagerState::Running,
            0,
            0,
            0,
            slot_count as u32,
        );
        emit_mass_log(app_handle, None, "info", "Mass production started");

        debug!("Mass production started with {} slots", slot_count);
        Ok(())
    }

    pub fn stop<R: Runtime>(&mut self, app_handle: &AppHandle<R>) -> Result<(), AppError> {
        if self.state == MassManagerState::Running {
            // Cancel all active tasks
            for task_id in self.active_task_ids.iter().copied().collect::<Vec<_>>() {
                let _ = crate::flash::cancel_flash_task(task_id);
            }
        }

        // Unregister hotplug callback
        if let Some(cb_id) = self.hotplug_callback_id.take() {
            unregister_hotplug_callback(cb_id);
        }

        // Unlisten all event listeners
        for listener_id in self.listener_ids.drain(..) {
            app_handle.unlisten(listener_id);
        }

        // Reset all slots so frontend state is fully cleared after stop.
        for slot in &mut self.slots {
            slot.clear();
            emit_slot_update(app_handle, slot);
        }

        self.reset_runtime_state(false);
        self.state = MassManagerState::Stopped;
        self.config = None;

        emit_mass_state(app_handle, MassManagerState::Stopped, 0, 0, 0, 0);
        emit_mass_log(app_handle, None, "info", "Mass production stopped");

        debug!("Mass production stopped");
        Ok(())
    }

    fn setup_listeners<R: Runtime>(&mut self, app_handle: &AppHandle<R>) {
        // Listen for internal hotplug events
        let app = app_handle.clone();
        let id = app_handle.listen("mass-hotplug-internal", move |event| {
            let Ok(payload) = serde_json::from_str::<UsbHotPlugCallback>(event.payload()) else {
                return;
            };
            handle_hotplug_event_async(app.clone(), payload);
        });
        self.listener_ids.push(id);

        // Listen for flash progress events
        let app = app_handle.clone();
        let id = app_handle.listen("flash-progress", move |event| {
            let Ok(payload) = serde_json::from_str::<FlashProgressEvent>(event.payload()) else {
                return;
            };
            handle_flash_progress_async(app.clone(), payload);
        });
        self.listener_ids.push(id);

        // Listen for flash state events
        let app = app_handle.clone();
        let id = app_handle.listen("flash-state", move |event| {
            let Ok(payload) = serde_json::from_str::<FlashStateEvent>(event.payload()) else {
                return;
            };
            handle_flash_state_async(app.clone(), payload);
        });
        self.listener_ids.push(id);

        // Listen for flash log events
        let app = app_handle.clone();
        let id = app_handle.listen("flash-log", move |event| {
            let Ok(payload) = serde_json::from_str::<FlashLogEvent>(event.payload()) else {
                return;
            };
            handle_flash_log_async(app.clone(), payload);
        });
        self.listener_ids.push(id);

        // Listen for flash confirm requests - auto confirm
        let app = app_handle.clone();
        let id = app_handle.listen("flash-confirm-request", move |event| {
            let Ok(payload) = serde_json::from_str::<FlashConfirmRequestEvent>(event.payload())
            else {
                return;
            };
            handle_flash_confirm_async(app.clone(), payload);
        });
        self.listener_ids.push(id);
    }

    /// Called after a FEL device has been scanned and registered.
    /// `device_id`, `bus`, `port` come from the scan result.
    fn handle_device_arrived<R: Runtime>(
        &mut self,
        app_handle: &AppHandle<R>,
        device_id: u32,
        bus: u8,
        port: u8,
        device_path: String,
    ) {
        if !self.is_running() {
            return;
        }

        let config = match &self.config {
            Some(c) => c.clone(),
            None => return,
        };

        // Check if this bus+port is already being flashed
        if self
            .slots
            .iter()
            .any(|s| s.matches_bus_port(bus, port) && s.status == SlotStatus::Flashing)
        {
            return;
        }

        // Find slot by affinity (same bus+port)
        let slot_idx = self
            .slots
            .iter()
            .position(|s| {
                s.matches_bus_port(bus, port)
                    && matches!(
                        s.status,
                        SlotStatus::Idle | SlotStatus::Success | SlotStatus::Failed
                    )
            })
            .or_else(|| {
                // Find first available slot without affinity
                self.slots.iter().position(|s| {
                    s.bus.is_none() && matches!(s.status, SlotStatus::Idle | SlotStatus::Waiting)
                })
            });

        let Some(idx) = slot_idx else {
            emit_mass_log(
                app_handle,
                None,
                "warn",
                &format!("No available slot for device at bus={}, port={}", bus, port),
            );
            return;
        };

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        self.slots[idx].reset_for_flash(bus, port, now);
        emit_slot_update(app_handle, &self.slots[idx]);
        emit_mass_log(
            app_handle,
            Some(self.slots[idx].id),
            "info",
            &format!(
                "Device assigned to slot #{} (bus={}, port={})",
                self.slots[idx].id + 1,
                bus,
                port
            ),
        );

        // Start flash task
        match crate::flash::start_flash_task(
            app_handle.clone(),
            device_id,
            bus,
            port,
            config.image_path.clone(),
            config.options.clone(),
        ) {
            Ok(result) => {
                let task_id = result.task_id;
                self.slots[idx].task_id = Some(task_id);
                self.task_to_slot.insert(task_id, self.slots[idx].id);
                self.active_task_ids.insert(task_id);
                self.active_device_paths
                    .insert(device_path.to_ascii_lowercase());
                self.task_to_device_path
                    .insert(task_id, device_path.to_ascii_lowercase());
                debug!(
                    "Flash task {} started for slot {}",
                    task_id, self.slots[idx].id
                );
            }
            Err(e) => {
                self.active_device_paths
                    .remove(&device_path.to_ascii_lowercase());
                self.slots[idx].status = SlotStatus::Failed;
                self.slots[idx].error = Some(e.message.clone());
                self.slots[idx].end_time = Some(now);
                self.total_failed += 1;
                emit_slot_update(app_handle, &self.slots[idx]);
                emit_mass_log(
                    app_handle,
                    Some(self.slots[idx].id),
                    "error",
                    &format!("Failed to start flash: {}", e.message),
                );
                self.emit_stats(app_handle);
            }
        }
    }

    fn handle_device_left<R: Runtime>(
        &mut self,
        app_handle: &AppHandle<R>,
        event: &UsbHotPlugCallback,
    ) {
        if !self.is_running() {
            return;
        }

        let port = event.port.map(|p| p as u8);
        let bus = u8::try_from(event.bus_id).ok();

        let slot_idx = self.slots.iter().position(|s| {
            if s.status != SlotStatus::Flashing {
                return false;
            }
            match (bus, port) {
                (Some(b), Some(p)) => s.matches_bus_port(b, p),
                _ => false,
            }
        });

        let Some(idx) = slot_idx else {
            return;
        };

        // Check if the flash task is in a reconnect stage (FEL→FES transition)
        // In that case, disconnect is expected
        if self.slots[idx].stage.contains("reconnect") || self.slots[idx].stage.contains("mode") {
            debug!(
                "Device disconnect expected for slot {} during stage: {}",
                self.slots[idx].id, self.slots[idx].stage
            );
            return;
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        self.slots[idx].status = SlotStatus::Failed;
        self.slots[idx].error = Some("Device disconnected".to_string());
        self.slots[idx].end_time = Some(now);
        self.total_failed += 1;

        if let Some(task_id) = self.slots[idx].task_id.take() {
            if let Some(path) = self.task_to_device_path.remove(&task_id) {
                self.active_device_paths.remove(&path);
            }
            let _ = crate::flash::cancel_flash_task(task_id);
            self.task_to_slot.remove(&task_id);
            self.active_task_ids.remove(&task_id);
        }

        emit_slot_update(app_handle, &self.slots[idx]);
        emit_mass_log(
            app_handle,
            Some(self.slots[idx].id),
            "warn",
            "Device disconnected during flash",
        );
        self.emit_stats(app_handle);
    }

    pub fn handle_flash_progress<R: Runtime>(
        &mut self,
        app_handle: &AppHandle<R>,
        event: &FlashProgressEvent,
    ) {
        let Some(&slot_id) = self.task_to_slot.get(&event.task_id) else {
            return;
        };
        let Some(slot) = self.slots.iter_mut().find(|s| s.id == slot_id) else {
            return;
        };

        slot.progress = event.overall_percent;
        slot.stage = event.stage_label.clone();
        emit_slot_update(app_handle, slot);
    }

    pub fn handle_flash_state<R: Runtime>(
        &mut self,
        app_handle: &AppHandle<R>,
        event: &FlashStateEvent,
    ) {
        let Some(&slot_id) = self.task_to_slot.get(&event.task_id) else {
            return;
        };
        let Some(slot) = self.slots.iter_mut().find(|s| s.id == slot_id) else {
            return;
        };

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        match event.status.as_str() {
            "completed" => {
                slot.status = SlotStatus::Success;
                slot.progress = 100.0;
                slot.stage = "Flash complete".to_string();
                slot.end_time = Some(now);
                slot.flash_count += 1;
                self.total_success += 1;
                emit_mass_log(
                    app_handle,
                    Some(slot_id),
                    "info",
                    "Flash completed successfully",
                );
            }
            "failed" => {
                slot.status = SlotStatus::Failed;
                slot.error = event
                    .error
                    .as_ref()
                    .map(|e| e.message.clone())
                    .or_else(|| event.message.clone());
                slot.end_time = Some(now);
                self.total_failed += 1;
                emit_mass_log(
                    app_handle,
                    Some(slot_id),
                    "error",
                    &format!(
                        "Flash failed: {}",
                        slot.error.as_deref().unwrap_or("Unknown error")
                    ),
                );
            }
            "cancelled" => {
                slot.status = SlotStatus::Failed;
                slot.error = Some("Cancelled".to_string());
                slot.end_time = Some(now);
                self.total_failed += 1;
            }
            _ => return,
        }

        // Clean up task tracking
        if let Some(path) = self.task_to_device_path.remove(&event.task_id) {
            self.active_device_paths.remove(&path);
        }
        self.task_to_slot.remove(&event.task_id);
        self.active_task_ids.remove(&event.task_id);
        slot.task_id = None;

        emit_slot_update(app_handle, slot);
        self.emit_stats(app_handle);
    }

    pub fn handle_flash_log<R: Runtime>(
        &mut self,
        app_handle: &AppHandle<R>,
        event: &FlashLogEvent,
    ) {
        let Some(&slot_id) = self.task_to_slot.get(&event.task_id) else {
            return;
        };
        emit_mass_log(app_handle, Some(slot_id), &event.level, &event.message);
    }

    fn emit_stats<R: Runtime>(&self, app_handle: &AppHandle<R>) {
        let in_progress = self
            .slots
            .iter()
            .filter(|s| matches!(s.status, SlotStatus::Flashing | SlotStatus::Waiting))
            .count() as u32;
        emit_mass_state(
            app_handle,
            self.state,
            self.total_success + self.total_failed,
            self.total_success,
            self.total_failed,
            in_progress,
        );
    }
}

/// Register a device for mass production without opening a USB handle.
///
/// The hotplug watcher already confirmed the device matches SUNXI VID/PID.
/// The flash task will verify the device mode (FEL/SRV) when it starts.
/// Avoiding USB open here prevents libusb context contention that can
/// disrupt transfers on devices already being flashed.
fn register_fel_device(device_key: &str, bus: u8, port: u8) -> u32 {
    debug!(
        "register_fel_device: key={}, bus={}, port={}",
        device_key, bus, port
    );

    let device_id = device::register_device(bus, port, Some(device_key.to_owned()));
    debug!(
        "register_fel_device: registered device_id={}, key={}",
        device_id, device_key
    );
    device_id
}

// Async dispatch functions - these acquire the manager lock and delegate
use super::MassProductionState;

fn handle_hotplug_event_async<R: Runtime>(app_handle: AppHandle<R>, event: UsbHotPlugCallback) {
    debug!(
        "Mass hotplug event: event={:?}, vendor=0x{:04x}, product=0x{:04x}, bus={}, usb_device_id={}, port={:?}, device_path={:?}",
        event.event, event.vendor_id, event.product_id, event.bus_id, event.usb_device_id, event.port, event.device_path
    );

    // For Left events, no USB scan needed — just update manager state
    if event.event == UsbHotPlugEvent::Left {
        let state = app_handle.try_state::<MassProductionState>();
        let Some(state) = state else { return };
        let mut manager = state.0.lock().unwrap();
        if manager.is_running() {
            manager.handle_device_left(&app_handle, &event);
        }
        return;
    }

    let device_path = event.device_path.clone();
    let bus = u8::try_from(event.bus_id).unwrap_or(0);
    let port = event.port.map(|p| p as u8).unwrap_or(0);

    let addr = match device_path.as_deref() {
        Some(p) => crate::usb::DeviceAddress::parse(p),
        None => crate::usb::DeviceAddress::from_bus_port(bus, port),
    };
    let device_key = addr.to_path_string().to_ascii_lowercase();

    // Skip if this device is already being flashed (e.g. FEL→SRV reconnection)
    {
        let state = app_handle.try_state::<MassProductionState>();
        let Some(state) = state else { return };
        let manager = state.0.lock().unwrap();
        if !manager.is_running() {
            debug!(
                "Mass hotplug: manager not running, skipping device_key={}",
                device_key
            );
            return;
        }
        if manager.is_device_path_active(&device_key) {
            debug!(
                "Mass hotplug: device_key={} already active, skipping",
                device_key
            );
            return;
        }
    }

    debug!(
        "Mass hotplug: attempting to register FEL device, device_key={}, bus={}, port={}",
        device_key, bus, port
    );

    tauri::async_runtime::spawn(async move {
        let device_id = register_fel_device(&device_key, bus, port);

        let state = app_handle.try_state::<MassProductionState>();
        let Some(state) = state else { return };
        let mut manager = state.0.lock().unwrap();

        if manager.is_running() {
            manager.handle_device_arrived(&app_handle, device_id, bus, port, device_key);
        }
    });
}

fn handle_flash_progress_async<R: Runtime>(app_handle: AppHandle<R>, event: FlashProgressEvent) {
    let state = app_handle.try_state::<MassProductionState>();
    let Some(state) = state else { return };
    let mut manager = state.0.lock().unwrap();
    if manager.is_running() {
        manager.handle_flash_progress(&app_handle, &event);
    }
}

fn handle_flash_state_async<R: Runtime>(app_handle: AppHandle<R>, event: FlashStateEvent) {
    let state = app_handle.try_state::<MassProductionState>();
    let Some(state) = state else { return };
    let mut manager = state.0.lock().unwrap();
    if manager.is_running() {
        manager.handle_flash_state(&app_handle, &event);
    }
}

fn handle_flash_log_async<R: Runtime>(app_handle: AppHandle<R>, event: FlashLogEvent) {
    let state = app_handle.try_state::<MassProductionState>();
    let Some(state) = state else { return };
    let mut manager = state.0.lock().unwrap();
    if manager.is_running() {
        manager.handle_flash_log(&app_handle, &event);
    }
}

fn handle_flash_confirm_async<R: Runtime>(
    app_handle: AppHandle<R>,
    event: FlashConfirmRequestEvent,
) {
    let state = app_handle.try_state::<MassProductionState>();
    let Some(state) = state else { return };
    let manager = state.0.lock().unwrap();
    // Auto-confirm all requests in mass production mode
    if manager.is_running() && manager.task_to_slot.contains_key(&event.task_id) {
        debug!(
            "Auto-confirming request {} for task {}",
            event.request_id, event.task_id
        );
        let _ = crate::flash::confirm_flash_task(event.task_id, event.request_id, true);
    }
}
