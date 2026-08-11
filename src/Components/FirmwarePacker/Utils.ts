/**
 * Formats time as HH:MM:SS.mmm string.
 *
 * Used for log timestamp display in EFEL GUI.
 *
 * @param date - Date to format
 * @returns Time string with hours, minutes, seconds, milliseconds
 */
export const formatTime = (date: Date): string => {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
};

/**
 * Parses address string to number.
 *
 * Handles hex (0x prefix) and decimal formats for
 * user input in EFEL address fields.
 *
 * @param value - Address string to parse
 * @returns Parsed number, or NaN if invalid
 */
export const parseAddress = (value: string): number | null => {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('0x')) {
    return parseInt(trimmed, 16);
  }
  return parseInt(trimmed, 10);
};

/**
 * Formats number as 8-digit hex string.
 *
 * Used for displaying memory addresses in EFEL GUI.
 *
 * @param value - Number to format
 * @returns Hex string (e.g., "0x00001234")
 */
export const formatHex = (value: number): string => {
  return '0x' + value.toString(16).toUpperCase().padStart(8, '0');
};

/**
 * Formats byte size to human-readable string.
 *
 * Converts size in bytes to appropriate unit with
 * decimal places for KB/MB/GB.
 *
 * @param bytes - Size in bytes
 * @returns Formatted size string
 */
export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};