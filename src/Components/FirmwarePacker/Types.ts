/**
 * Log entry structure for firmware packer.
 *
 * Contains timestamp, level, and message for display
 * in the packer log panel.
 */
export interface LogEntry {
  /** Log timestamp */
  time: Date;
  /** Log level indicator */
  level: 'INFO' | 'WARN' | 'ERRO' | 'OKAY';
  /** Log message content */
  message: string;
}

/**
 * Tool identifier type for converter selection.
 *
 * Each tool ID corresponds to a specific firmware converter
 * for different storage media types.
 */
export type ToolId =
  | 'spinor_converter'
  | 'emmc_converter'
  | 'sdnand_converter'
  | 'sdcard_converter'
  | 'ufs_converter';

/**
 * Tool information structure.
 *
 * Defines the configuration for a firmware converter tool
 * including its ID and default flash type.
 */
export interface ToolInfo {
  /** Tool identifier */
  id: ToolId;
  /** Default flash type for this tool */
  defaultFlashType?: 'emmc' | 'ufs' | 'sdcard' | 'sdnand';
}