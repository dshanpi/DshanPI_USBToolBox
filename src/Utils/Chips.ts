/**
 * Gets human-readable chip name from chip ID.
 *
 * Converts chip version number to display string, showing
 * either "FES Devices" for FES mode or "FEL Device" with
 * hex chip ID for FEL mode devices.
 *
 * @param chipId - Chip version/ID number
 * @returns Human-readable chip name string
 */
export function getChipName(chipId: number): string {
  if (chipId === 0x00161000) {
    return `FES Devices`;
  }
  return `FEL Device (0x${chipId.toString(16).toUpperCase().padStart(8, '0')})`;
}

/**
 * Formats chip ID as hex string.
 *
 * Returns chip version number formatted as 8-character
 * uppercase hex string with 0x prefix.
 *
 * @param chipId - Chip version/ID number
 * @returns Formatted hex string (e.g., "0x00162500")
 */
export function formatChipId(chipId: number): string {
  return `0x${chipId.toString(16).toUpperCase().padStart(8, '0')}`;
}