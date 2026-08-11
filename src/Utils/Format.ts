/**
 * Formats byte size to human-readable string.
 *
 * Converts size in bytes to appropriate unit (B, KB, MB, GB)
 * with 2 decimal places for larger units.
 *
 * @param bytes - Size in bytes (number or bigint)
 * @returns Formatted size string (e.g., "1.50 MB")
 */
export function formatSize(bytes: number | bigint): string {
  const size = Number(bytes);
  if (size < 1024) {
    return `${size} B`;
  } else if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(2)} KB`;
  } else if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

/**
 * Formats transfer speed to human-readable string.
 *
 * Converts bytes per second to appropriate unit
 * with /s suffix for throughput display.
 *
 * @param bytesPerSecond - Transfer speed in bytes/second
 * @returns Formatted speed string (e.g., "1.50 MB/s")
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
  if (bytesPerSecond < 1024 * 1024 * 1024)
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
  return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

/**
 * Formats number as hex string with padding.
 *
 * Converts value to uppercase hex with 0x prefix,
 * padding to specified number of digits. Handles
 * signed integers by converting to unsigned representation.
 *
 * @param value - Number or bigint to format
 * @param padding - Minimum number of hex digits (default: 8)
 * @returns Formatted hex string (e.g., "0x00001234")
 */
export function formatHex(value: number | bigint, padding: number = 8): string {
  // Handle signed 32-bit integers by converting to unsigned
  const num = typeof value === 'bigint' ? value : value >>> 0;
  return '0x' + num.toString(16).toUpperCase().padStart(padding, '0');
}

/**
 * Formats Date to localized time string.
 *
 * Returns time in zh-CN locale format with hour, minute,
 * and second components.
 *
 * @param date - Date to format
 * @returns Localized time string
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Formats Date to 24-hour time string.
 *
 * Returns time in en-US locale with 24-hour format,
 * suitable for log timestamps.
 *
 * @param date - Date to format
 * @returns 24-hour time string
 */
export function formatLogTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Formats Unix timestamp to datetime string.
 *
 * Converts timestamp (seconds since epoch) to localized
 * datetime string. Returns '-' for undefined/zero timestamp.
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Localized datetime string or '-'
 */
export function formatDateTime(timestamp?: number): string {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Gets CSS class name for log entry.
 *
 * Returns class name based on log level for styling.
 *
 * @param level - Log level string
 * @returns CSS class name string
 */
export function getLogClassName(level: string): string {
  return `log-entry log-${level}`;
}

/**
 * Gets display text for log level.
 *
 * Maps log levels to short display strings for UI.
 *
 * @param level - Log level string
 * @returns Display string (INFO, WARN, ERRO, OKAY)
 */
export function getLogLevelDisplay(level: string): string {
  const displays: Record<string, string> = {
    info: 'INFO',
    warn: 'WARN',
    error: 'ERRO',
    success: 'OKAY',
  };
  return displays[level] || level.toUpperCase();
}

/**
 * Creates log adapter function.
 *
 * Wraps addLog callback with level display formatting,
 * providing a simplified interface for logging.
 *
 * @param addLog - Log callback function
 * @returns Adapter function with formatted level display
 */
export function createLogAdapter(
  addLog: (level: string, message: string) => void
): (level: 'info' | 'warn' | 'error' | 'success', message: string) => void {
  return (level, message) => {
    addLog(getLogLevelDisplay(level), message);
  };
}