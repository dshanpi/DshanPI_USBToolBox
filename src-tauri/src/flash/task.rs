use super::types::{
    FlashConfirmRequestEvent, FlashDramInfoEvent, FlashLogEvent, FlashMode, FlashOptions,
    FlashPopupEvent, FlashProgressEvent, FlashStartResult, FlashStateEvent, PostFlashAction,
};
use crate::app_error::AppError;
use crate::efex::commands::service::{run_device_blocking, run_device_blocking_with_timeout};
use crate::efex::commands::{
    efex_fel_exec, efex_fel_init_dram, efex_fel_write_with_timeout, efex_fes_down,
    efex_fes_probe_flash_size, efex_fes_query_secure, efex_fes_query_storage, efex_fes_tool_mode,
    efex_fes_verify_status, efex_get_device_mode, efex_scan_devices,
};
use crate::firmware::types::{FileInfoDto, MbrInfoDto, PartitionConfigDto};
use crate::firmware::{
    parse_image, parse_partition_config, parse_sunxi_mbr, parse_sys_config, parse_uboot,
    read_entry_by_filename, read_entry_by_maintype_subtype, read_entry_range_by_filename,
    read_entry_range_by_maintype_subtype, set_uboot_work_mode, sunxi_mbr_to_info,
};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::oneshot;

mod context;
mod download;
mod download_types;
mod events;
mod fel;
mod fes;
mod progress;
mod run;
mod sparse;
mod transfer;

use context::*;
use download::{
    download_partition_from_file as download_from_file_impl,
    download_partition_from_image as download_from_image_impl,
};
use download_types::*;
use events::*;
use fel::*;
use fes::*;
use progress::*;
use run::*;
use transfer::*;

const EVENT_FLASH_PROGRESS: &str = "flash-progress";
const EVENT_FLASH_LOG: &str = "flash-log";
const EVENT_FLASH_STATE: &str = "flash-state";
const EVENT_FLASH_POPUP: &str = "flash-popup";
const EVENT_FLASH_CONFIRM_REQUEST: &str = "flash-confirm-request";
const EVENT_FLASH_DRAM_INFO: &str = "flash-dram-info";

pub const STATUS_STARTED: &str = "started";
pub const STATUS_COMPLETED: &str = "completed";
pub const STATUS_FAILED: &str = "failed";
pub const STATUS_CANCELLED: &str = "cancelled";

const LEVEL_INFO: &str = "info";
const LEVEL_WARN: &str = "warn";

const STORAGE_NAND: i32 = 0;
const STORAGE_SDCARD: i32 = 1;
const STORAGE_EMMC: i32 = 2;
const STORAGE_SPINOR: i32 = 3;
const STORAGE_EMMC3: i32 = 4;
const STORAGE_SPINAND: i32 = 5;
const STORAGE_SD1: i32 = 6;
const STORAGE_EMMC0: i32 = 7;
const STORAGE_UFS: i32 = 8;
const STORAGE_AUTO: i32 = -1;

const BOOT_MODE_NORMAL: u32 = 0;
const BOOT_MODE_TOC: u32 = 1;
const BOOT_MODE_PKG: u32 = 4;

const TOOL_MODE_NORMAL: u32 = 0x1;
const TOOL_MODE_REBOOT: u32 = 0x2;
const TOOL_MODE_POWEROFF: u32 = 0x3;

const WORK_MODE_USB_PRODUCT: u32 = 0x10;
const EFEX_CRC32_VALID_FLAG: u32 = 0x6a617603;

const FES_MBR_TAG: u32 = 0x7f01;
const FES_ERASE_TAG: u32 = 0x7f04;
const FES_EXT4_UBIFS_TAG: u32 = 0x7ff0;

