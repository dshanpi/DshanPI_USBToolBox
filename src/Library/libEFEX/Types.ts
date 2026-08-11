/**
 * Device mode enumeration for EFEX devices.
 *
 * - 'null': No mode/uninitialized
 * - 'fel': FEL bootloader mode (basic memory operations)
 * - 'srv': FES service mode (advanced flash operations)
 * - 'update_cool': Cool update mode
 * - 'update_hot': Hot update mode
 * - 'unknown': Unknown mode
 */
export type DeviceMode = 'null' | 'fel' | 'srv' | 'update_cool' | 'update_hot' | 'unknown';

/**
 * Storage type enumeration for flash media.
 *
 * - 'nor': NOR flash
 * - 'nand': NAND flash
 * - 'sdcard': SD card
 * - 'emmc': eMMC
 * - 'unknown': Unknown storage type
 */
export type StorageType = 'nor' | 'nand' | 'sdcard' | 'emmc' | 'unknown';

/**
 * CPU architecture for payload executables.
 *
 * - 'arm32': 32-bit ARM
 * - 'aarch64': 64-bit ARM
 * - 'riscv': RISC-V
 */
export type PayloadArch = 'arm32' | 'aarch64' | 'riscv';

/**
 * USB backend driver type.
 *
 * - 'libusb': Cross-platform libusb driver
 * - 'winusb': Windows native WinUSB driver
 */
export type UsbBackend = 'libusb' | 'winusb';

/**
 * FES data type enumeration for download/upload operations.
 *
 * Specifies how device interprets data during transfer.
 */
export type FesDataType =
  | 'none'
  | 'dram'
  | 'mbr'
  | 'boot1'
  | 'boot0'
  | 'erase'
  | 'full_img_size'
  | 'ext4_ubifs'
  | 'flash';

/**
 * FES tool mode enumeration for device behavior control.
 *
 * - 'normal': Stay in FES mode after operation
 * - 'reboot': Reboot device after operation
 * - 'poweroff': Power off device after operation
 * - 'reupdate': Re-update mode
 * - 'boot': Boot to normal mode after operation
 */
export type FesToolMode = 'normal' | 'reboot' | 'poweroff' | 'reupdate' | 'boot';

/**
 * Device information from EFEX device scan.
 *
 * Contains USB device identification and mode information.
 */
export interface EfexDevice {
  /** USB device ID assigned by libefex */
  deviceId: number;
  /** Allwinner chip version (e.g., 0x1859) */
  chip_version: number;
  /** Current device mode */
  mode: DeviceMode;
  /** Human-readable mode string */
  mode_str: string;
  /** USB bus number */
  bus: number;
  /** USB port number */
  port: number;
}

/**
 * Error data structure from backend.
 *
 * Contains error code, name, and message for serialization.
 */
export interface EfexErrorData {
  /** Numeric error code */
  code: number;
  /** Error name */
  name: string;
  /** Error message */
  message: string;
}

/**
 * Verification response from FES verify commands.
 *
 * Contains CRC values for verification comparison.
 */
export interface FesVerifyResp {
  /** Verification status flag */
  flag: number;
  /** CRC computed by FES */
  fes_crc: number;
  /** CRC computed by flash media */
  media_crc: number;
}

/**
 * EFEX error code constants.
 *
 * Error codes are organized into categories by range:
 * - General errors: -1 to -4
 * - USB errors: -10 to -14
 * - Protocol errors: -20 to -22
 * - State errors: -30 to -34
 * - Flash errors: -40 to -42
 * - Verification errors: -50 to -51
 * - File errors: -60 to -63
 * - Handle errors: -100 to -102
 * - Timeout: -110
 */
export const EFEX_ERROR_CODES = {
  /** Success (no error) */
  SUCCESS: 0,
  /** Invalid parameter passed */
  INVALID_PARAM: -1,
  /** Null pointer error */
  NULL_PTR: -2,
  /** Memory allocation error */
  MEMORY: -3,
  /** Operation not supported */
  NOT_SUPPORT: -4,
  /** USB initialization failed */
  USB_INIT: -10,
  /** Device not found */
  USB_DEVICE_NOT_FOUND: -11,
  /** Failed to open device */
  USB_OPEN: -12,
  /** USB transfer failed */
  USB_TRANSFER: -13,
  /** USB transfer timeout */
  USB_TIMEOUT: -14,
  /** Protocol error */
  PROTOCOL: -20,
  /** Invalid response from device */
  INVALID_RESPONSE: -21,
  /** Unexpected status code */
  UNEXPECTED_STATUS: -22,
  /** Invalid device state */
  INVALID_STATE: -30,
  /** Invalid device mode */
  INVALID_DEVICE_MODE: -31,
  /** Operation failed */
  OPERATION_FAILED: -32,
  /** Device is busy */
  DEVICE_BUSY: -33,
  /** Device not ready */
  DEVICE_NOT_READY: -34,
  /** Flash access error */
  FLASH_ACCESS: -40,
  /** Flash size probing failed */
  FLASH_SIZE_PROBE: -41,
  /** Failed to set flash on/off */
  FLASH_SET_ONOFF: -42,
  /** Verification failed */
  VERIFICATION: -50,
  /** CRC mismatch error */
  CRC_MISMATCH: -51,
  /** Failed to open file */
  FILE_OPEN: -60,
  /** Failed to read file */
  FILE_READ: -61,
  /** Failed to write file */
  FILE_WRITE: -62,
  /** File size error */
  FILE_SIZE: -63,
  /** No free device slot available */
  NO_FREE_SLOT: -100,
  /** Invalid device handle */
  INVALID_HANDLE: -101,
  /** Device not opened */
  DEVICE_NOT_OPEN: -102,
  /** Operation timeout */
  TIMEOUT: -110,
} as const;

/** Type for EFEX error code values */
export type EfexErrorCode = (typeof EFEX_ERROR_CODES)[keyof typeof EFEX_ERROR_CODES];

/**
 * Human-readable names for device modes.
 */
export const DEVICE_MODE_NAMES: Record<DeviceMode, string> = {
  null: 'NULL',
  fel: 'FEL',
  srv: 'SRV',
  update_cool: 'UPDATE_COOL',
  update_hot: 'UPDATE_HOT',
  unknown: 'UNKNOWN',
};

/**
 * Numeric values for FES data types.
 *
 * Used when passing data type to backend commands.
 */
export const FES_DATA_TYPE_VALUES: Record<FesDataType, number> = {
  none: 0x0,
  dram: 0x7f00,
  mbr: 0x7f01,
  boot1: 0x7f02,
  boot0: 0x7f03,
  erase: 0x7f04,
  full_img_size: 0x7f10,
  ext4_ubifs: 0x7ff0,
  flash: 0x8000,
};

/**
 * Numeric values for FES tool modes.
 *
 * Used when passing tool mode to backend commands.
 */
export const FES_TOOL_MODE_VALUES: Record<FesToolMode, number> = {
  normal: 0x1,
  reboot: 0x2,
  poweroff: 0x3,
  reupdate: 0x4,
  boot: 0x5,
};