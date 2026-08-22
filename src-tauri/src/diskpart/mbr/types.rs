use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MbrPartition {
    pub index: u8,
    pub name: String,
    pub start_lba: u64,
    pub end_lba: u64,
    pub size: u64,
    pub partition_type: u8,
    pub partition_type_name: String,
    pub bootable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MbrInfo {
    pub disk_signature: u32,
    pub partition_count: usize,
    pub sector_size: u64,
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseMbrResult {
    pub success: bool,
    pub message: String,
    pub mbr_info: Option<MbrInfo>,
    pub partitions: Vec<MbrPartition>,
}
