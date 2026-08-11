import { invokeCommand } from './Client';

/**
 * Parses a firmware image file.
 *
 * Reads and parses IMAGEWTY format firmware, returning image info
 * and file headers for all contained partitions.
 *
 * @param filePath - Path to firmware image file
 * @returns Parsed image info, file headers, and encryption status
 */
export async function ipcParseFirmwareImage(filePath: string) {
  return invokeCommand('firmware_parse_image', { filePath });
}

/**
 * Reads a firmware entry by filename.
 *
 * Extracts the complete binary data for a file within the firmware
 * image, identified by its filename.
 *
 * @param filePath - Path to firmware image file
 * @param filename - Filename of entry to read
 * @returns Binary data as number array, or null if not found
 */
export async function ipcReadFirmwareEntryByFilename(filePath: string, filename: string) {
  return invokeCommand('firmware_read_entry_by_filename', { filePath, filename });
}

/**
 * Reads a firmware entry by maintype and subtype.
 *
 * Extracts the complete binary data for a file within the firmware
 * image, identified by its maintype and subtype strings.
 *
 * @param filePath - Path to firmware image file
 * @param maintype - Main type string (e.g., ' bootloader')
 * @param subtype - Sub type string (e.g., 'uboot')
 * @returns Binary data as number array, or null if not found
 */
export async function ipcReadFirmwareEntryByMaintypeSubtype(
  filePath: string,
  maintype: string,
  subtype: string
) {
  return invokeCommand('firmware_read_entry_by_maintype_subtype', { filePath, maintype, subtype });
}

/**
 * Reads a range of firmware entry data by filename.
 *
 * Extracts a portion of binary data from a file within the firmware
 * image, useful for reading headers or partial content.
 *
 * @param filePath - Path to firmware image file
 * @param filename - Filename of entry to read
 * @param start - Byte offset to start reading from
 * @param length - Number of bytes to read
 * @returns Binary data as number array, or null if not found
 */
export async function ipcReadFirmwareEntryRangeByFilename(
  filePath: string,
  filename: string,
  start: number,
  length: number
) {
  return invokeCommand('firmware_read_entry_range_by_filename', {
    filePath,
    filename,
    start,
    length,
  });
}

/**
 * Reads a range of firmware entry data by maintype and subtype.
 *
 * Extracts a portion of binary data from a file within the firmware
 * image, identified by maintype and subtype.
 *
 * @param filePath - Path to firmware image file
 * @param maintype - Main type string
 * @param subtype - Sub type string
 * @param start - Byte offset to start reading from
 * @param length - Number of bytes to read
 * @returns Binary data as number array, or null if not found
 */
export async function ipcReadFirmwareEntryRangeByMaintypeSubtype(
  filePath: string,
  maintype: string,
  subtype: string,
  start: number,
  length: number
) {
  return invokeCommand('firmware_read_entry_range_by_maintype_subtype', {
    filePath,
    maintype,
    subtype,
    start,
    length,
  });
}

/**
 * Parses partition configuration binary data.
 *
 * Decodes the partition table format used in Allwinner firmware,
 * returning partition definitions with sizes and attributes.
 *
 * @param data - Binary partition config data
 * @returns Parsed partition configuration object
 */
export async function ipcParsePartitionConfig(data: Uint8Array) {
  return invokeCommand('firmware_parse_partition_config', { data: Array.from(data) });
}

/**
 * Serializes partition configuration to binary format.
 *
 * Converts a partition configuration object back to the binary
 * format used in Allwinner firmware.
 *
 * @param config - Partition configuration object
 * @returns Binary partition config data
 */
export async function ipcSerializePartitionConfig(config: unknown): Promise<Uint8Array> {
  const data = await invokeCommand('firmware_serialize_partition_config', { config });
  return new Uint8Array(data);
}

/**
 * Parses Boot0 header from binary data.
 *
 * Boot0 is the first-stage bootloader that initializes hardware
 * and loads Boot1/U-Boot from storage.
 *
 * @param data - Binary Boot0 data
 * @returns Parsed Boot0 header structure
 */
export async function ipcParseBoot0(data: Uint8Array) {
  return invokeCommand('firmware_parse_boot0', { data: Array.from(data) });
}

/**
 * Serializes Boot0 header to binary format.
 *
 * Converts a Boot0 header structure back to binary format
 * for writing to firmware images.
 *
 * @param header - Boot0 header structure
 * @returns Binary Boot0 data
 */
