#[cfg(windows)]
use serde::{Deserialize, Serialize};

use std::sync::Mutex;
use tauri::{AppHandle, Runtime, WebviewWindow};

#[cfg(windows)]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};

#[cfg(windows)]
use tauri::Manager;

#[cfg(windows)]
use windows::Win32::{
    Foundation::HWND,
    System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED},
    UI::Shell::{
        ITaskbarList3, TaskbarList, TBPF_ERROR, TBPF_INDETERMINATE, TBPF_NOPROGRESS, TBPF_NORMAL,
        TBPF_PAUSED,
    },
    UI::WindowsAndMessaging::{
        FlashWindowEx, FLASHWINFO, FLASHW_STOP, FLASHW_TIMERNOFG, FLASHW_TRAY,
    },
};

/// Progress indicator state for taskbar
#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProgressIndicatorState {
    NoProgress,
    Indeterminate,
    Normal,
    Paused,
    Error,
}

#[cfg(windows)]
const MAX_PROGRESS: u64 = 100_000;

/// Taskbar indicator - caches COM objects for efficiency
#[cfg(windows)]
pub struct TaskbarIndicatorInner {
    hwnd: HWND,
    taskbar: ITaskbarList3,
    last_progress: Option<f64>,
    last_state: Option<ProgressIndicatorState>,
}

#[cfg(windows)]
unsafe impl Send for TaskbarIndicatorInner {}

#[cfg(not(windows))]
#[allow(dead_code)]
pub struct TaskbarIndicatorInner;

/// Managed state wrapper
#[allow(dead_code)]
pub struct TaskbarIndicatorState(pub Mutex<Option<TaskbarIndicatorInner>>);

impl TaskbarIndicatorState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

impl Default for TaskbarIndicatorState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(windows)]
impl TaskbarIndicatorInner {
    pub fn new<R: Runtime>(window: &WebviewWindow<R>) -> Result<Self, String> {
        let handle = window
            .window_handle()
            .map_err(|e| format!("Failed to get window handle: {}", e))?;

        let raw_handle = handle.as_raw();

        let hwnd = match raw_handle {
            RawWindowHandle::Win32(handle) => HWND(handle.hwnd.get() as *mut std::ffi::c_void),
            _ => return Err("Unsupported window handle type".to_string()),
        };

        // Initialize COM once during creation
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }

        // Create and cache ITaskbarList3
        let taskbar: ITaskbarList3 = unsafe { CoCreateInstance(&TaskbarList, None, CLSCTX_ALL) }
            .map_err(|e| format!("Failed to create TaskbarList: {:?}", e))?;

        Ok(Self {
            hwnd,
            taskbar,
            last_progress: None,
            last_state: None,
        })
    }

    pub fn set_progress(&mut self, progress: f64) -> Result<(), String> {
        let progress = progress.clamp(0.0, 1.0);
        // Skip no-op updates
        if self.last_progress == Some(progress) {
            return Ok(());
        }
        self.last_progress = Some(progress);

        let value = (progress * MAX_PROGRESS as f64) as u64;
        unsafe {
            self.taskbar
                .SetProgressValue(self.hwnd, value, MAX_PROGRESS)
                .map_err(|e| format!("SetProgressValue failed: {:?}", e))?;
        }
        Ok(())
    }

    pub fn set_state(&mut self, state: ProgressIndicatorState) -> Result<(), String> {
        // Skip no-op updates
        if self.last_state == Some(state) {
            return Ok(());
        }
        self.last_state = Some(state);

        let flag = match state {
            ProgressIndicatorState::NoProgress => TBPF_NOPROGRESS,
            ProgressIndicatorState::Indeterminate => TBPF_INDETERMINATE,
            ProgressIndicatorState::Normal => TBPF_NORMAL,
            ProgressIndicatorState::Paused => TBPF_PAUSED,
            ProgressIndicatorState::Error => TBPF_ERROR,
        };

        unsafe {
            self.taskbar
                .SetProgressState(self.hwnd, flag)
                .map_err(|e| format!("SetProgressState failed: {:?}", e))?;
        }
        Ok(())
    }

    pub fn needs_attention(&self, needs_attention: bool) -> Result<(), String> {
        let flags = if needs_attention {
            FLASHW_TRAY | FLASHW_TIMERNOFG
        } else {
            FLASHW_STOP
        };

        let mut params = FLASHWINFO {
            cbSize: std::mem::size_of::<FLASHWINFO>() as u32,
            hwnd: self.hwnd,
            dwFlags: flags,
            uCount: 0,
            dwTimeout: 0,
        };

        unsafe {
            let _ = FlashWindowEx(&mut params);
        }
        Ok(())
    }

    pub fn clear(&mut self) -> Result<(), String> {
        self.set_state(ProgressIndicatorState::NoProgress)?;
        self.needs_attention(false)?;
        self.last_progress = None;
        Ok(())
    }
}

