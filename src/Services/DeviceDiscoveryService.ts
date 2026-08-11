import { getChipName } from '../Utils/Chips';
import type { FlashDevice } from '../FlashManager/Types';
import type { AdbDevice } from '../Library/ADB';
import type { EfexDevice } from '../Library/libEFEX';
import { adbService } from './AdbService';
import { efexService } from './EfexService';

/**
 * Result from device discovery scan.
 *
 * Contains discovered devices, scan source, and any errors
 * encountered during scanning.
 */
export interface DeviceDiscoveryResult {
  /** Discovered devices ready for flash operations */
  devices: FlashDevice[];
  /** Source of discovered devices */
  source: 'efex' | 'adb' | 'both' | 'none';
  /** Errors encountered during scanning */
  errors: {
    /** Error from EFEX scan if failed */
    efex?: unknown;
    /** Error from ADB scan if failed */
    adb?: unknown;
  };
}

/**
 * Maps EFEX device to FlashDevice format.
 *
 * Converts chip version to human-readable chip name and
 * creates unique device ID from USB location.
 *
 * @param device - EfexDevice from EFEX scan
 * @returns FlashDevice for flash operations
 */
function mapEfexDevice(device: EfexDevice): FlashDevice {
  return {
    id: `efex-${device.chip_version.toString(16)}-${device.bus}-${device.port}`,
    name: getChipName(device.chip_version),
    deviceId: device.deviceId,
    mode: device.mode,
    modeStr: device.mode_str,
    chipVersion: device.chip_version,
    bus: device.bus,
    port: device.port,
  };
}

/**
 * Maps ADB device to FlashDevice format.
 *
 * Uses model/product name if available, otherwise serial number.
 * ADB devices can be rebooted to FEL mode for flashing.
 *
 * @param device - AdbDevice from ADB scan
 * @returns FlashDevice for flash operations
 */
function mapAdbDevice(device: AdbDevice): FlashDevice {
  return {
    id: `adb-${device.serial}`,
    name: device.model || device.product || device.serial,
    mode: 'adb',
    modeStr: 'ADB',
    serial: device.serial,
  };
}

/**
 * Service for unified device discovery across EFEX and ADB.
 *
 * DeviceDiscoveryService scans both EFEX (FEL/FES mode) devices
 * and ADB (Android) devices concurrently, providing a unified
 * list of FlashDevice objects for the UI.
 *
 * Errors from either scan are captured separately, allowing
 * partial success when one scan fails (e.g., ADB offline but
 * FEL device present).
 *
 * Example usage:
 * ```typescript
 * const discovery = await deviceDiscoveryService.scanDevices();
 * if (discovery.devices.length > 0) {
 *   console.log(`Found ${discovery.devices.length} devices`);
 * }
 * if (discovery.errors.efex) {
 *   console.warn('EFEX scan failed');
 * }
 * ```
 */
export class DeviceDiscoveryService {
  /**
   * Scans for devices on both EFEX and ADB.
   *
   * Performs concurrent scans using Promise.allSettled to handle
   * partial failures gracefully. Maps results to unified FlashDevice
   * format for use in flash operations.
   *
   * @returns DeviceDiscoveryResult with devices and errors
   */
  async scanDevices(): Promise<DeviceDiscoveryResult> {
    const errors: DeviceDiscoveryResult['errors'] = {};
    const devices: FlashDevice[] = [];

    // Scan EFEX and ADB concurrently
    const [efexResult, adbResult] = await Promise.allSettled([
      efexService.scanDevices(),
      adbService.listDevices(),
    ]);

    // Process EFEX results
    if (efexResult.status === 'fulfilled') {
      devices.push(...efexResult.value.map(mapEfexDevice));
    } else {
      errors.efex = efexResult.reason;
    }

    // Process ADB results
    if (adbResult.status === 'fulfilled') {
      devices.push(...adbResult.value.map(mapAdbDevice));
    } else {
      errors.adb = adbResult.reason;
    }

    // Determine scan source
    const hasEfex = devices.some((device) => device.mode !== 'adb');
    const hasAdb = devices.some((device) => device.mode === 'adb');
    const source: DeviceDiscoveryResult['source'] =
      hasEfex && hasAdb ? 'both' : hasEfex ? 'efex' : hasAdb ? 'adb' : 'none';

    return {
      devices,
      source,
      errors,
    };
  }
}

/** Singleton instance of DeviceDiscoveryService */
export const deviceDiscoveryService = new DeviceDiscoveryService();