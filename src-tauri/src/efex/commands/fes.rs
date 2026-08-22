use log::debug;

use super::service::{get_fes_timeout, run_device_blocking, run_device_blocking_with_timeout};
use crate::efex::device;
use crate::efex::error::EfexError;
use crate::efex::types::{FesDataType, FesToolMode, FesVerifyResp};

#[tauri::command]
pub async fn efex_fes_query_storage(device_id: u32) -> Result<u32, EfexError> {
    debug!("efex_fes_query_storage called: device_id={}", device_id);
    run_device_blocking_with_timeout(
        device_id,
        get_fes_timeout(),
        "Query storage timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            let storage_type = ctx
                .fes_query_storage()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!("Storage type: {}", storage_type);
            Ok(storage_type)
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_fes_query_secure(device_id: u32) -> Result<u32, EfexError> {
    debug!("efex_fes_query_secure called: device_id={}", device_id);
    run_device_blocking_with_timeout(
        device_id,
        get_fes_timeout(),
        "Query secure status timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            let secure_type = ctx
                .fes_query_secure()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!("Secure type: {}", secure_type);
            Ok(secure_type)
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_fes_probe_flash_size(device_id: u32) -> Result<u32, EfexError> {
    debug!("efex_fes_probe_flash_size called: device_id={}", device_id);
    run_device_blocking_with_timeout(
        device_id,
        get_fes_timeout(),
        "Probe flash size timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            let flash_size = ctx
                .fes_probe_flash_size()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!("Flash size: {} Sector", flash_size);
            Ok(flash_size)
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_fes_flash_set_onoff(
    device_id: u32,
    storage_type: u32,
    on_off: bool,
) -> Result<(), EfexError> {
    debug!(
        "efex_fes_flash_set_onoff called: device_id={}, storage_type={}, on_off={}",
        device_id, storage_type, on_off
    );
    run_device_blocking_with_timeout(
        device_id,
        get_fes_timeout(),
        "Set flash on/off timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.fes_flash_set_onoff(storage_type, on_off)
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!("Flash on/off set successfully");
            Ok(())
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_fes_get_chipid(device_id: u32) -> Result<String, EfexError> {
    debug!("efex_fes_get_chipid called: device_id={}", device_id);
    run_device_blocking_with_timeout(
        device_id,
        get_fes_timeout(),
        "Get chip ID timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            let chip_id = ctx
                .fes_get_chipid()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!("Chip ID: {}", chip_id);
            Ok(chip_id)
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_fes_down(
    device_id: u32,
    buf: Vec<u8>,
    addr: u32,
    data_type: u32,
) -> Result<(), EfexError> {
    debug!(
        "efex_fes_down called: device_id={}, addr=0x{:x}, len={}, data_type=0x{:x}",
        device_id,
        addr,
        buf.len(),
        data_type
    );
    let fes_data_type = FesDataType::from(data_type);
    let task = move || {
        let mut ctx = device::get_context(device_id)?;
        ctx.usb_init()
            .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
        ctx.efex_init()
            .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
        ctx.fes_down(&buf, addr, fes_data_type.into())
            .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
        debug!("FES down completed");
        Ok(())
    };

    if matches!(fes_data_type, FesDataType::Mbr) {
        return run_device_blocking(device_id, task).await;
    }

    run_device_blocking_with_timeout(device_id, get_fes_timeout(), "Download data timeout", task)
        .await
}

impl From<u32> for FesDataType {
    fn from(value: u32) -> Self {
        match value {
            0x0 => FesDataType::None,
            0x7f00 => FesDataType::Dram,
            0x7f01 => FesDataType::Mbr,
            0x7f02 => FesDataType::Boot1,
            0x7f03 => FesDataType::Boot0,
            0x7f04 => FesDataType::Erase,
            0x7f10 => FesDataType::FullImgSize,
            0x7ff0 => FesDataType::Ext4Ubifs,
            0x8000 => FesDataType::Flash,
            _ => FesDataType::None,
        }
    }
}

#[tauri::command]
pub async fn efex_fes_up(
    device_id: u32,
    len: usize,
    addr: u32,
    data_type: u32,
) -> Result<Vec<u8>, EfexError> {
    debug!(
        "efex_fes_up called: device_id={}, addr=0x{:x}, len={}, data_type=0x{:x}",
        device_id, addr, len, data_type
    );
    let fes_data_type = FesDataType::from(data_type);
    run_device_blocking_with_timeout(
        device_id,
        get_fes_timeout(),
        "Upload data timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            let mut buf = vec![0u8; len];
            ctx.fes_up(&mut buf, addr, fes_data_type.into())
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!("FES up completed: {} bytes", buf.len());
            Ok(buf)
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_fes_verify_value(
    device_id: u32,
    addr: u32,
    size: u64,
) -> Result<FesVerifyResp, EfexError> {
    debug!(
        "efex_fes_verify_value called: device_id={}, addr=0x{:x}, size={}",
        device_id, addr, size
    );
    run_device_blocking_with_timeout(
        device_id,
        get_fes_timeout(),
        "Verify data timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            let resp = ctx
                .fes_verify_value(addr, size)
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!(
                "Verify value: flag={}, fes_crc={}, media_crc={}",
                resp.flag, resp.fes_crc, resp.media_crc
            );
            Ok(resp.into())
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_fes_verify_status(device_id: u32, tag: u32) -> Result<FesVerifyResp, EfexError> {
    debug!(
        "efex_fes_verify_status called: device_id={}, tag={}",
        device_id, tag
    );
    run_device_blocking_with_timeout(
        device_id,
        get_fes_timeout(),
        "Verify status timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            let resp = ctx
                .fes_verify_status(tag)
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!(
                "Verify status: flag={}, fes_crc={}, media_crc={}",
                resp.flag, resp.fes_crc, resp.media_crc
            );
            Ok(resp.into())
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_fes_verify_uboot_blk(
    device_id: u32,
    tag: u32,
) -> Result<FesVerifyResp, EfexError> {
    debug!(
        "efex_fes_verify_uboot_blk called: device_id={}, tag={}",
        device_id, tag
    );
    run_device_blocking_with_timeout(
        device_id,
        get_fes_timeout(),
        "Verify U-Boot block timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            let resp = ctx
                .fes_verify_uboot_blk(tag)
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!(
                "Verify U-Boot block: flag={}, fes_crc={}, media_crc={}",
                resp.flag, resp.fes_crc, resp.media_crc
            );
            Ok(resp.into())
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_fes_tool_mode(
    device_id: u32,
    tool_mode: u32,
    next_mode: u32,
) -> Result<(), EfexError> {
    debug!(
        "efex_fes_tool_mode called: device_id={}, tool_mode={}, next_mode={}",
        device_id, tool_mode, next_mode
    );
    let tool_mode = FesToolMode::from(tool_mode);
    let next_mode = FesToolMode::from(next_mode);
    run_device_blocking_with_timeout(
        device_id,
        get_fes_timeout(),
        "Set tool mode timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.fes_tool_mode(tool_mode.into(), next_mode.into())
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            debug!("Tool mode set successfully");
            Ok(())
        },
    )
    .await
}

impl From<u32> for FesToolMode {
    fn from(value: u32) -> Self {
        match value {
            0x1 => FesToolMode::Normal,
            0x2 => FesToolMode::Reboot,
            0x3 => FesToolMode::Poweroff,
            0x4 => FesToolMode::Reupdate,
            0x5 => FesToolMode::Boot,
            _ => FesToolMode::Normal,
        }
    }
}