const IMAGE_ENTRY_FES: (&str, &str) = ("FES     ", "FES_1-0000000000");
const IMAGE_ENTRY_UBOOT: (&str, &str) = ("12345678", "UBOOT_0000000000");
const IMAGE_ENTRY_MBR: (&str, &str) = ("12345678", "1234567890___MBR");
const IMAGE_ENTRY_SYS_CONFIG: (&str, &str) = ("COMMON  ", "SYS_CONFIG100000");
const IMAGE_ENTRY_SYS_CONFIG_BIN: (&str, &str) = ("COMMON  ", "SYS_CONFIG_BIN00");
const IMAGE_ENTRY_SYS_PARTITION: (&str, &str) = ("COMMON  ", "SYS_CONFIG000000");
const IMAGE_ENTRY_BOARD_CONFIG: (&str, &str) = ("COMMON  ", "BOARD_CONFIG_BIN");
const IMAGE_ENTRY_DTB: (&str, &str) = ("COMMON  ", "DTB_CONFIG000000");

const ITEM_ROOTFSFAT16: &str = "RFSFAT16";
const PARTITION_DOWNLOADFILE_SUFFIX: &str = "0000000000";
const UBIFS_NODE_MAGIC: u32 = 0x0610_1831;

const UBOOT_MAX_LEN: u32 = 2 * 1024 * 1024;
const DTB_MAX_LEN: u32 = 1024 * 1024;
const SYS_CONFIG_BIN_MAX_LEN: u32 = 512 * 1024;

const MODE_RECONNECT_DELAY: Duration = Duration::from_secs(2);
const MODE_RETRY_INTERVAL: Duration = Duration::from_secs(1);
const MAX_MODE_RETRIES: usize = 25;
const MAX_VERIFY_RETRIES: usize = 5;

#[derive(Clone)]
pub(super) struct ActiveTask {
    id: u64,
    cancel: Arc<AtomicBool>,
    confirms: Arc<Mutex<HashMap<u64, oneshot::Sender<bool>>>>,
}

#[derive(Clone, Copy)]
pub(super) struct StageDef {
    id: &'static str,
    label: &'static str,
    weight: u32,
}

pub(super) struct ProgressReporter<R: Runtime> {
    app_handle: AppHandle<R>,
    task_id: u64,
    stages: Vec<StageDef>,
    current_index: usize,
    stage_percent: f64,
    current_partition: Option<String>,
    completed_partitions: Vec<String>,
    partition_percent: Option<f64>,
    written_bytes: Option<u64>,
    total_bytes: Option<u64>,
    indeterminate: bool,
}

pub(super) struct DownloadProgressContext<R: Runtime> {
    app_handle: AppHandle<R>,
    task_id: u64,
    stage_id: String,
    stage_label: String,
    completed_weight: u32,
    stage_weight: u32,
    total_weight: u32,
    transfer_base_bytes: u64,
    transfer_total_bytes: Option<u64>,
    current_partition: Option<String>,
    completed_partitions: Vec<String>,
}

impl<R: Runtime> Clone for DownloadProgressContext<R> {
    fn clone(&self) -> Self {
        Self {
            app_handle: self.app_handle.clone(),
            task_id: self.task_id,
            stage_id: self.stage_id.clone(),
            stage_label: self.stage_label.clone(),
            completed_weight: self.completed_weight,
            stage_weight: self.stage_weight,
            total_weight: self.total_weight,
            transfer_base_bytes: self.transfer_base_bytes,
            transfer_total_bytes: self.transfer_total_bytes,
            current_partition: self.current_partition.clone(),
            completed_partitions: self.completed_partitions.clone(),
        }
    }
}

pub(super) struct FlashSession {
    device_id: Option<u32>,
    bus: u8,
    port: u8,
    image_path: String,
    options: FlashOptions,
}

#[derive(Clone)]
pub(super) enum PartitionSource {
    Firmware {
        filename: String,
        subtype: String,
        offset: u64,
        length: u64,
    },
    ExternalFile {
        path: String,
    },
}

