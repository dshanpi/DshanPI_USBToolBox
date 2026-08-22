use crate::app_error::AppError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlashMode {
    Bootloader,
    Partition,
    KeepData,
    PartitionErase,
    FullErase,
    EraseOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PostFlashAction {
    Reboot,
    Poweroff,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashPartitionConfig {
    pub name: String,
    pub size: u64,
    pub downloadfile: String,
    pub user_type: u32,
    pub keydata: bool,
    pub encrypt: bool,
    pub verify: bool,
    pub ro: bool,
    #[serde(default, alias = "customFilePath")]
    pub custom_file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashOptions {
    pub mode: FlashMode,
    pub partitions: Option<Vec<String>>,
    pub verify_download: bool,
    pub post_flash_action: PostFlashAction,
    pub mbr_data: Option<Vec<u8>>,
    pub partition_config: Option<Vec<FlashPartitionConfig>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashStartResult {
    pub task_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashProgressEvent {
    pub task_id: u64,
    pub stage_id: String,
    pub stage_label: String,
    pub stage_percent: f64,
    pub overall_percent: f64,
    pub current_partition: Option<String>,
    pub completed_partitions: Vec<String>,
    pub partition_percent: Option<f64>,
    pub written_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub indeterminate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashLogEvent {
    pub task_id: u64,
    pub level: String,
    pub message: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashStateEvent {
    pub task_id: u64,
    pub status: String,
    pub message: Option<String>,
    pub error: Option<AppError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashPopupEvent {
    pub task_id: u64,
    pub popup_type: String,
    pub title: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashConfirmRequestEvent {
    pub task_id: u64,
    pub request_id: u64,
    pub kind: String,
    pub title: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashDramInfoEvent {
    pub task_id: u64,
    pub ret_addr: u32,
    pub dram_init_flag: u32,
    pub dram_update_flag: u32,
    pub dram_para: Vec<u32>,
}
