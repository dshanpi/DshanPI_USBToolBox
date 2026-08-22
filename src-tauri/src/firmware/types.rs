use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageHeaderV1Dto {
    pub pid: u32,
    pub vid: u32,
    pub hardware_id: u32,
    pub firmware_id: u32,
    pub val1: u32,
    pub val1024: u32,
    pub num_files: u32,
    pub val1024_2: u32,
    pub val0: u32,
    pub val0_2: u32,
    pub val0_3: u32,
    pub val0_4: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageHeaderV3Dto {
    pub unknown: u32,
    pub pid: u32,
    pub vid: u32,
    pub hardware_id: u32,
    pub firmware_id: u32,
    pub val1: u32,
    pub val1024: u32,
    pub num_files: u32,
    pub val1024_2: u32,
    pub val0: u32,
    pub val0_2: u32,
    pub val0_3: u32,
    pub val0_4: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageHeaderDto {
    pub magic: String,
    pub header_version: u32,
    pub header_size: u32,
    pub ram_base: u32,
    pub version: u32,
    pub image_size: u32,
    pub image_header_size: u32,
    pub v1: Option<ImageHeaderV1Dto>,
    pub v3: Option<ImageHeaderV3Dto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileHeaderV1Dto {
    pub unknown_3: u32,
    pub stored_length: u32,
    pub original_length: u32,
    pub offset: u32,
    pub unknown: u32,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileHeaderV3Dto {
    pub unknown_0: u32,
    pub filename: String,
    pub stored_length: u32,
    pub pad1: u32,
    pub original_length: u32,
    pub pad2: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileHeaderDto {
    pub filename_len: u32,
    pub total_header_size: u32,
    pub maintype: String,
    pub subtype: String,
    pub v1: Option<FileHeaderV1Dto>,
    pub v3: Option<FileHeaderV3Dto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfoDto {
    pub filename: String,
    pub maintype: String,
    pub subtype: String,
    pub stored_length: u32,
    pub original_length: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfoDto {
    pub header: ImageHeaderDto,
    pub files: Vec<FileInfoDto>,
    pub is_encrypted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseImageResultDto {
    pub image_info: Option<ImageInfoDto>,
    pub file_headers: Vec<FileHeaderDto>,
    pub is_encrypted: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartitionDto {
    pub name: String,
    pub size: u64,
    pub downloadfile: String,
    pub user_type: u32,
    pub keydata: bool,
    pub encrypt: bool,
    pub verify: bool,
    pub ro: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartitionConfigDto {
    pub mbr_size: u64,
    pub partitions: Vec<PartitionDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootFileHeadDto {
    pub jump_instruction: u32,
    pub magic: String,
    pub check_sum: u32,
    pub length: u32,
    pub pub_head_size: u32,
    pub pub_head_vsn: Vec<u8>,
    pub ret_addr: u32,
    pub run_addr: u32,
    pub boot_cpu: u32,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DramParamInfoDto {
    pub dram_init_flag: u32,
    pub dram_update_flag: u32,
    pub dram_para: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UBootNormalGpioCfgDto {
    pub port: u8,
    pub port_num: u8,
    pub mul_sel: u8,
    pub pull: u8,
    pub drv_level: u8,
    pub data: u8,
    pub reserved: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UBootBaseHeadDto {
    pub jump_instruction: u32,
    pub magic: String,
    pub check_sum: u32,
    pub align_size: u32,
    pub length: u32,
    pub uboot_length: u32,
    pub version: String,
    pub platform: String,
    pub run_addr: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UBootDataHeadDto {
    pub dram_para: Vec<u32>,
    pub run_clock: i32,
    pub run_core_vol: i32,
    pub uart_port: i32,
    pub uart_gpio: Vec<UBootNormalGpioCfgDto>,
    pub twi_port: i32,
    pub twi_gpio: Vec<UBootNormalGpioCfgDto>,
    pub work_mode: i32,
    pub storage_type: i32,
    pub nand_gpio: Vec<UBootNormalGpioCfgDto>,
    pub nand_spare_data: Vec<u8>,
    pub sdcard_gpio: Vec<UBootNormalGpioCfgDto>,
    pub sdcard_spare_data: Vec<u8>,
    pub secureos_exist: u8,
    pub monitor_exist: u8,
    pub func_mask: u8,
    pub uboot_backup: u8,
    pub uboot_start_sector_in_mmc: u32,
    pub dtb_offset: i32,
    pub boot_package_size: i32,
    pub dram_scan_size: u32,
    pub reserved: Vec<i32>,
    pub pmu_type: u16,
    pub uart_input: u16,
    pub key_input: u16,
    pub secure_mode: u8,
    pub debug_mode: u8,
    pub reserved2: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UBootExtHeadDto {
    pub data: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UBootHeadDto {
    pub uboot_head: UBootBaseHeadDto,
    pub uboot_data: UBootDataHeadDto,
    pub uboot_ext: Vec<UBootExtHeadDto>,
    pub hash: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpioConfigDto {
    pub port: String,
    pub bank: String,
    pub pin: u32,
    pub function: u32,
    pub pull: String,
    pub drive: String,
    pub level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwiParaDto {
    pub twi_port: i32,
    pub twi_scl: Option<GpioConfigDto>,
    pub twi_sda: Option<GpioConfigDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UartParaDto {
    pub uart_baud_rate: i32,
    pub uart_debug_port: i32,
    pub uart_debug_tx: Option<GpioConfigDto>,
    pub uart_debug_rx: Option<GpioConfigDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SysConfigDto {
    pub debug_mode: i32,
    pub storage_type: i32,
    pub twi_para: TwiParaDto,
    pub uart_para: UartParaDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SunxiPartitionDto {
    pub addrhi: u32,
    pub addrlo: u32,
    pub lenhi: u32,
    pub lenlo: u32,
    pub classname: String,
    pub name: String,
    pub user_type: u32,
    pub keydata: u32,
    pub ro: u32,
    pub res: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartitionInfoDto {
    pub name: String,
    pub classname: String,
    pub address: String,
    pub length: String,
    pub user_type: u32,
    pub keydata: u32,
    pub readonly: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MbrInfoDto {
    pub crc32: u32,
    pub version: u32,
    pub magic: String,
    pub copy: u32,
    pub index: u32,
    pub part_count: u32,
    pub partitions: Vec<PartitionInfoDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SunxiMbrDto {
    pub crc32: u32,
    pub version: u32,
    pub magic: String,
    pub copy: u32,
    pub index: u32,
    pub part_count: u32,
    pub stamp: Vec<u32>,
    pub array: Vec<SunxiPartitionDto>,
    pub res: Vec<u8>,
}

/// TOC1 item entry (sbrom_toc1_item_info_t)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Toc1ItemDto {
    /// Item name (e.g., "u-boot", "dtb", "opensbi")
    pub name: String,
    /// Offset to item data from package start
    pub data_offset: u32,
    /// Length of item data
    pub data_len: u32,
    /// Encryption flag (0=no AES, 1=AES encrypted)
    pub encrypt: u32,
    /// Item type (0=normal, 1=key cert, 2=sign cert, 3=bin file)
    pub item_type: u32,
    /// Run address for executable items
    pub run_addr: u32,
    /// Execution index for bin files
    pub index: u32,
}

/// TOC1 boot package header (sbrom_toc1_head_info_t)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootPackageDto {
    /// Package name, typically "sunxi-secure"
    pub name: String,
    /// Magic number (0x89119800)
    pub magic: u32,
    /// Checksum
    pub add_sum: u32,
    /// Serial number
    pub serial_num: u32,
    /// Status flags
    pub status: u32,
    /// Number of items in package
    pub items_nr: u32,
    /// Valid length of package
    pub valid_len: u32,
    /// Main version
    pub version_main: u32,
    /// Sub version
    pub version_sub: u32,
    /// Items list
    pub items: Vec<Toc1ItemDto>,
}
