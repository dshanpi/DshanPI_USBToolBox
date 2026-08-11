/**
 * Device tree property with value and raw bytes.
 */
export interface FdtProperty {
  /** Property name */
  name: string;
  /** String representation of value (if applicable) */
  value: string | null;
  /** Raw binary value bytes */
  raw_value: number[] | null;
}

/**
 * Device tree node with properties and child references.
 */
export interface FdtNode {
  /** Node name (last component of path) */
  name: string;
  /** Full path to node */
  path: string;
  /** Properties defined on this node */
  properties: FdtProperty[];
  /** Child node paths/names */
  children: string[];
}

/**
 * Memory region from device tree.
 *
 * Describes a memory area available to the system.
 */
export interface FdtMemoryRegion {
  /** Starting physical address */
  starting_address: number;
  /** Region size in bytes */
  size: number;
}

/**
 * CPU information from device tree.
 *
 * Describes a CPU core in the system.
 */
export interface FdtCpu {
  /** CPU node name */
  name: string;
  /** Device type (usually 'cpu') */
  device_type: string | null;
  /** Compatible strings identifying CPU type */
  compatible: string[];
  /** Register assignment (for SMP systems) */
  reg: number[] | null;
  /** Clock frequency in Hz */
  clock_frequency: number | null;
  /** Timebase frequency for timer */
  timebase_frequency: number | null;
}

/**
 * Chosen node configuration from device tree.
 *
 * Contains boot parameters and console configuration.
 */
export interface FdtChosen {
  /** Kernel boot arguments */
  bootargs: string | null;
  /** stdout console path */
  stdout_path: string | null;
  /** stdin console path */
  stdin_path: string | null;
  /** initrd start address */
  linux_initrd_start: number | null;
  /** initrd end address */
  linux_initrd_end: number | null;
}

/**
 * Root node information from device tree.
 *
 * Top-level board/system identification.
 */
export interface FdtRootInfo {
  /** Board model name */
  model: string | null;
  /** Platform compatible strings */
  compatible: string[];
  /** #address-cells value */
  address_cells: number | null;
  /** #size-cells value */
  size_cells: number | null;
}

/**
 * Complete parsed device tree information.
 *
 * Summary of device tree structure including root, memory,
 * CPUs, and chosen node.
 */
export interface FdtInfo {
  /** Root node information */
  root: FdtRootInfo;
  /** Memory region definitions */
  memory_regions: FdtMemoryRegion[];
  /** CPU core descriptions */
  cpus: FdtCpu[];
  /** Chosen boot configuration */
  chosen: FdtChosen;
  /** Total number of nodes in tree */
  total_nodes: number;
}

/**
 * Result from FDT parsing operation.
 */
export interface ParseFdtResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** Error message if failed */
  message: string;
  /** Parsed FDT info if successful */
  fdt_info: FdtInfo | null;
}

/**
 * Result from node lookup operation.
 */
export interface GetNodeResult {
  /** Whether lookup succeeded */
  success: boolean;
  /** Error message if failed */
  message: string;
  /** Found node if successful */
  node: FdtNode | null;
}

/**
 * Result from property lookup operation.
 */
export interface GetPropertyResult {
  /** Whether lookup succeeded */
  success: boolean;
  /** Error message if failed */
  message: string;
  /** Found property if successful */
  property: FdtProperty | null;
}

/**
 * Result from child listing operation.
 */
export interface ListNodeChildrenResult {
  /** Whether listing succeeded */
  success: boolean;
  /** Error message if failed */
  message: string;
  /** Child node names */
  children: string[];
}

/**
 * Result from DTS generation operation.
 */
export interface GenerateDtsResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Error message if failed */
  message: string;
  /** Generated DTS source */
  dts: string | null;
}

/**
 * SDMMC flash partition map from device tree.
 *
 * Defines partition layout for SD/eMMC storage devices.
 */
export interface SdmmcMapInfo {
  /** Logical offset for partition addressing */
  logic_offset: number | null;
  /** Boot parameter partition start sector */
  boot_param_start: number | null;
  /** Boot parameter partition size */
  boot_param_size: number | null;
  /** UBoot partition start sector */
  uboot_start: number | null;
  /** UBoot partition size */
  uboot_size: number | null;
  /** UBoot backup partition start */
  uboot_bak_start: number | null;
  /** UBoot backup partition size */
  uboot_bak_size: number | null;
  /** Secure storage partition start */
  secure_storage_start: number | null;
  /** Secure storage partition size */
  secure_storage_size: number | null;
  /** Tuning data partition start */
  tuning_data_start: number | null;
  /** Tuning data partition size */
  tuning_data_size: number | null;
}

/**
 * NOR flash partition map from device tree.
 *
 * Defines partition layout for NOR flash storage devices.
 */
export interface NorMapInfo {
  /** Total NOR flash size */
  flash_size: number | null;
  /** Logical offset for normal partition addressing */
  logic_offset: number | null;
  /** Logical offset for secure partition addressing */
  secure_logic_offset: number | null;
  /** Logical offset for RTOS partition addressing */
  rtos_logic_offset: number | null;
  /** Logical offset for RTOS secure partition addressing */
  rtos_secure_logic_offset: number | null;
  /** Boot parameter partition start */
  boot_param_start: number | null;
  /** Boot parameter partition size */
  boot_param_size: number | null;
  /** UBoot partition start */
  uboot_start: number | null;
  /** UBoot partition size */
  uboot_size: number | null;
  /** Boot0 partition start */
  boot0_start: number | null;
}

/**
 * Complete flash map from device tree.
 *
 * Contains partition maps for both SDMMC and NOR storage.
 */
export interface FlashMapInfo {
  /** SDMMC/eMMC partition map */
  sdmmc_map: SdmmcMapInfo | null;
  /** NOR flash partition map */
  nor_map: NorMapInfo | null;
}

/**
 * Logic offset configuration for flash operations.
 *
 * Specifies how to determine partition addressing offset.
 */
export interface LogicOffsetConfig {
  /** Source of logic offset value */
  source: 'boot_dtb' | 'uboot_dtb' | 'manual';
  /** Storage type being configured */
  storageType: 'sdmmc' | 'nor' | 'ufs';
  /** Logic offset value to use */
  logicOffset: number;
}

/**
 * Flash operation mode type.
 *
 * - 'command': Standard command-based flash mode
 * - 'logic_offset': Direct logical offset addressing
 */
export type GenericFlashMode = 'command' | 'logic_offset';