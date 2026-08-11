/**
 * Boot0 file header structure.
 *
 * Boot0 is the first-stage bootloader for Allwinner SoCs.
 * The header contains essential information for boot flow
 * including magic, checksum, and execution addresses.
 */
export interface BootFileHead {
  /** Jump instruction at boot vector */
  jump_instruction: number;
  /** Magic string 'eGON.BT0' */
  magic: string;
  /** Header checksum */
  check_sum: number;
  /** Total bootloader length */
  length: number;
  /** Public header size */
  pub_head_size: number;
  /** Public header version array */
  pub_head_vsn: number[];
  /** Return address after Boot0 execution */
  ret_addr: number;
  /** Run address where Boot0 executes */
  run_addr: number;
  /** Boot CPU identifier */
  boot_cpu: number;
  /** Platform string identifier */
  platform: string;
}

/**
 * DRAM parameter information structure.
 *
 * Defines DRAM controller initialization parameters
 * including init flags and parameter array.
 */
export interface DramParamInfo {
  /** DRAM initialization completion flag */
  dram_init_flag: number;
  /** DRAM parameter update flag */
  dram_update_flag: number;
  /** DRAM timing and configuration parameters */
  dram_para: number[];
}

/**
 * U-Boot base header structure.
 *
 * Contains core U-Boot header fields including magic,
 * checksum, size, and execution address.
 */
export interface UBootBaseHead {
  /** Jump instruction at boot vector */
  jump_instruction: number;
  /** Magic string 'u-boot' */
  magic: string;
  /** Header checksum */
  check_sum: number;
  /** Alignment size */
  align_size: number;
  /** Total U-Boot length */
  length: number;
  /** U-Boot binary length */
  uboot_length: number;
  /** Version string */
  version: string;
  /** Platform string identifier */
  platform: string;
  /** Run address where U-Boot executes */
  run_addr: number;
}

/**
 * U-Boot normal GPIO configuration structure.
 *
 * Defines GPIO pin configuration for U-Boot interfaces
 * including UART, TWI, NAND, and SD card.
 */
export interface UBootNormalGpioCfg {
  /** GPIO port number */
  port: number;
  /** Pin number within port */
  port_num: number;
  /** Function selection (mul_sel) */
  mul_sel: number;
  /** Pull direction */
  pull: number;
  /** Drive level/strength */
  drv_level: number;
  /** Data value */
  data: number;
  /** Reserved fields */
  reserved: number[];
}

/**
 * U-Boot data header structure.
 *
 * Contains extended configuration including DRAM parameters,
 * interface GPIOs, work mode, and storage type.
 */
export interface UBootDataHead {
  /** DRAM timing parameters */
  dram_para: number[];
  /** CPU run clock frequency */
  run_clock: number;
  /** CPU run core voltage */
  run_core_vol: number;
  /** UART debug port number */
  uart_port: number;
  /** UART GPIO configurations */
  uart_gpio: UBootNormalGpioCfg[];
  /** TWI/I2C port number */
  twi_port: number;
  /** TWI/I2C GPIO configurations */
  twi_gpio: UBootNormalGpioCfg[];
  /** Work mode (normal, USB burn, card burn) */
  work_mode: number;
  /** Storage type (SPI NOR, eMMC, etc.) */
  storage_type: number;
  /** NAND flash GPIO configurations */
  nand_gpio: UBootNormalGpioCfg[];
  /** NAND spare data */
  nand_spare_data: number[];
  /** SD card GPIO configurations */
  sdcard_gpio: UBootNormalGpioCfg[];
  /** SD card spare data */
  sdcard_spare_data: number[];
  /** Secure OS existence flag */
  secureos_exist: number;
  /** Monitor/ATF existence flag */
  monitor_exist: number;
  /** Function mask */
  func_mask: number;
  /** U-Boot backup flag */
  uboot_backup: number;
  /** U-Boot start sector in MMC */
  uboot_start_sector_in_mmc: number;
  /** DTB offset in image */
  dtb_offset: number;
  /** Boot package total size */
  boot_package_size: number;
  /** DRAM scan size */
  dram_scan_size: number;
  /** Reserved fields */
  reserved: number[];
  /** PMU type identifier */
  pmu_type: number;
  /** UART input pin */
  uart_input: number;
  /** Key input pin */
  key_input: number;
  /** Secure mode flag */
  secure_mode: number;
  /** Debug mode flag */
  debug_mode: number;
  /** Additional reserved fields */
  reserved2: number[];
}

/**
 * U-Boot extended header structure.
 *
 * Contains additional extension data blocks.
 */
export interface UBootExtHead {
  /** Extension data array */
  data: number[];
}

/**
 * Complete U-Boot header structure.
 *
 * Combines base header, data header, extensions, and hash
 * for complete U-Boot image metadata.
 */
export interface UBootHead {
  /** Base U-Boot header */
  uboot_head: UBootBaseHead;
  /** U-Boot data/configuration header */
  uboot_data: UBootDataHead;
  /** Extended header blocks */
  uboot_ext: UBootExtHead[];
  /** Hash/checksum array */
  hash: number[];
}

/**
 * Sunxi partition entry structure.
 *
 * Defines a single partition entry in the sunxi MBR format
 * with 64-bit address/length split into high/low pairs.
 */
export interface SunxiPartition {
  /** Address high 32 bits */
  addrhi: number;
  /** Address low 32 bits */
  addrlo: number;
  /** Length high 32 bits */
  lenhi: number;
  /** Length low 32 bits */
  lenlo: number;
  /** Partition class name */
  classname: string;
  /** Partition name */
  name: string;
  /** User type attribute */
  user_type: number;
  /** Key data flag */
  keydata: number;
  /** Read-only flag */
  ro: number;
  /** Reserved fields */
  res: number[];
}

