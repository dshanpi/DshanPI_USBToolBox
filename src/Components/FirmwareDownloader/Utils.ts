import { FLASH_MODE_LABELS } from '../../FlashManager/Types';
import type { FlashMode } from '../../Domain/flash';
import i18n from '../../i18n';

/**
 * Gets localized flash mode label.
 *
 * Translates the flash mode enum value to a display string
 * using the i18n translation system.
 *
 * @param mode - FlashMode enum value
 * @returns Localized mode label string
 */
export function getModeLabel(mode: FlashMode): string {
  const key = FLASH_MODE_LABELS[mode];
  return i18n.t(key);
}