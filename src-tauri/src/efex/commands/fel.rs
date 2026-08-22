use serde::Serialize;
use std::time::{Duration, SystemTime};

use super::service::{get_fel_timeout, run_device_blocking_with_timeout, DEFAULT_TIMEOUT_DURATION};
use crate::app_error::AppError;
use crate::efex::device;
use crate::efex::error::EfexError;
use crate::firmware::{parse_boot0, parse_dram_params, serialize_dram_params};

const DRAM_CHECK_INTERVAL: Duration = Duration::from_secs(1);
const DRAM_CHECK_TIMEOUT: Duration = Duration::from_secs(60);
const DRAM_READ_TIMEOUT: Duration = Duration::from_secs(60);
const BYTES_PER_SECOND: usize = 64 * 1024;
const MIN_DOWNLOAD_TIMEOUT_SECS: u64 = 3;

#[derive(Debug, Clone, Serialize)]
pub struct EfexInitDramResult {
    pub success: bool,
    pub dram_init_flag: u32,
    pub dram_update_flag: u32,
    pub ret_addr: u32,
    pub dram_para: Vec<u32>,
}

fn calculate_download_timeout_secs(data_size: usize) -> u64 {
    let timeout = (data_size as u64).div_ceil(BYTES_PER_SECOND as u64);
    timeout.max(MIN_DOWNLOAD_TIMEOUT_SECS)
}

#[tauri::command]
pub async fn efex_fel_read(device_id: u32, addr: u32, len: usize) -> Result<Vec<u8>, EfexError> {
    efex_fel_read_with_timeout(device_id, addr, len, get_fel_timeout()).await
}

pub(crate) async fn efex_fel_read_with_timeout(
    device_id: u32,
    addr: u32,
    len: usize,
    timeout: Duration,
) -> Result<Vec<u8>, EfexError> {
    run_device_blocking_with_timeout(device_id, timeout, "Read memory timeout", move || {
        let mut ctx = device::get_context(device_id)?;
        ctx.usb_init()
            .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
        ctx.efex_init()
            .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;

        let mut buf = vec![0u8; len];
        ctx.fel_read(addr, &mut buf)
            .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
        Ok(buf)
    })
    .await
}

#[tauri::command]
pub async fn efex_fel_write(device_id: u32, addr: u32, data: Vec<u8>) -> Result<(), EfexError> {
    efex_fel_write_with_timeout(device_id, addr, data, get_fel_timeout()).await
}

pub(crate) async fn efex_fel_write_with_timeout(
    device_id: u32,
    addr: u32,
    data: Vec<u8>,
    timeout: Duration,
) -> Result<(), EfexError> {
    run_device_blocking_with_timeout(device_id, timeout, "Write memory timeout", move || {
        let mut ctx = device::get_context(device_id)?;
        ctx.usb_init()
            .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
        ctx.efex_init()
            .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
        ctx.fel_write(addr, &data)
            .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn efex_fel_exec(device_id: u32, addr: u32) -> Result<(), EfexError> {
    run_device_blocking_with_timeout(
        device_id,
        DEFAULT_TIMEOUT_DURATION,
        "Execute jump timeout",
        move || {
            let mut ctx = device::get_context(device_id)?;
            ctx.usb_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.efex_init()
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            ctx.fel_exec(addr)
                .map_err(|e| EfexError::from_libefex_with_device_id(&e, Some(device_id)))?;
            Ok(())
        },
    )
    .await
}

#[tauri::command]
pub async fn efex_fel_init_dram(
    device_id: u32,
    fex_data: Vec<u8>,
) -> Result<EfexInitDramResult, AppError> {
    let header = parse_boot0(&fex_data).map_err(AppError::from)?;
    let dram = serialize_dram_params(&crate::firmware::types::DramParamInfoDto {
        dram_init_flag: 0,
        dram_update_flag: 0,
        dram_para: vec![0; 32],
    })
    .map_err(AppError::from)?;

    let download_timeout = Duration::from_secs(calculate_download_timeout_secs(fex_data.len()));
    efex_fel_write_with_timeout(device_id, header.ret_addr, dram, download_timeout)
        .await
        .map_err(AppError::from)?;
    efex_fel_write_with_timeout(device_id, header.run_addr, fex_data, download_timeout)
        .await
        .map_err(AppError::from)?;
    efex_fel_exec(device_id, header.run_addr)
        .await
        .map_err(AppError::from)?;

    let started = SystemTime::now();
    let result = loop {
        if SystemTime::now()
            .duration_since(started)
            .unwrap_or_default()
            > DRAM_CHECK_TIMEOUT
        {
            break Err(AppError::from(
                "Timed out while waiting for DRAM initialization",
            ));
        }

        tokio::time::sleep(DRAM_CHECK_INTERVAL).await;

        let data = efex_fel_read_with_timeout(
            device_id,
            header.ret_addr,
            4 + 4 + 32 * 4,
            DRAM_READ_TIMEOUT,
        )
        .await;
        let Ok(data) = data else {
            continue;
        };
        let state = parse_dram_params(&data).map_err(AppError::from)?;
        if state.dram_init_flag != 0 {
            break Ok(EfexInitDramResult {
                success: state.dram_init_flag != 1,
                dram_init_flag: state.dram_init_flag,
                dram_update_flag: state.dram_update_flag,
                ret_addr: header.ret_addr,
                dram_para: state.dram_para,
            });
        }
    };
    result
}

#[tauri::command]
pub async fn efex_fel_init_dram_with_params(
    device_id: u32,
    fex_data: Vec<u8>,
    dram_info: crate::firmware::types::DramParamInfoDto,
) -> Result<EfexInitDramResult, AppError> {
    let header = parse_boot0(&fex_data).map_err(AppError::from)?;
    let dram = serialize_dram_params(&dram_info).map_err(AppError::from)?;

    let download_timeout = Duration::from_secs(calculate_download_timeout_secs(fex_data.len()));
    efex_fel_write_with_timeout(device_id, header.ret_addr, dram, download_timeout)
        .await
        .map_err(AppError::from)?;
    efex_fel_write_with_timeout(device_id, header.run_addr, fex_data, download_timeout)
        .await
        .map_err(AppError::from)?;
    efex_fel_exec(device_id, header.run_addr)
        .await
        .map_err(AppError::from)?;

    let started = SystemTime::now();
    let result = loop {
        if SystemTime::now()
            .duration_since(started)
            .unwrap_or_default()
            > DRAM_CHECK_TIMEOUT
        {
            break Err(AppError::from(
                "Timed out while waiting for DRAM initialization",
            ));
        }

        tokio::time::sleep(DRAM_CHECK_INTERVAL).await;

        let data = efex_fel_read_with_timeout(
            device_id,
            header.ret_addr,
            4 + 4 + 32 * 4,
            DRAM_READ_TIMEOUT,
        )
        .await;
        let Ok(data) = data else {
            continue;
        };
        let state = parse_dram_params(&data).map_err(AppError::from)?;
        if state.dram_init_flag != 0 {
            break Ok(EfexInitDramResult {
                success: state.dram_init_flag != 1,
                dram_init_flag: state.dram_init_flag,
                dram_update_flag: state.dram_update_flag,
                ret_addr: header.ret_addr,
                dram_para: state.dram_para,
            });
        }
    };
    result
}
