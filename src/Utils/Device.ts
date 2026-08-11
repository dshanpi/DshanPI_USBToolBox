import { FlashDevice, READY_MODES } from '../FlashManager';
import { TFunction } from 'i18next';

/** Re-export ready modes for device status checking */
export { READY_MODES };

/**
 * Checks if a device is ready for operations.
 *
 * A device is considered ready if it is in one of the
 * READY_MODES (FEL, FES, or ADB with proper connection).
 *
 * @param device - FlashDevice to check, or null
 * @returns True if device is ready for operations
 */
export function isDeviceReady(device: FlashDevice | null): boolean {
  if (!device) return false;
  return READY_MODES.includes(device.mode);
}

/**
 * Gets device status display string.
 *
 * Returns localized status text based on device presence
 * and readiness state. Used for UI device status display.
 *
 * @param device - FlashDevice to display, or null
 * @param t - i18next translation function
 * @returns Localized status display string
 */
export function getDeviceStatusDisplay(device: FlashDevice | null, t: TFunction): string {
  if (!device) return t('deviceScanner.noDevice', '未发现设备');
  if (isDeviceReady(device)) return t('deviceScanner.statusReady', '就绪');
  return device.modeStr || t('deviceScanner.statusUnknown', '未知');
}