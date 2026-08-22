use log::{debug, error};

use super::service::{run_device_blocking_with_timeout, DEFAULT_TIMEOUT_DURATION};
use crate::efex::device;
use crate::efex::error::EfexError;

#[tauri::command]
pub fn efex_payloads_init(arch: String) -> Result<(), EfexError> {
    debug!("efex_payloads_init called: arch={}", arch);

    let payload_arch = match arch.as_str() {
        "arm32" => libefex::PayloadArch::Arm32,
        "aarch64" => libefex::PayloadArch::Aarch64,
        "riscv" => libefex::PayloadArch::Riscv,
        _ => {
            error!("Unknown architecture: {}", arch);
            return Err(EfexError {
                code: -1,
                name: "InvalidParam".to_string(),
                message: format!("Unknown architecture: {}", arch),
            });
        }
    };

    libefex::payloads::init(payload_arch)
        .map_err(|e| EfexError::from_libefex_with_device_id(&e, None))?;
    debug!("Payloads initialized successfully");
    Ok(())
}

#[tauri::command]
pub async fn efex_payloads_readl(device_id: u32, addr: u32) -> Result<u32, EfexError> {
    debug!(
        "efex_payloads_readl called: device_id={}, addr=0x{:x}",
        device_id, addr
    );
    run_device_blocking_with_timeout(
        device_id,
        DEFAULT_TIMEOUT_DURATION,
        "Read register timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;

            let value = libefex::payloads::readl(&ctx, addr)
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!("Read register: addr=0x{:x}, value=0x{:x}", addr, value);
            Ok(value)
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_payloads_writel(device_id: u32, value: u32, addr: u32) -> Result<(), EfexError> {
    debug!(
        "efex_payloads_writel called: device_id={}, addr=0x{:x}, value=0x{:x}",
        device_id, addr, value
    );
    run_device_blocking_with_timeout(
        device_id,
        DEFAULT_TIMEOUT_DURATION,
        "Write register timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            libefex::payloads::writel(&ctx, value, addr)
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!("Write register completed");
            Ok(())
        },
    )
    .await
}
