import { DshanPIPacker } from './DshanPIPacker';
import i18n from '../../i18n';

/**
 * Entry in the image data lookup table.
 *
 * Maps human-readable names to IMAGEWTY maintype/subtype identifiers
 * for common firmware components.
 */
export interface ImageDataEntry {
  /** Short name for the component (e.g., 'fes', 'uboot') */
  name: string;
  /** 8-character maintype identifier */
  maintype: string;
  /** 16-character subtype identifier */
  subtype: string;
  /** I18n key for localized description */
  description: string;
}

/**
 * Lookup table for common firmware image components.
 *
 * Maps friendly names to IMAGEWTY maintype/subtype identifiers.
 * Used to extract standard firmware components like FES, UBoot,
 * MBR, DTB, etc. from firmware images.
 */
export const ImageDataTable: ImageDataEntry[] = [
  {
    name: 'fes',
    maintype: 'FES     ',
    subtype: 'FES_1-0000000000',
    description: 'imageData.fes',
  },
  {
    name: 'uboot',
    maintype: '12345678',
    subtype: 'UBOOT_0000000000',
    description: 'imageData.uboot',
  },
  {
    name: 'uboot_crash',
    maintype: '12345678',
    subtype: 'UBOOT_CRASH_0000',
    description: 'imageData.uboot_crash',
  },
  {
    name: 'mbr',
    maintype: '12345678',
    subtype: '1234567890___MBR',
    description: 'imageData.mbr',
  },
  {
    name: 'gpt',
    maintype: '12345678',
    subtype: '1234567890___GPT',
    description: 'imageData.gpt',
  },
  {
    name: 'sys_config',
    maintype: 'COMMON  ',
    subtype: 'SYS_CONFIG100000',
    description: 'imageData.sys_config',
  },
  {
    name: 'sys_config_bin',
    maintype: 'COMMON  ',
    subtype: 'SYS_CONFIG_BIN00',
    description: 'imageData.sys_config_bin',
  },
  {
    name: 'sys_partition',
    maintype: 'COMMON  ',
    subtype: 'SYS_CONFIG000000',
    description: 'imageData.sys_partition',
  },
  {
    name: 'board_config',
    maintype: 'COMMON  ',
    subtype: 'BOARD_CONFIG_BIN',
    description: 'imageData.board_config',
  },
  {
    name: 'dtb',
    maintype: 'COMMON  ',
    subtype: 'DTB_CONFIG000000',
    description: 'imageData.dtb',
  },
  {
    name: 'boot0_card',
    maintype: '12345678',
    subtype: '1234567890BOOT_0',
    description: 'imageData.boot0_card',
  },
  {
    name: 'boot0_nor',
    maintype: '12345678',
    subtype: '1234567890BNOR_0',
    description: 'imageData.boot0_nor',
  },
  {
    name: 'bootpkg',
    maintype: '12345678',
    subtype: 'BOOTPKG-00000000',
    description: 'imageData.bootpkg',
  },
  {
    name: 'bootpkg_nor',
    maintype: '12345678',
    subtype: 'BOOTPKG-NOR00000',
    description: 'imageData.bootpkg_nor',
  },
  {
    name: 'pc_plugin',
    maintype: 'XXXXXXXX',
    subtype: 'XXXXXXXXXXXXXXXX',
    description: 'imageData.pc_plugin',
  },
  {
    name: 'card_plugin',
    maintype: '12345678',
    subtype: '1234567890CARDTL',
    description: 'imageData.card_plugin',
  },
  {
    name: 'card_script',
    maintype: '12345678',
    subtype: '1234567890SCRIPT',
    description: 'imageData.card_script',
  },
];

/** Map from entry name to full ImageDataEntry */
const imageEntryMap = new Map(ImageDataTable.map((entry) => [entry.name, entry]));

/** Map from subtype to localized description key */
const subtypeToDescriptionMap = new Map(
  ImageDataTable.map((entry) => [entry.subtype, entry.description])
);

/**
 * Gets localized function name for a subtype identifier.
 *
 * @param subtype - 16-character subtype identifier
 * @returns Localized description or null if unknown
 */
export function getFunctionBySubtype(subtype: string): string | null {
  const i18nKey = subtypeToDescriptionMap.get(subtype);
  if (!i18nKey) return null;
  return i18n.t(i18nKey);
}

/**
 * Gets image data by friendly name.
 *
 * Looks up the maintype/subtype for the name and extracts data
 * from the firmware image.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @param name - Friendly name (e.g., 'fes', 'uboot')
 * @returns Uint8Array with data or null if not found
 */
export async function getImageDataByName(
  packer: DshanPIPacker,
  name: string
): Promise<Uint8Array | null> {
  const entry = imageEntryMap.get(name);
  if (!entry) {
    return null;
  }
  return packer.getFileDataByMaintypeSubtype(entry.maintype, entry.subtype);
}

