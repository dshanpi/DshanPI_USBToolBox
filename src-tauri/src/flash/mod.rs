pub mod commands;
pub mod mass;
pub(crate) mod task;
pub mod types;

use crate::app_error::AppError;
use tauri::{AppHandle, Runtime};
use types::{FlashOptions, FlashStartResult};

pub(crate) fn start_flash_task<R: Runtime>(
    app_handle: AppHandle<R>,
    device_id: u32,
    bus: u8,
    port: u8,
    image_path: String,
    options: FlashOptions,
) -> Result<FlashStartResult, AppError> {
    task::start(app_handle, device_id, bus, port, image_path, options)
}

pub(crate) fn cancel_flash_task(task_id: u64) -> Result<(), AppError> {
    task::cancel(task_id)
}

pub(crate) fn confirm_flash_task(
    task_id: u64,
    request_id: u64,
    confirmed: bool,
) -> Result<(), AppError> {
    task::confirm(task_id, request_id, confirmed)
}

#[cfg(windows)]
pub(crate) fn is_flash_task_active() -> bool {
    task::is_flash_task_active()
}
