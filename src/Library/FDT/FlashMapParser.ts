import { FdtNode, FlashMapInfo, SdmmcMapInfo, NorMapInfo } from './Types';
import { getFdtNode } from './FdtParser';

/** Device Tree Blob magic number (0xd00dfeed) */
const DTB_MAGIC = 0xd00dfeed;

/**
 * Parses a 32-bit big-endian unsigned integer from bytes.
 *
 * @param bytes - 4 bytes to parse
 * @returns Parsed 32-bit value
 */
function parseU32FromBytesBE(bytes: number[] | Uint8Array): number {
  const arr = Array.isArray(bytes) ? bytes : Array.from(bytes);
  if (arr.length < 4) return 0;
  return (arr[0] << 24) | (arr[1] << 16) | (arr[2] << 8) | arr[3];
}

/**
 * Parses SDMMC flash map properties from device tree node.
 *
 * Extracts partition offset and size information for SD/eMMC
 * storage layout from the sunxi_flashmap node.
 *
 * @param node - FdtNode with sdmmc_map properties
 * @returns SdmmcMapInfo with parsed values
 */
function parseSdmmcMap(node: FdtNode): SdmmcMapInfo {
  const getProp = (name: string): number | null => {
    const prop = node.properties.find((p) => p.name === name);
    if (!prop?.raw_value || prop.raw_value.length < 4) return null;
    return parseU32FromBytesBE(prop.raw_value);
  };

  return {
    logic_offset: getProp('logic_offset'),
    boot_param_start: getProp('boot_param_start'),
    boot_param_size: getProp('boot_param_size'),
    uboot_start: getProp('uboot_start'),
    uboot_size: getProp('uboot_size'),
    uboot_bak_start: getProp('uboot_bak_start'),
    uboot_bak_size: getProp('uboot_bak_size'),
    secure_storage_start: getProp('secure_storage_start'),
    secure_storage_size: getProp('secure_storage_size'),
    tuning_data_start: getProp('tuning_data_start'),
    tuning_data_size: getProp('tuning_data_size'),
  };
}

/**
 * Parses NOR flash map properties from device tree node.
 *
 * Extracts partition offset and size information for NOR flash
 * storage layout from the sunxi_flashmap node.
 *
 * @param node - FdtNode with nor_map properties
 * @returns NorMapInfo with parsed values
 */
function parseNorMap(node: FdtNode): NorMapInfo {
  const getProp = (name: string): number | null => {
    const prop = node.properties.find((p) => p.name === name);
    if (!prop?.raw_value || prop.raw_value.length < 4) return null;
    return parseU32FromBytesBE(prop.raw_value);
  };

  return {
    flash_size: getProp('flash_size'),
    logic_offset: getProp('logic_offset'),
    secure_logic_offset: getProp('secure_logic_offset'),
    rtos_logic_offset: getProp('rtos_logic_offset'),
    rtos_secure_logic_offset: getProp('rtos_secure_logic_offset'),
    boot_param_start: getProp('boot_param_start'),
    boot_param_size: getProp('boot_param_size'),
    uboot_start: getProp('uboot_start'),
    uboot_size: getProp('uboot_size'),
    boot0_start: getProp('boot0_start'),
  };
}

/**
 * Parses flash map information from device tree.
 *
 * Reads the sunxi_flashmap node from DTB to extract storage
 * layout information for both SDMMC (SD/eMMC) and NOR flash.
 *
 * @param data - DTB binary data
 * @returns FlashMapInfo or null if flashmap node not found
 */
export async function getFlashMap(data: Uint8Array | number[]): Promise<FlashMapInfo | null> {
  const dataArray = Array.isArray(data) ? data : Array.from(data);

  try {
    const sunxiFlashmapPath = '/soc/sunxi_flashmap';
    const flashmapNode = await getFdtNode(dataArray, sunxiFlashmapPath);

    let sdmmcMap: SdmmcMapInfo | null = null;
    let norMap: NorMapInfo | null = null;

    for (const childPath of flashmapNode.children) {
      const fullPath = childPath.startsWith('/') ? childPath : `${sunxiFlashmapPath}/${childPath}`;
      try {
        const childNode = await getFdtNode(dataArray, fullPath);
        const nodeName = childNode.name;

        if (nodeName === 'sdmmc_map') {
          sdmmcMap = parseSdmmcMap(childNode);
        } else if (nodeName === 'nor_map') {
          norMap = parseNorMap(childNode);
        }
      } catch {
        continue;
      }
    }

    return {
      sdmmc_map: sdmmcMap,
      nor_map: norMap,
    };
  } catch {
    return null;
  }
}

/**
 * Finds embedded DTB within UBoot binary.
 *
 * UBoot binaries often contain an appended DTB section.
 * Searches backwards from end of binary for DTB magic number.
 *
 * @param data - UBoot binary data
 * @returns Object with offset and size, or null if DTB not found
 */
export function findDtbInUboot(
  data: Uint8Array | number[]
): { offset: number; size: number } | null {
  const arr = Array.isArray(data) ? new Uint8Array(data) : data;
  const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);

  // Search backwards for DTB magic (commonly appended at end)
  for (let i = arr.length - 4; i >= 0; i -= 4) {
    if (view.getUint32(i, false) === DTB_MAGIC) {
      const totalsize = view.getUint32(i + 4, false);
      if (totalsize > 0 && totalsize <= arr.length - i) {
        return { offset: i, size: totalsize };
      }
    }
  }

  return null;
}

/**
 * Extracts embedded DTB from UBoot binary.
 *
 * Locates the DTB section appended to UBoot and returns
 * the raw DTB data.
 *
 * @param data - UBoot binary data
 * @returns Uint8Array with DTB data, or null if not found
 */
export function extractDtbFromUboot(data: Uint8Array | number[]): Uint8Array | null {
  const arr = Array.isArray(data) ? new Uint8Array(data) : data;
  const found = findDtbInUboot(arr);

  if (!found) {
    return null;
  }

  return arr.slice(found.offset, found.offset + found.size);
}