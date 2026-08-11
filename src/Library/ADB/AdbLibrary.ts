import { invokeCommand } from '../../Platform/IPC';
import type { AdbDevice, AdbServerStatus, AdbDirectoryListing, AdbFileInfo } from './types';

/**
 * Checks ADB server status.
 *
 * Returns information about whether the ADB server is running,
 * its version, and the port it's listening on.
 *
 * @returns AdbServerStatus with server information
 */
export async function checkServer(): Promise<AdbServerStatus> {
  return invokeCommand('adb_check_server');
}

/**
 * Lists connected ADB devices.
 *
 * Scans for devices connected via ADB with configurable timeout.
 * Throws error if scan takes longer than timeout.
 *
 * @param timeoutMs - Timeout in milliseconds (default 1000)
 * @returns Array of AdbDevice information
 * @throws Error if timeout exceeded
 */
export async function listDevices(timeoutMs: number = 1000): Promise<AdbDevice[]> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`ADB scan timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([invokeCommand('adb_list_devices'), timeoutPromise]);
}

/**
 * Selects an ADB device for subsequent operations.
 *
 * After selection, operations can use null serial to use
 * the selected device implicitly.
 *
 * @param serial - Device serial number to select
 */
export async function selectDevice(serial: string): Promise<void> {
  return invokeCommand('adb_select_device', { serial });
}

/**
 * Gets the currently selected device serial.
 *
 * @returns Selected device serial or null if none selected
 */
export async function getSelectedDevice(): Promise<string | null> {
  return invokeCommand('adb_get_selected_device');
}

/**
 * Clears the currently selected device.
 *
 * After clearing, operations require explicit serial parameter.
 */
export async function clearSelectedDevice(): Promise<void> {
  return invokeCommand('adb_clear_selected_device');
}

/**
 * Executes a shell command on the device.
 *
 * @param serial - Device serial (null for selected device)
 * @param command - Shell command to execute
 * @returns Command output string
 */
export async function shellCommand(serial: string | null, command: string): Promise<string> {
  return invokeCommand('adb_shell_command', { serial, command });
}

/**
 * Lists directory contents on the device.
 *
 * @param serial - Device serial (null for selected device)
 * @param path - Directory path to list
 * @returns AdbDirectoryListing with file items
 */
export async function listDirectory(
  serial: string | null,
  path: string
): Promise<AdbDirectoryListing> {
  return invokeCommand('adb_list_directory', { serial, path });
}

/**
 * Pushes a file to the device.
 *
 * @param serial - Device serial (null for selected device)
 * @param localPath - Local file path
 * @param remotePath - Destination path on device
 */
export async function pushFile(
  serial: string | null,
  localPath: string,
  remotePath: string
): Promise<void> {
  return invokeCommand('adb_push_file', { serial, localPath, remotePath });
}

/**
 * Pulls a file from the device.
 *
 * @param serial - Device serial (null for selected device)
 * @param remotePath - Source path on device
 * @param localPath - Destination local path
 */
export async function pullFile(
  serial: string | null,
  remotePath: string,
  localPath: string
): Promise<void> {
  return invokeCommand('adb_pull_file', { serial, remotePath, localPath });
}

/**
 * Pulls a folder from the device.
 *
 * @param serial - Device serial (null for selected device)
 * @param remotePath - Source folder path on device
 * @param localPath - Destination local folder path
 */
export async function pullFolder(
  serial: string | null,
  remotePath: string,
  localPath: string
): Promise<void> {
  return invokeCommand('adb_pull_folder', { serial, remotePath, localPath });
}

/**
 * Deletes a file on the device.
 *
 * @param serial - Device serial (null for selected device)
 * @param path - File path to delete
 * @returns Result message
 */
export async function deleteFile(serial: string | null, path: string): Promise<string> {
  return invokeCommand('adb_delete_file', { serial, path });
}

/**
 * Creates a directory on the device.
 *
 * @param serial - Device serial (null for selected device)
 * @param path - Directory path to create
 * @returns Result message
 */
export async function makeDirectory(serial: string | null, path: string): Promise<string> {
  return invokeCommand('adb_make_directory', { serial, path });
}

/**
 * Renames a file or directory on the device.
 *
 * @param serial - Device serial (null for selected device)
 * @param oldPath - Current path
 * @param newPath - New path
 * @returns Result message
 */
export async function rename(
  serial: string | null,
  oldPath: string,
  newPath: string
): Promise<string> {
  return invokeCommand('adb_rename', { serial, oldPath, newPath });
}

/**
 * Gets file information on the device.
 *
 * @param serial - Device serial (null for selected device)
 * @param path - File path to stat
 * @returns AdbFileInfo with file details
 */
export async function stat(serial: string | null, path: string): Promise<AdbFileInfo> {
  return invokeCommand('adb_stat', { serial, path });
}

/**
 * Reboots the device.
 *
 * @param serial - Device serial (null for selected device)
 * @param rebootType - Reboot type (e.g., 'reboot', 'reboot bootloader', 'reboot recovery')
 */
export async function reboot(serial: string | null, rebootType: string): Promise<void> {
  return invokeCommand('adb_reboot', { serial, rebootType });
}

/**
 * Switches device to root mode.
 *
 * Requires device to support root access.
 *
 * @param serial - Device serial (null for selected device)
 * @returns Result message
 */
export async function root(serial: string | null): Promise<string> {
  return invokeCommand('adb_root', { serial });
}

/** Re-export all types from ADB module */
export * from './types';