use tauri::{AppHandle, Runtime, State};

use crate::app_error::AppError;
use crate::flash::types::FlashOptions;

use super::types::MassStatusSnapshot;
use super::MassProductionState;

#[tauri::command]
pub async fn mass_start<R: Runtime>(
    app_handle: AppHandle<R>,
    state: State<'_, MassProductionState>,
    image_path: String,
    options: FlashOptions,
    max_slots: u16,
) -> Result<(), AppError> {
    let mut manager = state.0.lock().unwrap();
    manager.start(&app_handle, image_path, options, max_slots)
}

#[tauri::command]
pub fn mass_stop<R: Runtime>(
    app_handle: AppHandle<R>,
    state: State<'_, MassProductionState>,
) -> Result<(), AppError> {
    let mut manager = state.0.lock().unwrap();
    manager.stop(&app_handle)
}

#[tauri::command]
pub fn mass_get_status(
    state: State<'_, MassProductionState>,
) -> Result<MassStatusSnapshot, AppError> {
    let manager = state.0.lock().unwrap();
    Ok(manager.get_status())
}
