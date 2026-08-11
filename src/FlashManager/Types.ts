import { DeviceMode } from '../Library/libEFEX';
import type { FlashMode, PostFlashAction } from '../Domain/flash';
import { Partition } from '../Library/OpenixIMG';

/**
 * Represents a device available for flash operations.
 *
 * Devices can be in FEL mode (bootloader), FES/SRV mode (firmware execution service),
 * or ADB mode (Android Debug Bridge). Each mode requires different preparation steps.
 */
export interface FlashDevice {
  /** Unique identifier for the device, format depends on mode */
  id: string;
  /** Human-readable device name (chip name or model) */
  name: string;
  /** Current device mode: 'fel', 'srv', or 'adb' */
  mode: DeviceMode | 'adb';
  /** Mode string displayed to user (localized) */
  modeStr: string;
  /** USB device ID from libefex, undefined for ADB mode */
  deviceId?: number;
  /** Allwinner chip version number (e.g., 0x1859) */
  chipVersion?: number;
  /** USB bus number */
  bus?: number;
  /** USB port number */
  port?: number;
  /** ADB serial number, only present for ADB mode */
  serial?: string;
}

/**
 * Represents progress information for a flash operation.
 *
 * Updated frequently during flashing to provide real-time feedback
 * including current stage, partition, and data transfer metrics.
 */
export interface FlashProgress {
  /** Task ID for multi-device flash tracking */
  taskId?: number;
  /** Current stage identifier (e.g., 'fel_reconnect', 'downloading') */
  stageId?: string;
  /** Overall progress percentage (0-100) */
  percent: number;
  /** Current stage label displayed to user */
  stage: string;
  /** Transfer speed string (e.g., "1.5 MB/s") */
  speed?: string;
  /** Name of partition currently being flashed */
  currentPartition?: string;
  /** List of completed partition names */
  completedPartitions?: string[];
  /** Total size in bytes to write */
  totalSize?: number;
  /** Written size in bytes so far */
  writtenSize?: number;
  /** True if progress is indeterminate (unknown completion) */
  indeterminate?: boolean;
  /** Progress percentage for current partition (0-100) */
  partitionPercent?: number;
}

/**
 * Log level for flash operation log entries.
 *
 * - 'info': Informational messages
 * - 'warn': Warning messages that don't stop operation
 * - 'error': Error messages that indicate failure
 * - 'success': Success messages for completed operations
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'success';

/**
 * Represents a log entry during flash operations.
 *
 * Logs are emitted for various events including device detection,
 * stage transitions, errors, and completion.
 */
export interface LogEntry {
  /** Task ID for multi-device flash tracking */
  taskId?: number;
  /** Timestamp when the log was generated */
  timestamp: Date;
  /** Log level indicating severity */
  level: LogLevel;
  /** Log message content */
  message: string;
}

/**
 * Options for configuring a flash operation.
 *
 * Passed to flashManager.start() to control flash behavior including
 * mode, partitions, verification, and post-flash actions.
 */
export interface FlashOptions {
  /** Flash mode determining what gets flashed */
  mode: FlashMode;
  /** Optional list of specific partitions to flash */
  partitions?: string[];
  /** Whether to verify downloaded partitions */
  verifyDownload: boolean;
  /** Action to perform after flash completes */
  postFlashAction: PostFlashAction;
  /** Optional MBR data override for partition table */
  mbrData?: Uint8Array;
  /** Optional custom partition configuration */
  partitionConfig?: Partition[];
}

/**
 * DRAM initialization information from FEL mode.
 *
 * Emitted during FEL flash to report DRAM parameters and
 * initialization status from the device bootloader.
 */
export interface FlashDramInfo {
  /** Task ID for multi-device flash tracking */
  taskId?: number;
  /** Return address for DRAM initialization */
  retAddr: number;
  /** Flag indicating DRAM initialization status */
  dramInitFlag: number;
  /** Flag indicating DRAM parameter update status */
  dramUpdateFlag: number;
  /** DRAM parameters array */
  dramPara: number[];
}

/**
 * Interface for flash operation controller.
 *
 * Defines the API for controlling flash operations including
 * device scanning, operation start/cancel, and event callbacks.
 */
export interface FlashController {
  /** Scan for available devices */
  scan: () => Promise<FlashDevice[]>;
  /** Start flash operation, returns task ID */
  start: (device: FlashDevice, imagePath: string, options: FlashOptions) => Promise<number>;
  /** Cancel active flash operation(s) */
  cancel: (taskId?: number) => void;
  /** Register progress callback */
  onProgress: (callback: (progress: FlashProgress) => void) => () => void;
  /** Register log callback */
  onLog: (callback: (log: LogEntry) => void) => () => void;
  /** Register completion callback */
  onComplete: (callback: (result: { taskId: number; success: boolean }) => void) => () => void;
  /** Register DRAM info callback */
  onDramInfo: (callback: (info: FlashDramInfo) => void) => () => void;
  /** Register working state change callback */
  onWorkingChange: (callback: (working: boolean) => void) => () => void;
  /** Register rescan request callback */
  onRescan: (callback: () => void) => () => void;
}

/**
 * Device modes that indicate device is ready for flash operations.
 *
 * - 'fel': Device is in FEL bootloader mode, ready for DRAM init and UBoot load
 * - 'srv': Device is in FES service mode, ready for partition download
 * - 'adb': Device is in ADB mode, needs reboot to FEL before flash
 */
export const READY_MODES: (DeviceMode | 'adb')[] = ['fel', 'srv', 'adb'];

/**
 * I18n key labels for flash mode options.
 *
 * Maps FlashMode enum values to translation keys for UI display.
 */
export const FLASH_MODE_LABELS: Record<FlashMode, string> = {
  bootloader: 'flashMode.bootloader',
  partition: 'flashMode.partition',
  keep_data: 'flashMode.keep_data',
  partition_erase: 'flashMode.partition_erase',
  full_erase: 'flashMode.full_erase',
  erase_only: 'flashMode.erase_only',
};

/**
 * Display strings for log level indicators.
 *
 * Used for UI display of log level badges/labels.
 */
export const LOG_LEVEL_DISPLAYS: Record<LogLevel, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERRO',
  success: 'OKAY',
};