export async function ipcSerializeBoot0(header: unknown): Promise<Uint8Array> {
  const data = await invokeCommand('firmware_serialize_boot0', { header });
  return new Uint8Array(data);
}

/**
 * Parses DRAM parameter data.
 *
 * DRAM parameters define memory controller configuration for
 * the SoC, critical for proper memory initialization.
 *
 * @param data - Binary DRAM parameter data
 * @returns Parsed DRAM parameter structure
 */
export async function ipcParseDramParams(data: Uint8Array) {
  return invokeCommand('firmware_parse_dram_params', { data: Array.from(data) });
}

/**
 * Serializes DRAM parameters to binary format.
 *
 * Converts DRAM parameter structure back to binary format
 * for use in firmware or DRAM tuning.
 *
 * @param info - DRAM parameter structure
 * @returns Binary DRAM parameter data
 */
export async function ipcSerializeDramParams(info: unknown): Promise<Uint8Array> {
  const data = await invokeCommand('firmware_serialize_dram_params', { info });
  return new Uint8Array(data);
}

/**
 * Parses U-Boot binary data.
 *
 * U-Boot is the second-stage bootloader that provides
 * full system initialization and kernel loading.
 *
 * @param data - Binary U-Boot data
 * @returns Parsed U-Boot structure
 */
export async function ipcParseUboot(data: Uint8Array) {
  return invokeCommand('firmware_parse_uboot', { data: Array.from(data) });
}

/**
 * Gets U-Boot work mode from binary data.
 *
 * Work mode determines U-Boot's operational behavior
 * (e.g., normal boot, upgrade mode, debug mode).
 *
 * @param data - Binary U-Boot data
 * @returns Work mode value
 */
export async function ipcGetUbootWorkMode(data: Uint8Array) {
  return invokeCommand('firmware_get_uboot_work_mode', { data: Array.from(data) });
}

/**
 * Gets U-Boot storage type from binary data.
 *
 * Storage type identifies the target storage medium
 * (e.g., SPI NOR, eMMC, SD card).
 *
 * @param data - Binary U-Boot data
 * @returns Storage type value
 */
export async function ipcGetUbootStorageType(data: Uint8Array) {
  return invokeCommand('firmware_get_uboot_storage_type', { data: Array.from(data) });
}

/**
 * Sets U-Boot work mode in binary data.
 *
 * Modifies the U-Boot binary to change its operational mode,
 * useful for configuring firmware for specific use cases.
 *
 * @param data - Binary U-Boot data
 * @param mode - New work mode value
 * @returns Modified binary U-Boot data
 */
export async function ipcSetUbootWorkMode(data: Uint8Array, mode: number): Promise<Uint8Array> {
  const result = await invokeCommand('firmware_set_uboot_work_mode', {
    data: Array.from(data),
    mode,
  });
  return new Uint8Array(result);
}

/**
 * Sets U-Boot storage type in binary data.
 *
 * Modifies the U-Boot binary to target a specific storage medium,
 * required when building firmware for different boot sources.
 *
 * @param data - Binary U-Boot data
 * @param storageType - New storage type value
 * @returns Modified binary U-Boot data
 */
export async function ipcSetUbootStorageType(
  data: Uint8Array,
  storageType: number
): Promise<Uint8Array> {
  const result = await invokeCommand('firmware_set_uboot_storage_type', {
    data: Array.from(data),
    storageType,
  });
  return new Uint8Array(result);
}

/**
 * Parses sys_config.bin data.
 *
 * Sys_config defines board-level hardware configuration including
 * GPIO assignments, peripheral settings, and power management.
 *
 * @param data - Binary sys_config data
 * @returns Parsed sys_config structure
 */
export async function ipcParseSysConfig(data: Uint8Array) {
  return invokeCommand('firmware_parse_sys_config', { data: Array.from(data) });
}

/**
 * Parses sunxi MBR (Master Boot Record) data.
 *
 * Sunxi MBR is Allwinner's partition table format, containing
 * partition definitions for flash storage layout.
 *
 * @param data - Binary MBR data
 * @returns Parsed MBR structure
 */
export async function ipcParseSunxiMbr(data: Uint8Array) {
  return invokeCommand('firmware_parse_sunxi_mbr', { data: Array.from(data) });
}

/**
 * Validates sunxi MBR data.
 *
 * Checks if the provided binary data contains a valid
 * Allwinner MBR structure.
 *
 * @param data - Binary MBR data to validate
 * @returns True if data is valid sunxi MBR
 */
