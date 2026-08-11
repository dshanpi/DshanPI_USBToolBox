/** EFEX CRC32 validation success flag */
export const EFEX_CRC32_VALID_FLAG = 0x6a617603;

/** USB product work mode constant */
export const WORK_MODE_USB_PRODUCT = 0x10;

/** MBR version number */
export const MBR_VERSION = 0x00000200;

/** MBR magic string identifier */
export const MBR_MAGIC = 'softw411';

/** Maximum partition name length */
export const PART_NAME_MAX_LEN = 16;

/** Partition size/reserved field length */
export const PART_SIZE_RES_LEN = 68;

/** MBR tag partition size in bytes */
export const MBR_TAG_PARTITION_SIZE = 128;

/** Maximum partition count in MBR */
export const MBR_MAX_PART_CNT = 120;

/** Total MBR size in bytes */
export const MBR_SIZE = 16 * 1024;

/** MBR reserved space size */
export const MBR_RESERVED = MBR_SIZE - 32 - MBR_MAX_PART_CNT * MBR_TAG_PARTITION_SIZE;

/** Boot0 magic string 'eGON.BT0' */
export const BOOT0_MAGIC = 'eGON.BT0';

/** U-Boot magic string */
export const UBOOT_MAGIC = 'u-boot\x00\x00';

/** EFEX MBR download tag */
export const SUNXI_EFEX_MBR_TAG = 0;

/** EFEX Boot1 download tag */
export const SUNXI_EFEX_BOOT1_TAG = 1;

/** EFEX Boot0 download tag */
export const SUNXI_EFEX_BOOT0_TAG = 2;

/** EFEX full image size tag */
export const SUNXI_EFEX_FULLIMG_SIZE_TAG = 3;

/** EFEX erase operation tag */
export const SUNXI_EFEX_ERASE_TAG = 4;

/**
 * FES data type enumeration.
 *
 * Identifies the type of data being transferred
 * during FES mode flash operations.
 */
export enum FesDataType {
  /** MBR partition table */
  MBR = 0,
  /** Boot1/U-Boot image */
  BOOT1 = 1,
  /** Boot0 first-stage bootloader */
  BOOT0 = 2,
  /** Full firmware image size info */
  FULLIMG_SIZE = 3,
  /** Erase command */
  ERASE = 4,
}

/**
 * Work mode enumeration.
 *
 * Defines the device's operational mode during boot,
 * determining whether to boot normally or enter
 * USB/SD card burning mode.
 */
export enum WorkMode {
  /** Normal boot mode */
  NORMAL = 0,
  /** USB product mode (FEL) */
  USB_PRODUCT = 0x10,
  /** USB burning mode */
  USB_BURN = 0x11,
  /** SD card burning mode */
  CARD_BURN = 0x12,
}

/**
 * Storage type enumeration.
 *
 * Identifies the target storage media type for
 * bootloader and firmware operations.
 */
export enum StorageType {
  /** NAND flash */
  NAND = 0,
  /** SD card */
  SDCARD = 1,
  /** eMMC flash */
  EMMC = 2,
  /** SPI NOR flash */
  SPINOR = 3,
  /** eMMC3 flash */
  EMMC3 = 4,
  /** SPI NAND flash */
  SPINAND = 5,
  /** Secondary SD card */
  SD1 = 6,
  /** eMMC0 flash */
  EMMC0 = 7,
  /** UFS storage */
  UFS = 8,
  /** Auto-detect storage type */
  AUTO = -1,
}

/**
 * Boot file mode enumeration.
 *
 * Defines the packaging format for bootloader files,
 * determining how the boot image is structured.
 */
export enum BootFileMode {
  /** Normal single binary */
  NORMAL = 0,
  /** TOC1 packaged format */
  TOC = 1,
  /** Reserved value */
  RESERVED0 = 2,
  /** Reserved value */
  RESERVED1 = 3,
  /** PKG packaged format */
  PKG = 4,
}

/**
 * Tool mode enumeration for FES operations.
 *
 * Defines the action to take after FES operations complete.
 */
export enum ToolMode {
  /** Normal operation mode */
  NORMAL = 0x1,
  /** Reboot the device */
  REBOOT = 0x2,
  /** Power off the device */
  POWEROFF = 0x3,
  /** Re-update mode */
  REUPDATE = 0x4,
  /** Boot to normal mode */
  BOOT = 0x5,
}

/**
 * U-Boot function mask enumeration.
 *
 * Bit flags for optional U-Boot features like
 * secure OS and monitor/debug presence.
 */
export enum UBootFuncMask {
  /** No features enabled */
  NONE = 0,
  /** Secure OS (OP-TEE) present */
  SECUREOS = 1 << 0,
  /** Monitor/ATF present */
  MONITOR = 1 << 1,
  /** Debug mode enabled */
  DEBUG = 1 << 2,
}

/** Default buffer size for operations */
export const DEFAULT_BUFFER_SIZE = 4096;

/** Default memory address for code loading */
export const DEFAULT_ADDRESS = 0x40000000;

/** TOC1 boot package magic number */
export const TOC1_MAGIC = 0x89119800;

/** TOC1 end marker value */
export const TOC1_END_MARKER = 0x3b45494d;

/**
 * TOC1 item type enumeration.
 *
 * Identifies the category of items within a TOC1
 * boot package container.
 */
export enum Toc1ItemType {
  /** Normal data item */
  NORMAL = 0,
  /** Key certificate item */
  KEY_CERT = 1,
  /** Signing certificate item */
  SIGN_CERT = 2,
  /** Binary file item */
  BIN_FILE = 3,
}