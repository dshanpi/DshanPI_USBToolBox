#[cfg(windows)]
pub mod commands;
#[cfg(not(windows))]
#[path = "commands_non_windows.rs"]
pub mod commands;
pub mod device_notifier;

use std::collections::HashMap;
#[cfg(windows)]
use std::collections::HashSet;
use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::sync::OnceLock;
use std::sync::{Mutex, MutexGuard};
#[cfg(windows)]
use windows::core::PCWSTR;
#[cfg(windows)]
use windows::Win32::Foundation::{FreeLibrary, HMODULE};
#[cfg(windows)]
use windows::Win32::System::LibraryLoader::LoadLibraryW;

#[cfg(windows)]
const DLL_NAMES: [&str; 2] = ["CH347DLLA64.dll", "CH347DLL.dll"];
#[cfg(windows)]
static CH347_DLL_PATH: OnceLock<PathBuf> = OnceLock::new();
#[cfg(windows)]
static CH347_DLL_MODULE: OnceLock<usize> = OnceLock::new();

/// Device open state: device index -> reference count.
///
/// The reference count allows the UI and the embedded Python HTTP service to
/// share one physical CH347 device without one client closing the handle while
/// another client is still using it.
pub struct Ch347State {
    pub open_count: Mutex<HashMap<u32, u32>>,
    /// Serializes every call into the process-wide CH347 DLL.
    ///
    /// The WCH runtime keeps device configuration and handles in global state
    /// and is not safe to call concurrently from Tauri commands, the embedded
    /// HTTP server, and the background device scanner.
    operation_lock: Mutex<()>,
    dll_available: bool,
    dll_path: Option<PathBuf>,
    dll_error: Option<String>,
}

#[cfg(windows)]
fn push_candidate(candidates: &mut Vec<PathBuf>, base: &Path) {
    for name in DLL_NAMES {
        candidates.push(base.join("ch347").join(name));
        candidates.push(base.join("resources").join("ch347").join(name));
        candidates.push(base.join(name));
    }
}

#[cfg(windows)]
fn dll_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // Tauri's Windows resource directory is beside the executable. The first
    // path matches tauri.windows.conf.json's `ch347/...` bundle destination.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            push_candidate(&mut candidates, exe_dir);
        }
    }

    // `tauri dev` can run before resources have been copied beside the debug
    // executable, so also resolve the checked-in development resource.
    if cfg!(debug_assertions) {
        push_candidate(
            &mut candidates,
            &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources"),
        );
    }

    // Backward-compatible fallback for machines where the official WCH driver
    // package installed the runtime into System32 or another loader path.
    for name in DLL_NAMES {
        candidates.push(PathBuf::from(name));
    }

    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

#[cfg(windows)]
fn load_library(path: &Path) -> Result<HMODULE, String> {
    let wide: Vec<u16> = path
        .as_os_str()
        .to_string_lossy()
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe { LoadLibraryW(PCWSTR(wide.as_ptr())) }
        .map_err(|error| format!("{}: {error}", path.display()))
}

#[cfg(windows)]
pub(crate) fn load_selected_library() -> Result<HMODULE, String> {
    let _path = CH347_DLL_PATH
        .get()
        .ok_or_else(|| "CH347 runtime path was not initialized".to_string())?;
    let module = CH347_DLL_MODULE
        .get()
        .ok_or_else(|| "CH347 runtime module was not initialized".to_string())?;
    Ok(HMODULE(*module as *mut std::ffi::c_void))
}

impl Ch347State {
    #[cfg(windows)]
    pub fn new() -> Self {
        let mut selected = None;
        let mut attempts = Vec::new();

        for candidate in dll_candidates() {
            // A single component is a loader-search fallback such as
            // `CH347DLLA64.dll`; absolute/relative bundle paths must exist.
            if candidate.components().count() > 1 && !candidate.is_file() {
                attempts.push(format!("{} (not found)", candidate.display()));
                continue;
            }

            match load_library(&candidate) {
                Ok(module) => {
                    if CH347_DLL_MODULE.set(module.0 as usize).is_ok() {
                        selected = Some(candidate);
                    } else {
                        // A second state construction can occur in tests. Keep
                        // the first process-wide runtime and release this extra
                        // reference immediately.
                        unsafe {
                            let _ = FreeLibrary(module);
                        }
                        selected = CH347_DLL_PATH.get().cloned();
                    }
                    break;
                }
                Err(error) => attempts.push(error),
            }
        }

        let dll_available = selected.is_some();
        let dll_error = if dll_available {
            None
        } else {
            Some(format!(
                "CH347 runtime unavailable. Reinstall USBToolBox or install the official WCH CH347 driver. Tried: {}",
                attempts.join("; ")
            ))
        };

        if let Some(path) = &selected {
            let _ = CH347_DLL_PATH.set(path.clone());
            log::info!("CH347 runtime loaded from {}", path.display());
        } else if let Some(error) = &dll_error {
            log::error!("{error}");
        }

        Self {
            open_count: Mutex::new(HashMap::new()),
            operation_lock: Mutex::new(()),
            dll_available,
            dll_path: selected,
            dll_error,
        }
    }

    #[cfg(not(windows))]
    pub fn new() -> Self {
        Self {
            open_count: Mutex::new(HashMap::new()),
            operation_lock: Mutex::new(()),
            dll_available: false,
            dll_path: None,
            dll_error: Some("CH347 is only supported on Windows".to_string()),
        }
    }

    pub fn is_available(&self) -> bool {
        self.dll_available
    }

    pub fn dll_path(&self) -> Option<&Path> {
        self.dll_path.as_deref()
    }

    pub fn dll_error(&self) -> Option<&str> {
        self.dll_error.as_deref()
    }

    /// Acquire the process-wide CH347 operation lock.
    ///
    /// A poisoned lock is recovered because the calling command still needs a
    /// deterministic error from the DLL instead of allowing all later device
    /// operations to panic while acquiring the mutex.
    pub(crate) fn lock_operations(&self) -> MutexGuard<'_, ()> {
        self.operation_lock.lock().unwrap_or_else(|poisoned| {
            log::error!("CH347 operation lock was poisoned; recovering it");
            poisoned.into_inner()
        })
    }
}

#[cfg(test)]
mod operation_lock_tests {
    use super::*;
    use std::sync::TryLockError;

    #[test]
    fn operation_lock_blocks_a_second_dll_caller() {
        let state = Ch347State {
            open_count: Mutex::new(HashMap::new()),
            operation_lock: Mutex::new(()),
            dll_available: false,
            dll_path: None,
            dll_error: None,
        };
        let _first_caller = state.lock_operations();

        assert!(matches!(
            state.operation_lock.try_lock(),
            Err(TryLockError::WouldBlock)
        ));
    }
}
