use log::{debug, error, warn};
use std::sync::Mutex;
use tauri::State;

use super::manager::AdbManager;
use super::types::{AdbDevice, AdbDirectoryListing, AdbFileInfo, AdbServerStatus};
use crate::app_error::AppError;

pub struct AdbState(pub Mutex<AdbManager>);

#[tauri::command]
pub async fn adb_check_server(state: State<'_, AdbState>) -> Result<AdbServerStatus, AppError> {
    debug!("adb_check_server called");

    let addr = {
        let manager = state.0.lock().map_err(|e| {
            error!("Failed to lock AdbManager: {}", e);
            AppError::internal(e.to_string())
        })?;
        manager.get_server_addr()
    };

    debug!("Checking server status at address: {}", addr);

    tokio::task::spawn_blocking(move || AdbManager::check_server_status_with_addr(addr))
        .await
        .map_err(|e| {
            error!("Task join error: {}", e);
            AppError::internal(e.to_string())
        })
}

#[tauri::command]
pub async fn adb_list_devices(state: State<'_, AdbState>) -> Result<Vec<AdbDevice>, AppError> {
    debug!("adb_list_devices called");

    let manager = state
        .0
        .lock()
        .map_err(|e| {
            error!("Failed to lock AdbManager: {}", e);
            AppError::internal(e.to_string())
        })?
        .clone();

    tokio::task::spawn_blocking(move || manager.list_devices())
        .await
        .map_err(|e| {
            error!("Task join error: {}", e);
            AppError::internal(e.to_string())
        })?
        .map_err(AppError::from)
}

#[tauri::command]
pub fn adb_select_device(state: State<AdbState>, serial: String) -> Result<(), AppError> {
    debug!("adb_select_device called: serial={}", serial);

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    manager.select_device(serial);
    Ok(())
}

#[tauri::command]
pub fn adb_get_selected_device(state: State<AdbState>) -> Option<String> {
    debug!("adb_get_selected_device called");

    let manager = state.0.lock().ok()?;
    let result = manager.get_selected_device();

    if let Some(ref serial) = result {
        debug!("Selected device: {}", serial);
    } else {
        debug!("No device selected");
    }

    result
}

#[tauri::command]
pub fn adb_clear_selected_device(state: State<AdbState>) {
    debug!("adb_clear_selected_device called");

    let manager = state.0.lock().unwrap();
    manager.clear_selected_device();
}

