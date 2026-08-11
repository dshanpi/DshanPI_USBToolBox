import type { ChipInfo } from '../Drivers/Types';

import { aw1859 } from './aw1859';
import { aw1882 } from './aw1882';
import { aw1886 } from './aw1886';
import { aw1890 } from './aw1890';
import { aw1903 } from './aw1903';
import { aw1912 } from './aw1912';
import { aw1918 } from './aw1918';
import { aw1922 } from './aw1922';
import { aw1931 } from './aw1931';

/**
 * Chip registry mapping chip IDs to configurations.
 *
 * Contains all supported Allwinner SoC configurations for
 * GPIO pin mux lookup and chip identification.
 */
const chipRegistry: Map<string, ChipInfo> = new Map([
  ['1859', aw1859],
  ['1882', aw1882],
  ['1886', aw1886],
  ['1890', aw1890],
  ['1903', aw1903],
  ['1912', aw1912],
  ['1918', aw1918],
  ['1922', aw1922],
  ['1931', aw1931],
]);

/**
 * Gets chip configuration by chip ID.
 *
 * @param chipId - Chip ID string (e.g., '1859', '1903')
 * @returns ChipInfo configuration, or undefined if not found
 */
export function getChipInfoById(chipId: string): ChipInfo | undefined {
  return chipRegistry.get(chipId);
}

/**
 * Gets chip configuration from batch number.
 *
 * Extracts chip model from the batch number string (characters 2-6)
 * and returns the corresponding chip configuration.
 *
 * @param batchNo - Batch number string
 * @returns ChipInfo configuration, or null if not found
 */
export function getChipInfoByBatchNo(batchNo: string): ChipInfo | null {
  const chipModel = batchNo.substring(2, 6);
  return chipRegistry.get(chipModel) || null;
}

/**
 * Gets all supported chip configurations.
 *
 * @returns Array of all ChipInfo configurations
 */
export function getAllChips(): ChipInfo[] {
  return Array.from(chipRegistry.values());
}

/**
 * Extracts mark ID from chip SID string.
 *
 * Parses the chip SID as hex and masks to 16-bit mark ID
 * used for chip variant identification.
 *
 * @param chipSid - Chip SID hex string
 * @returns 16-bit mark ID value
 */
export function getMarkId(chipSid: string): number {
  return parseInt(chipSid.trim(), 16) & 0xffff;
}

/**
 * Gets human-readable chip name from chip info.
 *
 * Matches the mark ID against chip marks to find the
 * corresponding chip variant name (e.g., 'T113', 'D1-H').
 *
 * @param info - Chip batch/type info object
 * @param chipInfo - ChipInfo configuration to match against
 * @returns Chip name string
 */
export function getCurrentChipName(
  info: { batchno: string; chiptype: string },
  chipInfo: ChipInfo
): string {
  const markId = getMarkId(info.chiptype);
  for (const [name, id] of Object.entries(chipInfo.chipMark)) {
    if (id === markId) {
      return name;
    }
  }
  return info.batchno + ': ' + info.chiptype;
}