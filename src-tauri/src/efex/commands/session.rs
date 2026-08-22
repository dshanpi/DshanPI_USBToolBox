use log::debug;

use super::service::{run_device_blocking_with_timeout, DEFAULT_TIMEOUT_DURATION};
use crate::efex::device;
use crate::efex::error::EfexError;
use crate::efex::types::{DeviceMode, UsbBackend};

#[tauri::command]
pub fn efex_set_usb_backend(backend: UsbBackend) -> Result<(), EfexError> {
    debug!("Setting USB backend to: {:?}", backend);
    libefex::Context::set_usb_backend_static(backend.into())
        .map_err(|e| EfexError::from_libefex_with_device_id(&e, None))?;
    Ok(())
}

#[tauri::command]
pub fn efex_get_usb_backend() -> UsbBackend {
    let backend = libefex::Context::get_usb_backend_static();
    debug!("Current USB backend: {:?}", backend);
    backend.into()
}

#[tauri::command]
pub fn efex_close_device(device_id: u32) -> Result<(), EfexError> {
    debug!("efex_close_device called: device_id={}", device_id);
    device::unregister_device(device_id);
    Ok(())
}

#[tauri::command]
pub async fn efex_get_device_mode(device_id: u32) -> Result<String, EfexError> {
    debug!("efex_get_device_mode called: device_id={}", device_id);
    run_device_blocking_with_timeout(
        device_id,
        DEFAULT_TIMEOUT_DURATION,
        "Get device mode timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            let mode: DeviceMode = ctx.get_device_mode().into();
            debug!("Device mode: {:?}", mode);
            Ok(mode.as_str().to_string())
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_get_device_mode_str(device_id: u32) -> Result<String, EfexError> {
    debug!("efex_get_device_mode_str called: device_id={}", device_id);
    run_device_blocking_with_timeout(
        device_id,
        DEFAULT_TIMEOUT_DURATION,
        "Get device mode string timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            let mode_str = ctx.get_device_mode_str().to_string();
            debug!("Device mode string: {}", mode_str);
            Ok(mode_str)
        },
    )
    .await
}