#[cfg(not(windows))]
#[allow(dead_code)]
impl TaskbarIndicatorInner {
    pub fn new<R: Runtime>(_window: &WebviewWindow<R>) -> Result<Self, String> {
        Ok(Self)
    }

    pub fn set_progress(&mut self, _progress: f64) -> Result<(), String> {
        Ok(())
    }

    pub fn set_state(&mut self) -> Result<(), String> {
        Ok(())
    }

    pub fn needs_attention(&self, _needs_attention: bool) -> Result<(), String> {
        Ok(())
    }

    pub fn clear(&mut self) -> Result<(), String> {
        Ok(())
    }
}

/// Helper to execute action with indicator
#[cfg(windows)]
fn with_indicator<R: Runtime, F>(app: &AppHandle<R>, f: F)
where
    F: FnOnce(&mut TaskbarIndicatorInner),
{
    if let Some(state) = app.try_state::<TaskbarIndicatorState>() {
        if let Some(indicator) = state.0.lock().unwrap().as_mut() {
            f(indicator);
        }
    }
}

#[cfg(not(windows))]
#[allow(dead_code)]
fn with_indicator<R: Runtime, F>(_app: &AppHandle<R>, _f: F)
where
    F: FnOnce(&mut TaskbarIndicatorInner),
{
}

/// Setup taskbar event listeners
pub fn setup_taskbar_listeners<R: Runtime>(_app_handle: &AppHandle<R>) {
    #[cfg(windows)]
    {
        use crate::flash::mass::manager::SUNXI_USB_VENDOR;
        use crate::flash::task::{
            STATUS_CANCELLED, STATUS_COMPLETED, STATUS_FAILED, STATUS_STARTED,
        };
        use crate::flash::types::{FlashProgressEvent, FlashStateEvent};
        use crate::hotplug::types::{UsbHotPlugCallback, UsbHotPlugEvent};
        use tauri::Listener;

        // Initialize taskbar indicator
        let window = _app_handle.get_webview_window("main");
        if let Some(window) = window {
            if let Ok(indicator) = TaskbarIndicatorInner::new(&window) {
                if let Some(state) = _app_handle.try_state::<TaskbarIndicatorState>() {
                    *state.0.lock().unwrap() = Some(indicator);
                }
            }
        }

        // Listen for USB hotplug - flash taskbar when Allwinner device arrives
        // Skip if a flash task is already active (FEL->FES transition causes reconnection)
        let app = _app_handle.clone();
        _app_handle.listen("usb-hotplug", move |event| {
            let Ok(payload) = serde_json::from_str::<UsbHotPlugCallback>(event.payload()) else {
                return;
            };
            if payload.event == UsbHotPlugEvent::Arrived && payload.vendor_id == SUNXI_USB_VENDOR {
                // Don't flash taskbar during active flash operation (FEL->FES transition)
                if crate::flash::is_flash_task_active() {
                    return;
                }
                with_indicator(&app, |ind| {
                    log::info!("SUNXI device connected, flashing taskbar");
                    if let Err(e) = ind.needs_attention(true) {
                        log::warn!("Failed to flash taskbar: {}", e);
                    }
                });
            }
        });

        // Listen for flash progress
        let app = _app_handle.clone();
        _app_handle.listen("flash-progress", move |event| {
            let Ok(payload) = serde_json::from_str::<FlashProgressEvent>(event.payload()) else {
                return;
            };
            with_indicator(&app, |ind| {
                if payload.indeterminate {
                    if let Err(e) = ind.set_state(ProgressIndicatorState::Indeterminate) {
                        log::warn!("Failed to set indeterminate state: {}", e);
                    }
                } else {
                    if let Err(e) = ind.set_progress(payload.overall_percent / 100.0) {
                        log::warn!("Failed to set progress: {}", e);
                    }
                }
            });
        });

        // Listen for flash state
        let app = _app_handle.clone();
        _app_handle.listen("flash-state", move |event| {
            let Ok(payload) = serde_json::from_str::<FlashStateEvent>(event.payload()) else {
                return;
            };
            with_indicator(&app, |ind| match payload.status.as_str() {
                STATUS_STARTED => {
                    if let Err(e) = ind.set_state(ProgressIndicatorState::Normal) {
                        log::warn!("Failed to set normal state: {}", e);
                    }
                }
                STATUS_COMPLETED | STATUS_CANCELLED => {
                    if let Err(e) = ind.clear() {
                        log::warn!("Failed to clear taskbar: {}", e);
                    }
                }
                STATUS_FAILED => {
                    if let Err(e) = ind.set_state(ProgressIndicatorState::Error) {
                        log::warn!("Failed to set error state: {}", e);
                    }
                    if let Err(e) = ind.needs_attention(true) {
                        log::warn!("Failed to flash taskbar on error: {}", e);
                    }
                }
                _ => {}
            });
        });
    }
}
