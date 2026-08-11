import {
  checkServer,
  listDevices,
  selectDevice,
  getSelectedDevice,
  clearSelectedDevice,
  shellCommand,
  listDirectory,
  pushFile,
  pullFile,
  pullFolder,
  deleteFile,
  makeDirectory,
  rename,
  stat,
  reboot,
  root,
  type AdbDevice,
  type AdbDirectoryListing,
  type AdbFileInfo,
  type AdbServerStatus,
} from '../Library/ADB';

/** Re-export ADB types for convenience */
export type { AdbDevice, AdbDirectoryListing, AdbFileInfo, AdbServerStatus };

/**
 * Service for ADB device operations.
 *
 * AdbService provides a simplified API for Android Debug Bridge (ADB)
 * communication, wrapping the AdbLibrary functions with a clean
 * service interface.
 *
 * ADB is used for:
 * - Device discovery and file management on running Android devices
 * - Rebooting devices to FEL mode for firmware flashing
 * - GPIO register access via shell commands on rooted devices
 *
 * Example usage:
 * ```typescript
 * const devices = await adbService.listDevices();
 * await adbService.shellCommand(devices[0].serial, 'reboot efex');
 * const listing = await adbService.listDirectory(null, '/sdcard');
 * ```
 */
export class AdbService {
  /**
   * Checks ADB server status.
   *
   * @returns AdbServerStatus with running state and version
   */
  checkServer(): Promise<AdbServerStatus> {
    return checkServer();
  }

  /**
   * Lists connected ADB devices.
   *
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Array of AdbDevice information
   */
  listDevices(timeoutMs?: number): Promise<AdbDevice[]> {
    return listDevices(timeoutMs);
  }

  /**
   * Selects a device for subsequent operations.
   *
   * @param serial - Device serial number
   */
  selectDevice(serial: string): Promise<void> {
    return selectDevice(serial);
  }

  /**
   * Gets the currently selected device serial.
   *
   * @returns Serial number or null
   */
  getSelectedDevice(): Promise<string | null> {
    return getSelectedDevice();
  }

  /**
   * Clears device selection.
   */
  clearSelectedDevice(): Promise<void> {
    return clearSelectedDevice();
  }

  /**
   * Executes shell command on device.
   *
   * @param serial - Device serial (null for selected device)
   * @param command - Shell command to execute
   * @returns Command output string
   */
  shellCommand(serial: string | null, command: string): Promise<string> {
    return shellCommand(serial, command);
  }

  /**
   * Lists directory contents on device.
   *
   * @param serial - Device serial (null for selected device)
   * @param path - Directory path to list
   * @returns Directory listing with items
   */
  listDirectory(serial: string | null, path: string): Promise<AdbDirectoryListing> {
    return listDirectory(serial, path);
  }

  /**
   * Pushes file to device.
   *
   * @param serial - Device serial (null for selected device)
   * @param localPath - Local source file path
   * @param remotePath - Destination path on device
   */
  pushFile(serial: string | null, localPath: string, remotePath: string): Promise<void> {
    return pushFile(serial, localPath, remotePath);
  }

  /**
   * Pulls file from device.
   *
   * @param serial - Device serial (null for selected device)
   * @param remotePath - Source path on device
   * @param localPath - Local destination path
   */
  pullFile(serial: string | null, remotePath: string, localPath: string): Promise<void> {
    return pullFile(serial, remotePath, localPath);
  }

  /**
   * Pulls folder from device.
   *
   * @param serial - Device serial (null for selected device)
   * @param remotePath - Source folder path on device
   * @param localPath - Local destination folder path
   */
  pullFolder(serial: string | null, remotePath: string, localPath: string): Promise<void> {
    return pullFolder(serial, remotePath, localPath);
  }

  /**
   * Deletes file on device.
   *
   * @param serial - Device serial (null for selected device)
   * @param path - File path to delete
   * @returns Result message
   */
  deleteFile(serial: string | null, path: string): Promise<string> {
    return deleteFile(serial, path);
  }

  /**
   * Creates directory on device.
   *
   * @param serial - Device serial (null for selected device)
   * @param path - Directory path to create
   * @returns Result message
   */
  makeDirectory(serial: string | null, path: string): Promise<string> {
    return makeDirectory(serial, path);
  }

  /**
   * Renames file or directory on device.
   *
   * @param serial - Device serial (null for selected device)
   * @param oldPath - Current path
   * @param newPath - New path
   * @returns Result message
   */
  rename(serial: string | null, oldPath: string, newPath: string): Promise<string> {
    return rename(serial, oldPath, newPath);
  }

  /**
   * Copies path on device using shell command.
   *
   * @param serial - Device serial (null for selected device)
   * @param sourcePath - Source path
   * @param destinationPath - Destination path
   * @returns Command output
   */
  copyPath(serial: string | null, sourcePath: string, destinationPath: string): Promise<string> {
    return shellCommand(serial, `cp -r "${sourcePath}" "${destinationPath}"`);
  }

  /**
   * Gets file information on device.
   *
   * @param serial - Device serial (null for selected device)
   * @param path - File path to stat
   * @returns File information
   */
  stat(serial: string | null, path: string): Promise<AdbFileInfo> {
    return stat(serial, path);
  }

  /**
   * Reboots device.
   *
   * @param serial - Device serial (null for selected device)
   * @param rebootType - Reboot destination ('reboot', 'bootloader', 'recovery', 'efex')
   */
  reboot(serial: string | null, rebootType: string): Promise<void> {
    return reboot(serial, rebootType);
  }

  /**
   * Switches device to root mode.
   *
   * @param serial - Device serial (null for selected device)
   * @returns Result message
   */
  root(serial: string | null): Promise<string> {
    return root(serial);
  }
}

/** Singleton instance of AdbService */
export const adbService = new AdbService();