/**
 * Gets image data entry by friendly name.
 *
 * @param name - Friendly name (e.g., 'fes', 'uboot')
 * @returns ImageDataEntry or undefined if not found
 */
export function getImageDataEntry(name: string): ImageDataEntry | undefined {
  return imageEntryMap.get(name);
}

/**
 * Checks if image contains data for a named component.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @param name - Friendly name (e.g., 'fes', 'uboot')
 * @returns True if data exists in image
 */
export async function hasImageData(packer: DshanPIPacker, name: string): Promise<boolean> {
  const entry = imageEntryMap.get(name);
  if (!entry) {
    return false;
  }
  const data = await packer.getFileDataByMaintypeSubtype(entry.maintype, entry.subtype);
  return data !== null;
}

/**
 * Gets FES (Firmware Execution Service) binary from image.
 *
 * FES is the runtime service loaded after UBoot for flash operations.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with FES binary or null
 */
export async function getFes(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'fes');
}

/**
 * Gets UBoot binary from image.
 *
 * UBoot is the bootloader loaded in FEL mode before FES.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with UBoot binary or null
 */
export async function getUboot(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'uboot');
}

/**
 * Gets UBoot crash handler binary from image.
 *
 * UBoot crash is a fallback bootloader for error recovery.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with UBoot crash binary or null
 */
export async function getUbootCrash(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'uboot_crash');
}

/**
 * Gets MBR (Master Boot Record) from image.
 *
 * MBR defines the partition layout for the flash storage.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with MBR data or null
 */
export async function getMbr(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'mbr');
}

/**
 * Gets GPT (GUID Partition Table) from image.
 *
 * GPT is the modern partition table format alternative to MBR.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with GPT data or null
 */
export async function getGpt(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'gpt');
}

/**
 * Gets sys_config.fex text configuration from image.
 *
 * Sys_config defines hardware configuration and pin assignments.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with sys_config text or null
 */
export async function getSysConfig(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'sys_config');
}

/**
 * Gets compiled sys_config binary from image.
 *
 * Binary version of sys_config processed by PhoenixSuit.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with sys_config binary or null
 */
export async function getSysConfigBin(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'sys_config_bin');
}

/**
 * Gets board configuration binary from image.
 *
 * Board-specific configuration data.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with board config or null
 */
export async function getBoardConfig(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'board_config');
}

/**
 * Gets device tree blob (DTB) from image.
 *
 * DTB contains hardware description for Linux kernel.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with DTB data or null
 */
export async function getDtb(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'dtb');
}

/**
 * Gets boot0 for SD card boot from image.
 *
 * Boot0 is the initial bootloader for card boot mode.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with boot0 card binary or null
 */
export async function getBoot0Card(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'boot0_card');
}

/**
 * Gets boot0 for NOR flash boot from image.
 *
 * Boot0 variant for NOR flash storage.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with boot0 NOR binary or null
 */
export async function getBoot0Nor(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'boot0_nor');
}

/**
 * Gets boot package from image.
 *
 * Boot package contains boot firmware for standard boot.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with boot package or null
 */
export async function getBootpkg(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'bootpkg');
}

/**
 * Gets boot package for NOR flash from image.
 *
 * NOR-specific boot package variant.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with boot package NOR or null
 */
export async function getBootpkgNor(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'bootpkg_nor');
}

/**
 * Gets sys_partition configuration data from image.
 *
 * Contains partition layout definition.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with partition data or null
 */
export async function getPartitionData(packer: DshanPIPacker): Promise<Uint8Array | null> {
  return getImageDataByName(packer, 'sys_partition');
}

/**
 * Checks if firmware is a secure/encrypted firmware.
 *
 * Secure firmware uses TOC1 format instead of standard boot package.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns True if secure, false if not, null if TOC1 not found
 */
export function checkSecureFirmware(packer: DshanPIPacker): boolean | null {
  const fileInfo = packer.getFileInfoByMaintypeSubtype('12345678', 'TOC1_00000000000');
  if (!fileInfo) {
    return false;
  }
  return fileInfo.length !== 8;
}

/**
 * Gets boot package data from firmware.
 *
 * Checks both secure (TOC1) and non-secure (BOOTPKG) formats,
 * returning whichever is available.
 *
 * @param packer - DshanPIPacker instance with loaded image
 * @returns Uint8Array with boot package data or null
 */
export async function getBootPackageData(packer: DshanPIPacker): Promise<Uint8Array | null> {
  // First check for secure firmware TOC1
  const toc1Data = await packer.getFileDataByMaintypeSubtype('12345678', 'TOC1_00000000000');
  if (toc1Data && toc1Data.length > 8) {
    return toc1Data;
  }

  // Check for normal BOOTPKG
  const bootpkgData = await getBootpkg(packer);
  if (bootpkgData) {
    return bootpkgData;
  }

  // Check for NOR BOOTPKG
  const bootpkgNorData = await getBootpkgNor(packer);
  if (bootpkgNorData) {
    return bootpkgNorData;
  }

  return null;
}