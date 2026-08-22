use log::debug;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

use super::types::{UsbHotPlugCallback, UsbHotPlugEvent};
use crate::efex::device;

static HOTPLUG_REGISTERED: AtomicBool = AtomicBool::new(false);

type HotplugCallback = Box<dyn Fn(&UsbHotPlugCallback) + Send + Sync>;

lazy_static::lazy_static! {
    static ref HOTPLUG_CALLBACKS: Mutex<HashMap<usize, HotplugCallback>> = Mutex::new(HashMap::new());
}

static NEXT_CALLBACK_ID: AtomicUsize = AtomicUsize::new(0);

pub fn register_hotplug_callback(
    cb: impl Fn(&UsbHotPlugCallback) + Send + Sync + 'static,
) -> usize {
    let id = NEXT_CALLBACK_ID.fetch_add(1, Ordering::SeqCst);
    HOTPLUG_CALLBACKS.lock().unwrap().insert(id, Box::new(cb));
    id
}

pub fn unregister_hotplug_callback(id: usize) {
    HOTPLUG_CALLBACKS.lock().unwrap().remove(&id);
}

#[derive(Debug, Clone)]
struct HotplugDeviceSnapshot {
    vendor_id: u16,
    product_id: u16,
    efex_device_id: Option<u32>,
    bus_id: u32,
    usb_device_id: u32,
    device_path: Option<String>,
    port: Option<u32>,
}

impl HotplugDeviceSnapshot {
    fn key(&self) -> String {
        if let Some(path) = self.device_path.as_ref() {
            return path.to_ascii_lowercase();
        }

        format!(
            "{}:{}:{}:{}:{}",
            self.vendor_id,
            self.product_id,
            self.bus_id,
            self.usb_device_id,
            self.port.unwrap_or_default()
        )
    }

    fn to_callback(&self, event: UsbHotPlugEvent) -> UsbHotPlugCallback {
        UsbHotPlugCallback {
            event,
            vendor_id: self.vendor_id,
            product_id: self.product_id,
            efex_device_id: self.efex_device_id,
            bus_id: self.bus_id,
            usb_device_id: self.usb_device_id,
            device_path: self.device_path.clone(),
            port: self.port,
        }
    }
}

fn scan_hotplug_devices() -> Vec<HotplugDeviceSnapshot> {
    let Ok(devices) = libefex::Context::scan_hotplug_devices() else {
        return Vec::new();
    };

    devices
        .into_iter()
        .map(|device_info| {
            let bus = u8::try_from(device_info.bus_id).ok();
            let port = device_info.port;
            let registered =
                device::find_registered_device(device_info.device_path.as_deref(), bus, port);

            HotplugDeviceSnapshot {
                vendor_id: device_info.vendor_id,
                product_id: device_info.product_id,
                efex_device_id: registered.as_ref().map(|device| device.device_id),
                bus_id: device_info.bus_id,
                usb_device_id: device_info.usb_device_id,
                device_path: registered
                    .as_ref()
                    .and_then(|device| device.device_path.clone())
                    .or(device_info.device_path),
                port: registered
                    .as_ref()
                    .map(|device| device.port as u32)
                    .or(device_info.port.map(u32::from)),
            }
        })
        .collect()
}

fn emit_hotplug<R: Runtime>(
    app_handle: &AppHandle<R>,
    snapshot: &HotplugDeviceSnapshot,
    event: UsbHotPlugEvent,
) {
    debug!(
        "Emitting hotplug event: event={:?}, efex_device_id={:?}, bus_id={}, usb_device_id={}, port={:?}, device_path={:?}",
        event,
        snapshot.efex_device_id,
        snapshot.bus_id,
        snapshot.usb_device_id,
        snapshot.port,
        snapshot.device_path
    );
    let _ = app_handle.emit("usb-hotplug", snapshot.to_callback(event));
}

fn invoke_hotplug_callbacks(payload: &UsbHotPlugCallback) {
    if let Ok(callbacks) = HOTPLUG_CALLBACKS.lock() {
        for callback in callbacks.values() {
            callback(payload);
        }
    }
}

pub fn start_hotplug_watcher<R: Runtime>(app_handle: AppHandle<R>) -> Result<(), String> {
    debug!("start_hotplug_watcher called");

    if HOTPLUG_REGISTERED.load(Ordering::SeqCst) {
        debug!("Hotplug watcher already registered");
        return Ok(());
    }

    HOTPLUG_REGISTERED.store(true, Ordering::SeqCst);

    thread::spawn(move || {
        debug!("Starting USB hotplug polling thread");
        let mut known_devices: HashMap<String, HotplugDeviceSnapshot> = HashMap::new();

        loop {
            let current_devices = scan_hotplug_devices();
            let current_map: HashMap<String, HotplugDeviceSnapshot> = current_devices
                .into_iter()
                .map(|device| (device.key(), device))
                .collect();

            for (key, current) in &current_map {
                if !known_devices.contains_key(key) {
                    let payload = current.to_callback(UsbHotPlugEvent::Arrived);
                    emit_hotplug(&app_handle, current, UsbHotPlugEvent::Arrived);
                    invoke_hotplug_callbacks(&payload);
                }
            }

            for (key, previous) in &known_devices {
                if !current_map.contains_key(key) {
                    let payload = previous.to_callback(UsbHotPlugEvent::Left);
                    emit_hotplug(&app_handle, previous, UsbHotPlugEvent::Left);
                    invoke_hotplug_callbacks(&payload);
                }
            }

            known_devices = current_map;
            thread::sleep(Duration::from_millis(200));
        }
    });

    debug!("Hotplug watcher started successfully");
    Ok(())
}
