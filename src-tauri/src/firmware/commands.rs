use super::{
    create_empty_mbr, get_boot_package_item_data, get_boot_package_item_data_by_index,
    get_item_type_name, get_uboot_storage_type, get_uboot_work_mode, is_valid_boot_package,
    is_valid_sunxi_mbr, mbr_add_partition, mbr_add_partition_raw, mbr_clear_partitions,
    mbr_move_partition, mbr_remove_partition, mbr_set_copy, mbr_set_index, mbr_set_version,
    mbr_update_partition, mbr_update_stamp, parse_boot0, parse_boot_package, parse_dram_params,
    parse_image, parse_partition_config, parse_sunxi_mbr, parse_sys_config, parse_uboot,
    read_entry_by_filename, read_entry_by_maintype_subtype, read_entry_range_by_filename,
    read_entry_range_by_maintype_subtype, serialize_boot0, serialize_dram_params, serialize_mbr,
    serialize_mbr_with_copies, serialize_partition_config, set_uboot_storage_type,
    set_uboot_work_mode, sunxi_mbr_to_info, BootFileHeadDto, BootPackageDto, DramParamInfoDto,
    MbrInfoDto, ParseImageResultDto, PartitionConfigDto, PartitionInfoDto, SunxiMbrDto,
    SysConfigDto, UBootHeadDto,
};

#[tauri::command]
pub fn firmware_parse_image(file_path: String) -> Result<ParseImageResultDto, String> {
    parse_image(&file_path)
}

#[tauri::command]
pub fn firmware_read_entry_by_filename(
    file_path: String,
    filename: String,
) -> Result<Option<Vec<u8>>, String> {
    read_entry_by_filename(&file_path, &filename)
}

#[tauri::command]
pub fn firmware_read_entry_by_maintype_subtype(
    file_path: String,
    maintype: String,
    subtype: String,
) -> Result<Option<Vec<u8>>, String> {
    read_entry_by_maintype_subtype(&file_path, &maintype, &subtype)
}

#[tauri::command]
pub fn firmware_read_entry_range_by_filename(
    file_path: String,
    filename: String,
    start: usize,
    length: usize,
) -> Result<Option<Vec<u8>>, String> {
    read_entry_range_by_filename(&file_path, &filename, start, length)
}

#[tauri::command]
pub fn firmware_read_entry_range_by_maintype_subtype(
    file_path: String,
    maintype: String,
    subtype: String,
    start: usize,
    length: usize,
) -> Result<Option<Vec<u8>>, String> {
    read_entry_range_by_maintype_subtype(&file_path, &maintype, &subtype, start, length)
}

#[tauri::command]
pub fn firmware_parse_partition_config(data: Vec<u8>) -> Result<PartitionConfigDto, String> {
    parse_partition_config(&data)
}

#[tauri::command]
pub fn firmware_serialize_partition_config(config: PartitionConfigDto) -> Vec<u8> {
    serialize_partition_config(&config)
}

#[tauri::command]
pub fn firmware_parse_boot0(data: Vec<u8>) -> Result<BootFileHeadDto, String> {
    parse_boot0(&data)
}

#[tauri::command]
pub fn firmware_serialize_boot0(header: BootFileHeadDto) -> Vec<u8> {
    serialize_boot0(&header)
}

#[tauri::command]
pub fn firmware_parse_dram_params(data: Vec<u8>) -> Result<DramParamInfoDto, String> {
    parse_dram_params(&data)
}

#[tauri::command]
pub fn firmware_serialize_dram_params(info: DramParamInfoDto) -> Result<Vec<u8>, String> {
    serialize_dram_params(&info)
}

#[tauri::command]
pub fn firmware_parse_uboot(data: Vec<u8>) -> Result<UBootHeadDto, String> {
    parse_uboot(&data)
}

#[tauri::command]
pub fn firmware_get_uboot_work_mode(data: Vec<u8>) -> Result<u32, String> {
    get_uboot_work_mode(&data)
}

#[tauri::command]
pub fn firmware_get_uboot_storage_type(data: Vec<u8>) -> Result<u32, String> {
    get_uboot_storage_type(&data)
}

#[tauri::command]
pub fn firmware_set_uboot_work_mode(data: Vec<u8>, mode: u32) -> Result<Vec<u8>, String> {
    set_uboot_work_mode(&data, mode)
}

#[tauri::command]
pub fn firmware_set_uboot_storage_type(
    data: Vec<u8>,
    storage_type: u32,
) -> Result<Vec<u8>, String> {
    set_uboot_storage_type(&data, storage_type)
}

