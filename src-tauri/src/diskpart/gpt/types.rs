use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GptPartition {
    pub name: String,
    pub start_lba: u64,
    pub end_lba: u64,
    pub size: u64,
    pub partition_type_guid: String,
    pub partition_guid: String,
    pub attributes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GptHeader {
    pub disk_guid: String,
    pub first_usable_lba: u64,
    pub last_usable_lba: u64,
    pub partition_count: u32,
    pub partition_entry_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GptInfo {
    pub header: GptHeader,
    pub partitions: Vec<GptPartition>,
    pub sector_size: u64,
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseGptResult {
    pub success: bool,
    pub message: String,
    pub gpt_info: Option<GptInfo>,
}
