use log::{debug, warn};

use super::service::{run_blocking_with_timeout, DEFAULT_TIMEOUT_DURATION};
use crate::efex::device;
use crate::efex::error::EfexError;
use crate::efex::types::{DeviceMode, EfexDevice};

#[tauri::command]
pub async fn efex_scan_devices() -> Result<Vec<EfexDevice>, EfexError> {
    debug!("efex_scan_devices called");
    run_blocking_with_timeout(DEFAULT_TIMEOUT_DURATION, "Scan device timeout", || {
        debug!("Scanning USB devices");
        let scanned = libefex::Context::scan_usb_devices()
            .map_err(|e| EfexError::from_libefex_with_device_id(&e, None))?;

        if scanned.is_empty() {
            debug!("No devices found");
            return Ok(Vec::new());
        }

        debug!("Found {} potential devices", scanned.len());

        let mut devices = Vec::new();
        for dev in scanned {
            let mut ctx = libefex::Context::new();

            if let Err(error) = ctx
                .scan_usb_device_at(dev.bus, dev.port)
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, None))
            {
                warn!(
                    "Skipping device during scan: bus={}, port={}, step=scan, error={}",
                    dev.bus, dev.port, error.message
                );
                continue;
            }
            if let Err(error) = ctx
                .usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, None))
            {
                warn!(
                    "Skipping device during scan: bus={}, port={}, step=usb_init, error={}",
                    dev.bus, dev.port, error.message
                );
                continue;
            }
            if let Err(error) = ctx
                .efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, None))
            {
                warn!(
                    "Skipping device during scan: bus={}, port={}, step=efex_init, error={}",
                    dev.bus, dev.port, error.message
                );
                continue;
            }

            let mode: DeviceMode = ctx.get_device_mode().into();
            let mode_str = ctx.get_device_mode_str().to_string();
            let chip_version = unsafe { (*ctx.as_ptr()).resp.id };

            debug!(
                "Device found: bus={}, port={}, mode={:?}, chip=0x{:x}",
                dev.bus, dev.port, mode, chip_version
            );

            let device_id = device::register_device(
                dev.bus,
                dev.port,
                ctx.device_path().map(ToOwned::to_owned),
            );
            drop(ctx);

            devices.push(EfexDevice {
                device_id,
                chip_version,
                mode: mode.as_str().to_string(),
                mode_str,
                bus: dev.bus,
                port: dev.port,
            });
        }

        debug!("Returning {} devices", devices.len());
        Ok(devices)
    })
    .await
}