export async function ipcIsValidSunxiMbr(data: Uint8Array) {
  return invokeCommand('firmware_is_valid_sunxi_mbr', { data: Array.from(data) });
}

/**
 * Converts sunxi MBR to partition info format.
 *
 * Transforms the MBR structure into a human-readable
 * partition information format.
 *
 * @param mbr - MBR structure to convert
 * @returns Partition info structure
 */
export async function ipcSunxiMbrToInfo(mbr: unknown) {
  return invokeCommand('firmware_sunxi_mbr_to_info', { mbr });
}

/**
 * Creates an empty sunxi MBR structure.
 *
 * Returns a new MBR with default headers but no partitions,
 * ready for adding partition entries.
 *
 * @returns Empty MBR structure
 */
export async function ipcCreateEmptyMbr() {
  return invokeCommand('firmware_mbr_create_empty');
}

/**
 * Adds a partition to sunxi MBR.
 *
 * Inserts a new partition entry into the MBR, optionally
 * before a specific index position.
 *
 * @param mbr - MBR structure to modify
 * @param partition - Partition definition to add
 * @param beforeIndex - Optional index to insert before
 * @returns Modified MBR structure
 */
export async function ipcMbrAddPartition(mbr: unknown, partition: unknown, beforeIndex?: number) {
  return invokeCommand('firmware_mbr_add_partition', { mbr, partition, beforeIndex });
}

/**
 * Adds a partition to sunxi MBR with raw parameters.
 *
 * Similar to ipcMbrAddPartition but accepts raw partition
 * parameters instead of a structured partition object.
 *
 * @param mbr - MBR structure to modify
 * @param partition - Raw partition parameters
 * @param beforeIndex - Optional index to insert before
 * @returns Modified MBR structure
 */
export async function ipcMbrAddPartitionRaw(
  mbr: unknown,
  partition: unknown,
  beforeIndex?: number
) {
  return invokeCommand('firmware_mbr_add_partition_raw', { mbr, partition, beforeIndex });
}

/**
 * Updates an existing partition in sunxi MBR.
 *
 * Replaces the partition at the specified index with
 * a new partition definition.
 *
 * @param mbr - MBR structure to modify
 * @param index - Index of partition to update
 * @param partition - New partition definition
 * @returns Modified MBR structure
 */
export async function ipcMbrUpdatePartition(mbr: unknown, index: number, partition: unknown) {
  return invokeCommand('firmware_mbr_update_partition', { mbr, index, partition });
}

/**
 * Removes a partition from sunxi MBR.
 *
 * Deletes the partition at the specified index from
 * the MBR structure.
 *
 * @param mbr - MBR structure to modify
 * @param index - Index of partition to remove
 * @returns Modified MBR structure
 */
export async function ipcMbrRemovePartition(mbr: unknown, index: number) {
  return invokeCommand('firmware_mbr_remove_partition', { mbr, index });
}

/**
 * Moves a partition to a different position in sunxi MBR.
 *
 * Relocates the partition at fromIndex to toIndex,
 * shifting other partitions as needed.
 *
 * @param mbr - MBR structure to modify
 * @param fromIndex - Current index of partition
 * @param toIndex - Target index for partition
 * @returns Modified MBR structure
 */
export async function ipcMbrMovePartition(mbr: unknown, fromIndex: number, toIndex: number) {
  return invokeCommand('firmware_mbr_move_partition', { mbr, fromIndex, toIndex });
}

/**
 * Clears all partitions from sunxi MBR.
 *
 * Removes all partition entries, leaving an empty MBR
 * with only header information.
 *
 * @param mbr - MBR structure to clear
 * @returns Modified MBR structure
 */
export async function ipcMbrClearPartitions(mbr: unknown) {
  return invokeCommand('firmware_mbr_clear_partitions', { mbr });
}

/**
 * Sets the copy count for sunxi MBR.
 *
 * The copy count determines how many MBR copies are stored
 * on flash for redundancy.
 *
 * @param mbr - MBR structure to modify
 * @param copy - Number of copies to store
 * @returns Modified MBR structure
 */
export async function ipcMbrSetCopy(mbr: unknown, copy: number) {
  return invokeCommand('firmware_mbr_set_copy', { mbr, copy });
}

/**
 * Sets the version number for sunxi MBR.
 *
 * MBR version is used for compatibility checking
 * and firmware updates.
 *
 * @param mbr - MBR structure to modify
 * @param version - Version number to set
 * @returns Modified MBR structure
 */
