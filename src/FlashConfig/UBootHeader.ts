import { UBootHead } from './Types';
import { WorkMode, StorageType, BootFileMode } from './Constants';
import {
  ipcGetUbootStorageType,
  ipcGetUbootWorkMode,
  ipcParseUboot,
  ipcSetUbootStorageType,
  ipcSetUbootWorkMode,
} from '../Platform/IPC';

/**
 * Placeholder class for U-Boot GPIO configuration parsing.
 */
export class UBootGpioCfg {}

/**
 * Placeholder class for U-Boot base header parsing.
 */
export class UBootBaseHeader {}

/**
 * Placeholder class for U-Boot data header parsing.
 */
export class UBootDataHeader {}

/**
 * Placeholder class for U-Boot extended header parsing.
 */
export class UBootExtHeader {}

/**
 * U-Boot header parser and modifier.
 *
 * U-Boot is the second-stage bootloader that provides full
 * system initialization and kernel loading capabilities.
 * The U-Boot header contains critical configuration including:
 * - Run address in memory
 * - Work mode (normal, USB burn, card burn)
 * - Storage type (SPI NOR, eMMC, SD card, etc.)
 * - DRAM parameters and GPIO configurations
 *
 * Example usage:
 * ```typescript
 * const header = await UBootHeaderParser.parse(ubootBuffer);
 * const storageType = await UBootHeaderParser.getStorageType(ubootBuffer);
 * const modified = await UBootHeaderParser.setStorageType(ubootBuffer, StorageType.EMMC);
 * ```
 */
export class UBootHeaderParser {
  /**
   * Parses U-Boot header from binary data.
   *
   * @param buffer - Binary U-Boot data
   * @returns Parsed UBootHead structure
   */
  static async parse(buffer: Uint8Array): Promise<UBootHead> {
    return (await ipcParseUboot(buffer)) as UBootHead;
  }

  /**
   * Validates U-Boot binary data.
   *
   * Attempts to parse the buffer and returns true if successful.
   *
   * @param buffer - Binary U-Boot data to validate
   * @returns True if data contains valid U-Boot header
   */
  static async isValid(buffer: Uint8Array): Promise<boolean> {
    try {
      await this.parse(buffer);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the run address from U-Boot header.
   *
   * Run address is where U-Boot code executes in memory.
   *
   * @param buffer - Binary U-Boot data
   * @returns Run address value
   */
  static async getRunAddress(buffer: Uint8Array): Promise<number> {
    const parsed = await this.parse(buffer);
    return parsed.uboot_head.run_addr;
  }

  /**
   * Sets the work mode in U-Boot binary.
   *
   * Work mode determines boot behavior (normal boot, USB burn,
   * SD card burn mode).
   *
   * @param buffer - Binary U-Boot data
   * @param mode - Work mode value to set
   * @returns Modified U-Boot binary data
   */
  static async setWorkMode(buffer: Uint8Array, mode: WorkMode): Promise<Uint8Array> {
    return ipcSetUbootWorkMode(buffer, mode);
  }

  /**
   * Gets the work mode from U-Boot binary.
   *
   * @param buffer - Binary U-Boot data
   * @returns Work mode value
   */
  static async getWorkMode(buffer: Uint8Array): Promise<number> {
    return ipcGetUbootWorkMode(buffer);
  }

  /**
   * Sets the storage type in U-Boot binary.
   *
   * Storage type identifies the target boot medium
   * (SPI NOR, eMMC, SD card, NAND, etc.).
   *
   * @param buffer - Binary U-Boot data
   * @param storageType - Storage type value to set
   * @returns Modified U-Boot binary data
   */
  static async setStorageType(buffer: Uint8Array, storageType: StorageType): Promise<Uint8Array> {
    return ipcSetUbootStorageType(buffer, storageType);
  }

  /**
   * Gets the storage type from U-Boot binary.
   *
   * @param buffer - Binary U-Boot data
   * @returns Storage type value
   */
  static async getStorageType(buffer: Uint8Array): Promise<number> {
    return ipcGetUbootStorageType(buffer);
  }

  /**
   * Gets human-readable boot file mode string.
   *
   * Boot file mode identifies the U-Boot packaging format
   * (NORMAL, TOC1, PKG).
   *
   * @param type - Boot file mode number
   * @returns Boot file mode name string
   */
  static getSunxiBootFileModeString(type: number): string {
    switch (type) {
      case BootFileMode.NORMAL:
        return 'NORMAL';
      case BootFileMode.TOC:
        return 'TOC';
      case BootFileMode.PKG:
        return 'PKG';
      default:
        return `UNKNOWN(${type})`;
    }
  }
}