#[derive(Clone)]
pub(super) struct PartitionPlanItem {
    partition: PartitionInfo,
    source: PartitionSource,
}

pub(super) struct ImageContext {
    files_by_name: HashMap<String, FileInfoDto>,
    files_by_type: HashMap<(String, String), FileInfoDto>,
}

lazy_static::lazy_static! {
    static ref ACTIVE_TASKS: Mutex<HashMap<u64, ActiveTask>> = Mutex::new(HashMap::new());
}

static NEXT_TASK_ID: AtomicU64 = AtomicU64::new(1);
static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

pub fn start<R: Runtime>(
    app_handle: AppHandle<R>,
    device_id: u32,
    bus: u8,
    port: u8,
    image_path: String,
    options: FlashOptions,
) -> Result<FlashStartResult, AppError> {
    let task_id = NEXT_TASK_ID.fetch_add(1, Ordering::SeqCst);
    let active = ActiveTask {
        id: task_id,
        cancel: Arc::new(AtomicBool::new(false)),
        confirms: Arc::new(Mutex::new(HashMap::new())),
    };

    ACTIVE_TASKS.lock().unwrap().insert(task_id, active.clone());

    tauri::async_runtime::spawn(async move {
        emit_state(
            &app_handle,
            task_id,
            STATUS_STARTED,
            Some("Flash task started"),
            None,
        );

        let result = run_flash_task(
            app_handle.clone(),
            active.clone(),
            FlashSession {
                device_id: Some(device_id),
                bus,
                port,
                image_path,
                options,
            },
        )
        .await;

        match result {
            Ok(()) => emit_state(
                &app_handle,
                task_id,
                STATUS_COMPLETED,
                Some("Flash completed"),
                None,
            ),
            Err(error) if error.code == -1000 => {
                let message = error.message.clone();
                emit_state(
                    &app_handle,
                    task_id,
                    STATUS_CANCELLED,
                    Some(&message),
                    Some(error),
                )
            }
            Err(error) => {
                let message = error.message.clone();
                emit_state(
                    &app_handle,
                    task_id,
                    STATUS_FAILED,
                    Some(&message),
                    Some(error),
                )
            }
        }

        clear_active_task(task_id);
    });

    Ok(FlashStartResult { task_id })
}

pub fn cancel(task_id: u64) -> Result<(), AppError> {
    let active = ACTIVE_TASKS.lock().unwrap().get(&task_id).cloned();
    let Some(active) = active else {
        return Err(AppError::from("Flash task not found"));
    };
    active.cancel.store(true, Ordering::SeqCst);
    let pending: Vec<_> = active
        .confirms
        .lock()
        .unwrap()
        .drain()
        .map(|(_, sender)| sender)
        .collect();
    for sender in pending {
        let _ = sender.send(false);
    }
    Ok(())
}

pub fn confirm(task_id: u64, request_id: u64, confirmed: bool) -> Result<(), AppError> {
    let active = ACTIVE_TASKS.lock().unwrap().get(&task_id).cloned();
    let Some(active) = active else {
        return Err(AppError::from("Flash task not found"));
    };

    let sender = active.confirms.lock().unwrap().remove(&request_id);
    let Some(sender) = sender else {
        return Err(AppError::from("Flash confirmation request not found"));
    };
    let _ = sender.send(confirmed);
    Ok(())
}

fn clear_active_task(task_id: u64) {
    ACTIVE_TASKS.lock().unwrap().remove(&task_id);
}

#[cfg(windows)]
pub(crate) fn is_flash_task_active() -> bool {
    !ACTIVE_TASKS.lock().unwrap().is_empty()
}

pub(super) fn check_cancelled(active: &ActiveTask) -> Result<(), AppError> {
    if active.cancel.load(Ordering::SeqCst) {
        return Err(AppError {
            code: -1000,
            name: "Cancelled".to_string(),
            message: "Flash operation cancelled".to_string(),
        });
    }
    Ok(())
}
