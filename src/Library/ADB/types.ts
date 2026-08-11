/**
 * ADB device information from device listing.
 */
export interface AdbDevice {
  /** Device serial number */
  serial: string;
  /** Device state (device, offline, unauthorized) */
  state: string;
  /** Device model name */
  model?: string;
  /** Product name */
  product?: string;
  /** Device codename */
  device?: string;
  /** Transport ID */
  transport_id?: number;
}

/**
 * ADB version information.
 */
export interface AdbVersion {
  /** Full version string */
  version: string;
  /** Major version number */
  major: number;
  /** Minor version number */
  minor: number;
  /** Patch version number */
  patch: number;
}

/**
 * ADB server status information.
 */
export interface AdbServerStatus {
  /** Whether server is running */
  running: boolean;
  /** Server version if running */
  version?: AdbVersion;
  /** Server port number */
  port: number;
}

/**
 * File information from device listing.
 */
export interface AdbFileInfo {
  /** File name */
  name: string;
  /** Full path */
  path: string;
  /** File size in bytes */
  size: number;
  /** Whether this is a directory */
  is_directory: boolean;
  /** Modified time timestamp */
  modified_time?: number;
  /** Permission string (e.g., 'rw-r--r--') */
  permissions?: string;
}

/**
 * Directory listing result.
 */
export interface AdbDirectoryListing {
  /** Directory path that was listed */
  path: string;
  /** Items in the directory */
  items: AdbFileInfo[];
}

/**
 * Result from ADB command execution.
 */
export interface AdbCommandResult {
  /** Whether command succeeded */
  success: boolean;
  /** Command output */
  output: string;
  /** Error message if failed */
  error?: string;
}