#[tauri::command]
pub fn adb_shell_command(
    state: State<AdbState>,
    serial: Option<String>,
    command: String,
) -> Result<String, AppError> {
    debug!(
        "adb_shell_command called: serial={:?}, command={}",
        serial, command
    );

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    let serial_ref = serial.as_deref();
    manager
        .shell_command(serial_ref, &command)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn adb_list_directory(
    state: State<AdbState>,
    serial: Option<String>,
    path: String,
) -> Result<AdbDirectoryListing, AppError> {
    debug!(
        "adb_list_directory called: serial={:?}, path={}",
        serial, path
    );

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    let serial_ref = serial.as_deref();
    let result = manager.list_directory(serial_ref, &path);

    if let Ok(ref listing) = result {
        debug!("Listed directory: {} items found", listing.items.len());
    }

    result.map_err(AppError::from)
}

#[tauri::command]
pub fn adb_push_file(
    state: State<AdbState>,
    serial: Option<String>,
    local_path: String,
    remote_path: String,
) -> Result<(), AppError> {
    debug!(
        "adb_push_file called: serial={:?}, local={}, remote={}",
        serial, local_path, remote_path
    );

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    let serial_ref = serial.as_deref();
    let result = manager.push_file(serial_ref, &local_path, &remote_path);

    if result.is_ok() {
        debug!("Push file completed successfully");
    } else if let Err(ref e) = result {
        warn!("Push file failed: {}", e);
    }

    result.map_err(AppError::from)
}

#[tauri::command]
pub fn adb_pull_file(
    state: State<AdbState>,
    serial: Option<String>,
    remote_path: String,
    local_path: String,
) -> Result<(), AppError> {
    debug!(
        "adb_pull_file called: serial={:?}, remote={}, local={}",
        serial, remote_path, local_path
    );

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    let serial_ref = serial.as_deref();
    let result = manager.pull_file(serial_ref, &remote_path, &local_path);

    if result.is_ok() {
        debug!("Pull file completed successfully");
    } else if let Err(ref e) = result {
        warn!("Pull file failed: {}", e);
    }

    result.map_err(AppError::from)
}

#[tauri::command]
pub fn adb_pull_folder(
    state: State<AdbState>,
    serial: Option<String>,
    remote_path: String,
    local_path: String,
) -> Result<(), AppError> {
    debug!(
        "adb_pull_folder called: serial={:?}, remote={}, local={}",
        serial, remote_path, local_path
    );

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    let serial_ref = serial.as_deref();
    let result = manager.pull_folder(serial_ref, &remote_path, &local_path);

    if result.is_ok() {
        debug!("Pull folder completed successfully");
    } else if let Err(ref e) = result {
        warn!("Pull folder failed: {}", e);
    }

    result.map_err(AppError::from)
}

#[tauri::command]
pub fn adb_delete_file(
    state: State<AdbState>,
    serial: Option<String>,
    path: String,
) -> Result<String, AppError> {
    debug!("adb_delete_file called: serial={:?}, path={}", serial, path);

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    let serial_ref = serial.as_deref();
    manager
        .delete_file(serial_ref, &path)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn adb_make_directory(
    state: State<AdbState>,
    serial: Option<String>,
    path: String,
) -> Result<String, AppError> {
    debug!(
        "adb_make_directory called: serial={:?}, path={}",
        serial, path
    );

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    let serial_ref = serial.as_deref();
    manager
        .make_directory(serial_ref, &path)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn adb_rename(
    state: State<AdbState>,
    serial: Option<String>,
    old_path: String,
    new_path: String,
) -> Result<String, AppError> {
    debug!(
        "adb_rename called: serial={:?}, old={}, new={}",
        serial, old_path, new_path
    );

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    let serial_ref = serial.as_deref();
    manager
        .rename(serial_ref, &old_path, &new_path)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn adb_stat(
    state: State<AdbState>,
    serial: Option<String>,
    path: String,
) -> Result<AdbFileInfo, AppError> {
    debug!("adb_stat called: serial={:?}, path={}", serial, path);

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    let serial_ref = serial.as_deref();
    manager.stat(serial_ref, &path).map_err(AppError::from)
}

#[tauri::command]
pub fn adb_reboot(
    state: State<AdbState>,
    serial: Option<String>,
    reboot_type: String,
) -> Result<(), AppError> {
    debug!(
        "adb_reboot called: serial={:?}, type={}",
        serial, reboot_type
    );

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    let serial_ref = serial.as_deref();
    manager
        .reboot(serial_ref, &reboot_type)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn adb_root(state: State<AdbState>, serial: Option<String>) -> Result<String, AppError> {
    debug!("adb_root called: serial={:?}", serial);

    let manager = state.0.lock().map_err(|e| {
        error!("Failed to lock AdbManager: {}", e);
        AppError::internal(e.to_string())
    })?;
    let serial_ref = serial.as_deref();
    manager.root(serial_ref).map_err(AppError::from)
}

#[macro_export]
macro_rules! register_adb_commands {
    () => {
        $crate::adb::commands::adb_check_server,
        $crate::adb::commands::adb_list_devices,
        $crate::adb::commands::adb_select_device,
        $crate::adb::commands::adb_get_selected_device,
        $crate::adb::commands::adb_clear_selected_device,
        $crate::adb::commands::adb_shell_command,
        $crate::adb::commands::adb_list_directory,
        $crate::adb::commands::adb_push_file,
        $crate::adb::commands::adb_pull_file,
        $crate::adb::commands::adb_pull_folder,
        $crate::adb::commands::adb_delete_file,
        $crate::adb::commands::adb_make_directory,
        $crate::adb::commands::adb_rename,
        $crate::adb::commands::adb_stat,
        $crate::adb::commands::adb_reboot,
        $crate::adb::commands::adb_root
    };
}
