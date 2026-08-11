import {
  ipcParseBootPackage,
  ipcIsValidBootPackage,
  ipcGetBootPackageItemData,
  ipcGetBootPackageItemDataByIndex,
} from '../Platform/IPC/Firmware';
import { Toc1ItemType, TOC1_MAGIC } from './Constants';
import type { BootPackage, Toc1Item } from './Types';

/**
 * Boot package (TOC1) parser and analyzer.
 *
 * TOC1 is Allwinner's boot package format used in newer SoCs
 * to bundle multiple bootloader components together. It contains
 * items like U-Boot, OpenSBI, OP-TEE, device tree blobs, and
 * other firmware components.
 *
 * The parser provides methods for:
 * - Parsing and validating boot packages
 * - Extracting individual item data
 * - Identifying compression and item types
 * - Getting human-readable item descriptions
 *
 * Example usage:
 * ```typescript
 * const pkg = await BootPackageParser.parse(buffer);
 * const ubootData = await BootPackageParser.getItemData(buffer, 'u-boot');
 * console.log(`Package has ${pkg.items_nr} items`);
 * ```
 */
export class BootPackageParser {
  /**
   * Parses boot package from binary data.
   *
   * @param buffer - Binary boot package data
   * @returns Parsed BootPackage structure
   */
  static async parse(buffer: Uint8Array): Promise<BootPackage> {
    const result = await ipcParseBootPackage(buffer);
    return result as BootPackage;
  }

  /**
   * Validates boot package binary data.
   *
   * Uses IPC to check TOC1 magic and structure validity.
   *
   * @param buffer - Binary data to validate
   * @returns True if data is valid TOC1 boot package
   */
  static async isValid(buffer: Uint8Array): Promise<boolean> {
    return ipcIsValidBootPackage(buffer);
  }

  /**
   * Quick local validation without IPC.
   *
   * Checks TOC1 magic number directly in the buffer,
   * useful for fast validation before full parsing.
   *
   * @param buffer - Binary data to check
   * @returns True if magic number matches TOC1 format
   */
  static isValidLocal(buffer: Uint8Array): boolean {
    if (buffer.length < 64) return false;
    // Read magic at offset 16 (after name[16])
    const view = new DataView(buffer.buffer, buffer.byteOffset);
    const magic = view.getUint32(16, true);
    return magic === TOC1_MAGIC;
  }

  /**
   * Gets item binary data by name.
   *
   * Extracts the complete data for a named item within
   * the boot package.
   *
   * @param buffer - Binary boot package data
   * @param itemName - Name of item to extract
   * @returns Binary item data, or null if not found
   */
  static async getItemData(buffer: Uint8Array, itemName: string): Promise<Uint8Array | null> {
    return ipcGetBootPackageItemData(buffer, itemName);
  }

  /**
   * Gets item binary data by index.
   *
   * Extracts data for the item at the specified position
   * in the boot package item array.
   *
   * @param buffer - Binary boot package data
   * @param index - Item index position
   * @returns Binary item data, or null if not found
   */
  static async getItemDataByIndex(buffer: Uint8Array, index: number): Promise<Uint8Array | null> {
    return ipcGetBootPackageItemDataByIndex(buffer, index);
  }

  /**
   * Gets human-readable item type name.
   *
   * Converts the numeric item type code to a descriptive
   * string (normal, key_cert, sign_cert, bin_file).
   *
   * @param type - Numeric item type code
   * @returns Item type name string
   */
  static getItemTypeName(type: number): string {
    switch (type) {
      case Toc1ItemType.NORMAL:
        return 'normal';
      case Toc1ItemType.KEY_CERT:
        return 'key_cert';
      case Toc1ItemType.SIGN_CERT:
        return 'sign_cert';
      case Toc1ItemType.BIN_FILE:
        return 'bin_file';
      default:
        return 'unknown';
    }
  }

  /**
   * Checks if item is compressed by name suffix.
   *
   * Compression is indicated by suffix like '-gz', '-lz4',
   * '-lzma', or '-zstd' in the item name.
   *
   * @param itemName - Item name to check
   * @returns True if item name indicates compression
   */
  static isCompressed(itemName: string): boolean {
    return (
      itemName.endsWith('-gz') ||
      itemName.endsWith('-lz4') ||
      itemName.endsWith('-lzma') ||
      itemName.endsWith('-zstd')
    );
  }

  /**
   * Gets compression type from item name.
   *
   * Parses the compression suffix and returns the
   * compression algorithm name.
   *
   * @param itemName - Item name with compression suffix
   * @returns Compression type name, or null if not compressed
   */
  static getCompressionType(itemName: string): string | null {
    if (itemName.endsWith('-gz')) return 'gzip';
    if (itemName.endsWith('-lz4')) return 'lz4';
    if (itemName.endsWith('-lzma')) return 'lzma';
    if (itemName.endsWith('-zstd')) return 'zstd';
    return null;
  }

  /**
   * Checks if an item is extractable.
   *
   * Binary file and normal items can be extracted;
   * certificate items are typically not extractable.
   *
   * @param item - Toc1Item to check
   * @returns True if item can be extracted
   */
  static isExtractable(item: Toc1Item): boolean {
    return item.item_type === Toc1ItemType.BIN_FILE || item.item_type === Toc1ItemType.NORMAL;
  }

  /**
   * Gets base item name without compression suffix.
   *
   * Strips compression suffixes like '-gz', '-lz4' from
   * the item name to get the original component name.
   *
   * @param itemName - Item name possibly with suffix
   * @returns Base item name without compression suffix
   */
  static getBaseItemName(itemName: string): string {
    const suffixes = ['-gz', '-lz4', '-lzma', '-zstd'];
    for (const suffix of suffixes) {
      if (itemName.endsWith(suffix)) {
        return itemName.slice(0, -suffix.length);
      }
    }
    return itemName;
  }

  /**
   * Gets human-readable item description.
   *
   * Maps common item names to descriptive strings
   * explaining what the component is.
   *
   * @param itemName - Item name to describe
   * @returns Human-readable item description
   */
  static getItemDescription(itemName: string): string {
    const baseName = this.getBaseItemName(itemName);
    const descriptions: Record<string, string> = {
      'u-boot': 'U-Boot bootloader',
      'opensbi': 'OpenSBI firmware',
      'optee': 'OP-TEE OS',
      'monitor': 'ATF/Monitor',
      'scp': 'SCP firmware',
      'dtb': 'Device Tree Blob',
      'dtbo': 'Device Tree Overlay',
      'logo': 'Boot logo',
      'rtos': 'RTOS firmware',
      'melis': 'Melis firmware',
      'melis-config': 'Melis config',
      'melis-elf': 'Melis ELF',
      'parameter': 'Boot parameter',
      'soc-cfg': 'SoC config',
      'board-cfg': 'Board config',
      'emmc-fw': 'eMMC firmware',
      'video': 'Video data',
      'esm-img': 'ESM image',
      'shutdowncharge': 'Shutdown charge logo',
      'androidcharge': 'Android charge logo',
    };
    return descriptions[baseName] || baseName;
  }
}

export default BootPackageParser;