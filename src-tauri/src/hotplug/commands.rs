use log::debug;
use tauri::{AppHandle, Runtime};

use super::watcher::start_hotplug_watcher;

#[tauri::command]
pub fn hotplug_start<R: Runtime>(app_handle: AppHandle<R>) -> Result<(), String> {
    debug!("hotplug_start called");
    start_hotplug_watcher(app_handle)
}