#[tauri::command]
pub fn firmware_parse_sys_config(data: Vec<u8>) -> Result<SysConfigDto, String> {
    parse_sys_config(&data)
}

#[tauri::command]
pub fn firmware_parse_sunxi_mbr(data: Vec<u8>) -> Result<SunxiMbrDto, String> {
    parse_sunxi_mbr(&data)
}

#[tauri::command]
pub fn firmware_is_valid_sunxi_mbr(data: Vec<u8>) -> bool {
    is_valid_sunxi_mbr(&data)
}

#[tauri::command]
pub fn firmware_sunxi_mbr_to_info(mbr: SunxiMbrDto) -> MbrInfoDto {
    sunxi_mbr_to_info(&mbr)
}

#[tauri::command]
pub fn firmware_mbr_create_empty() -> SunxiMbrDto {
    create_empty_mbr()
}

#[tauri::command]
pub fn firmware_mbr_add_partition(
    mbr: SunxiMbrDto,
    partition: PartitionInfoDto,
    before_index: Option<usize>,
) -> Result<SunxiMbrDto, String> {
    mbr_add_partition(mbr, partition, before_index)
}

#[tauri::command]
pub fn firmware_mbr_add_partition_raw(
    mbr: SunxiMbrDto,
    partition: PartitionInfoDto,
    before_index: Option<usize>,
) -> Result<SunxiMbrDto, String> {
    mbr_add_partition_raw(mbr, partition, before_index)
}

#[tauri::command]
pub fn firmware_mbr_update_partition(
    mbr: SunxiMbrDto,
    index: usize,
    partition: PartitionInfoDto,
) -> Result<SunxiMbrDto, String> {
    mbr_update_partition(mbr, index, partition)
}

#[tauri::command]
pub fn firmware_mbr_remove_partition(
    mbr: SunxiMbrDto,
    index: usize,
) -> Result<SunxiMbrDto, String> {
    mbr_remove_partition(mbr, index)
}

#[tauri::command]
pub fn firmware_mbr_move_partition(
    mbr: SunxiMbrDto,
    from_index: usize,
    to_index: usize,
) -> Result<SunxiMbrDto, String> {
    mbr_move_partition(mbr, from_index, to_index)
}

#[tauri::command]
pub fn firmware_mbr_clear_partitions(mbr: SunxiMbrDto) -> SunxiMbrDto {
    mbr_clear_partitions(mbr)
}

#[tauri::command]
pub fn firmware_mbr_set_copy(mbr: SunxiMbrDto, copy: u32) -> SunxiMbrDto {
    mbr_set_copy(mbr, copy)
}

#[tauri::command]
pub fn firmware_mbr_set_version(mbr: SunxiMbrDto, version: u32) -> SunxiMbrDto {
    mbr_set_version(mbr, version)
}

#[tauri::command]
pub fn firmware_mbr_set_index(mbr: SunxiMbrDto, index: u32) -> SunxiMbrDto {
    mbr_set_index(mbr, index)
}

#[tauri::command]
pub fn firmware_mbr_update_stamp(mbr: SunxiMbrDto) -> SunxiMbrDto {
    mbr_update_stamp(mbr)
}

#[tauri::command]
pub fn firmware_mbr_serialize(mbr: SunxiMbrDto) -> Result<Vec<u8>, String> {
    serialize_mbr(&mbr)
}

#[tauri::command]
pub fn firmware_mbr_serialize_with_copies(
    mbr: SunxiMbrDto,
    copy_count: Option<u32>,
) -> Result<Vec<u8>, String> {
    serialize_mbr_with_copies(&mbr, copy_count)
}

// Boot package (TOC1) commands

#[tauri::command]
pub fn firmware_parse_boot_package(data: Vec<u8>) -> Result<BootPackageDto, String> {
    parse_boot_package(&data)
}

#[tauri::command]
pub fn firmware_is_valid_boot_package(data: Vec<u8>) -> bool {
    is_valid_boot_package(&data)
}

#[tauri::command]
pub fn firmware_get_boot_package_item_data(
    data: Vec<u8>,
    item_name: String,
) -> Result<Option<Vec<u8>>, String> {
    get_boot_package_item_data(&data, &item_name)
}

#[tauri::command]
pub fn firmware_get_boot_package_item_data_by_index(
    data: Vec<u8>,
    index: usize,
) -> Result<Option<Vec<u8>>, String> {
    get_boot_package_item_data_by_index(&data, index)
}

#[tauri::command]
pub fn firmware_get_item_type_name(item_type: u32) -> String {
    get_item_type_name(item_type).to_string()
}