/**
 * Sunxi MBR (Master Boot Record) structure.
 *
 * Allwinner's custom MBR format supporting up to 120 partitions
 * with extended attributes and redundant copies.
 */
export interface SunxiMbr {
  /** CRC32 checksum */
  crc32: number;
  /** MBR version number */
  version: number;
  /** Magic string 'softw411' */
  magic: string;
  /** Number of redundant copies */
  copy: number;
  /** MBR copy index */
  index: number;
  /** Partition count */
  PartCount: number;
  /** Timestamp stamp array */
  stamp: number[];
  /** Partition entries array */
  array: SunxiPartition[];
  /** Reserved fields */
  res: number[];
}

/**
 * Normalized partition information structure.
 *
 * User-friendly partition info with BigInt addresses
 * and camelCase field names.
 */
export interface PartitionInfo {
  /** Partition name */
  name: string;
  /** Partition class name */
  classname: string;
  /** Partition start address (BigInt) */
  address: bigint;
  /** Partition length (BigInt) */
  length: bigint;
  /** User type attribute */
  user_type: number;
  /** Key data flag */
  keydata: number;
  /** Read-only flag */
  readonly: boolean;
}

/**
 * Normalized MBR information structure.
 *
 * User-friendly MBR info with BigInt addresses and
 * camelCase field names for UI display.
 */
export interface MbrInfo {
  /** CRC32 checksum */
  crc32: number;
  /** MBR version number */
  version: number;
  /** Magic string identifier */
  magic: string;
  /** Number of redundant copies */
  copy: number;
  /** MBR copy index */
  index: number;
  /** Partition count */
  partCount: number;
  /** Partition info array */
  partitions: PartitionInfo[];
}

/**
 * Raw Boot0 file header with Uint8Array fields.
 *
 * Used for direct binary parsing without string conversion.
 */
export type BootFileHeadRaw = {
  /** Jump instruction */
  jump_instruction: number;
  /** Magic bytes */
  magic: Uint8Array;
  /** Checksum */
  check_sum: number;
  /** Length */
  length: number;
  /** Header size */
  pub_head_size: number;
  /** Version bytes */
  pub_head_vsn: Uint8Array;
  /** Return address */
  ret_addr: number;
  /** Run address */
  run_addr: number;
  /** Boot CPU */
  boot_cpu: number;
  /** Platform bytes */
  platform: Uint8Array;
};

/**
 * Raw DRAM parameter info with Uint8Array fields.
 */
export type DramParamInfoRaw = {
  /** Init flag */
  dram_init_flag: number;
  /** Update flag */
  dram_update_flag: number;
  /** Parameter bytes */
  dram_para: Uint8Array;
};

/**
 * Raw U-Boot base header with Uint8Array fields.
 */
export type UBootBaseHeadRaw = {
  /** Jump instruction */
  jump_instruction: number;
  /** Magic bytes */
  magic: Uint8Array;
  /** Checksum */
  check_sum: number;
  /** Alignment size */
  align_size: number;
  /** Length */
  length: number;
  /** U-Boot length */
  uboot_length: number;
  /** Version bytes */
  version: Uint8Array;
  /** Platform bytes */
  platform: Uint8Array;
  /** Run address */
  run_addr: number;
};

/**
 * Raw U-Boot GPIO configuration with Uint8Array fields.
 */
export type UBootNormalGpioCfgRaw = {
  /** Port */
  port: number;
  /** Port number */
  port_num: number;
  /** Function select */
  mul_sel: number;
  /** Pull */
  pull: number;
  /** Drive level */
  drv_level: number;
  /** Data */
  data: number;
  /** Reserved bytes */
  reserved: Uint8Array;
};

/**
 * Raw sunxi partition entry with Uint8Array fields.
 */
export type SunxiPartitionRaw = {
  /** Address high */
  addrhi: number;
  /** Address low */
  addrlo: number;
  /** Length high */
  lenhi: number;
  /** Length low */
  lenlo: number;
  /** Classname bytes */
  classname: Uint8Array;
  /** Name bytes */
  name: Uint8Array;
  /** User type */
  user_type: number;
  /** Keydata */
  keydata: number;
  /** Read-only */
  ro: number;
  /** Reserved bytes */
  res: Uint8Array;
};

/**
 * TOC1 boot package item structure.
 *
 * Individual item entry within a TOC1 boot package,
 * containing metadata and data location.
 */
export interface Toc1Item {
  /** Item name identifier */
  name: string;
  /** Data offset within package */
  data_offset: number;
  /** Data length in bytes */
  data_len: number;
  /** Encryption flag */
  encrypt: number;
  /** Item type code */
  item_type: number;
  /** Run address for executable items */
  run_addr: number;
  /** Item index */
  index: number;
}

/**
 * TOC1 boot package structure.
 *
 * TOC1 is Allwinner's boot package format (used in newer SoCs)
 * that bundles bootloader components like U-Boot, OpenSBI,
 * DTB, and other firmware in a single container.
 */
export interface BootPackage {
  /** Package name */
  name: string;
  /** Magic number 0x89119800 */
  magic: number;
  /** Additive checksum */
  add_sum: number;
  /** Serial number */
  serial_num: number;
  /** Status field */
  status: number;
  /** Number of items */
  items_nr: number;
  /** Valid data length */
  valid_len: number;
  /** Main version */
  version_main: number;
  /** Sub version */
  version_sub: number;
  /** Item entries array */
  items: Toc1Item[];
}