use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FdtProperty {
    pub name: String,
    pub value: Option<String>,
    pub raw_value: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FdtNode {
    pub name: String,
    pub path: String,
    pub properties: Vec<FdtProperty>,
    pub children: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FdtMemoryRegion {
    pub starting_address: u64,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FdtCpu {
    pub name: String,
    pub device_type: Option<String>,
    pub compatible: Vec<String>,
    pub reg: Option<Vec<u8>>,
    pub clock_frequency: Option<u32>,
    pub timebase_frequency: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FdtChosen {
    pub bootargs: Option<String>,
    pub stdout_path: Option<String>,
    pub stdin_path: Option<String>,
    pub linux_initrd_start: Option<u64>,
    pub linux_initrd_end: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FdtRootInfo {
    pub model: Option<String>,
    pub compatible: Vec<String>,
    pub address_cells: Option<u32>,
    pub size_cells: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FdtInfo {
    pub root: FdtRootInfo,
    pub memory_regions: Vec<FdtMemoryRegion>,
    pub cpus: Vec<FdtCpu>,
    pub chosen: FdtChosen,
    pub total_nodes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseFdtResult {
    pub success: bool,
    pub message: String,
    pub fdt_info: Option<FdtInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetNodeResult {
    pub success: bool,
    pub message: String,
    pub node: Option<FdtNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetPropertyResult {
    pub success: bool,
    pub message: String,
    pub property: Option<FdtProperty>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListNodeChildrenResult {
    pub success: bool,
    pub message: String,
    pub children: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateDtsResult {
    pub success: bool,
    pub message: String,
    pub dts: Option<String>,
}
