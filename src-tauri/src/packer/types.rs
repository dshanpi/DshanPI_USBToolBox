use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartitionEntry {
    pub name: String,
    pub size: u64,
    pub download_file: String,
    pub user_type: u32,
    pub keydata: bool,
    pub encrypt: bool,
    pub verify: bool,
    pub ro: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpinorMergeConfig {
    pub output_path: String,
    pub logic_start: u64,
    pub uboot_start: u64,
    pub partitions: Vec<PartitionEntry>,
    pub firmware_path: String,
    pub nor_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpinorMergeResult {
    pub success: bool,
    pub message: String,
    pub output_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmmcUfsMergeConfig {
    pub output_path: String,
    pub logic_offset: u64,
    pub partitions: Vec<PartitionEntry>,
    pub firmware_path: String,
    pub flash_type: String,
    pub is_secure: bool,
    pub storage_size: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmmcUfsMergeResult {
    pub success: bool,
    pub message: String,
    pub output_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackerProgressEvent {
    pub stage: String,
    pub current: u64,
    pub total: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackerLogEvent {
    pub level: String,
    pub message: String,
}