export async function ipcMbrSetVersion(mbr: unknown, version: number) {
  return invokeCommand('firmware_mbr_set_version', { mbr, version });
}

/**
 * Sets the index for sunxi MBR.
 *
 * MBR index identifies which MBR copy is being modified,
 * relevant when multiple copies exist.
 *
 * @param mbr - MBR structure to modify
 * @param index - Index number to set
 * @returns Modified MBR structure
 */
export async function ipcMbrSetIndex(mbr: unknown, index: number) {
  return invokeCommand('firmware_mbr_set_index', { mbr, index });
}

/**
 * Updates the timestamp stamp in sunxi MBR.
 *
 * MBR stamp contains a timestamp used for tracking
 * firmware modification times.
 *
 * @param mbr - MBR structure to modify
 * @returns Modified MBR structure
 */
export async function ipcMbrUpdateStamp(mbr: unknown) {
  return invokeCommand('firmware_mbr_update_stamp', { mbr });
}

/**
 * Serializes sunxi MBR to binary format.
 *
 * Converts the MBR structure to binary data suitable
 * for writing to firmware images or flash storage.
 *
 * @param mbr - MBR structure to serialize
 * @returns Binary MBR data
 */
export async function ipcSerializeMbr(mbr: unknown): Promise<Uint8Array> {
  const data = await invokeCommand('firmware_mbr_serialize', { mbr });
  return new Uint8Array(data);
}

/**
 * Serializes sunxi MBR with multiple copies to binary format.
 *
 * Generates binary data containing the specified number of
 * MBR copies for redundant storage on flash.
 *
 * @param mbr - MBR structure to serialize
 * @param copyCount - Number of copies to include (optional)
 * @returns Binary MBR data with copies
 */
export async function ipcSerializeMbrWithCopies(
  mbr: unknown,
  copyCount?: number
): Promise<Uint8Array> {
  const data = await invokeCommand('firmware_mbr_serialize_with_copies', { mbr, copyCount });
  return new Uint8Array(data);
}

/**
 * Parses boot package (TOC1) binary data.
 *
 * Boot package is the TOC1 format container used for
 * bootloader components in newer Allwinner SoCs.
 *
 * @param data - Binary boot package data
 * @returns Parsed boot package structure with item list
 */
export async function ipcParseBootPackage(data: Uint8Array) {
  return invokeCommand('firmware_parse_boot_package', { data: Array.from(data) });
}

/**
 * Validates boot package (TOC1) binary data.
 *
 * Checks if the provided data contains a valid TOC1
 * boot package structure.
 *
 * @param data - Binary data to validate
 * @returns True if data is valid boot package
 */
export async function ipcIsValidBootPackage(data: Uint8Array): Promise<boolean> {
  return invokeCommand('firmware_is_valid_boot_package', { data: Array.from(data) });
}

/**
 * Gets boot package item data by name.
 *
 * Extracts the binary data for a specific item within
 * the boot package, identified by its name.
 *
 * @param data - Binary boot package data
 * @param itemName - Name of item to extract
 * @returns Binary item data, or null if not found
 */
export async function ipcGetBootPackageItemData(
  data: Uint8Array,
  itemName: string
): Promise<Uint8Array | null> {
  const result = await invokeCommand('firmware_get_boot_package_item_data', {
    data: Array.from(data),
    itemName,
  });
  return result ? new Uint8Array(result) : null;
}

/**
 * Gets boot package item data by index.
 *
 * Extracts the binary data for an item within the boot
 * package at the specified index position.
 *
 * @param data - Binary boot package data
 * @param index - Index of item to extract
 * @returns Binary item data, or null if not found
 */
export async function ipcGetBootPackageItemDataByIndex(
  data: Uint8Array,
  index: number
): Promise<Uint8Array | null> {
  const result = await invokeCommand('firmware_get_boot_package_item_data_by_index', {
    data: Array.from(data),
    index,
  });
  return result ? new Uint8Array(result) : null;
}

/**
 * Gets the human-readable name for a boot package item type.
 *
 * Item types are numeric codes that identify the category
 * of bootloader component (e.g., dtb, uboot, optee).
 *
 * @param itemType - Numeric item type code
 * @returns Human-readable item type name
 */
export async function ipcGetItemTypeName(itemType: number): Promise<string> {
  return invokeCommand('firmware_get_item_type_name', { itemType });
}