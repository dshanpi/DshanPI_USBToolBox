import { invokeCommand } from '../../Platform/IPC';

/**
 * GPT partition entry.
 *
 * Represents a single partition in the GUID Partition Table.
 */
export interface GptPartition {
  /** Partition name */
  name: string;
  /** Starting LBA (Logical Block Address) */
  start_lba: number;
  /** Ending LBA */
  end_lba: number;
  /** Partition size in bytes */
  size: number;
  /** Partition type GUID */
  partition_type_guid: string;
  /** Unique partition GUID */
  partition_guid: string;
  /** Partition attributes flags */
  attributes: number;
}

/**
 * GPT header information.
 *
 * Contains the partition table header metadata.
 */
export interface GptHeader {
  /** Disk GUID identifier */
  disk_guid: string;
  /** First usable LBA for partitions */
  first_usable_lba: number;
  /** Last usable LBA for partitions */
  last_usable_lba: number;
  /** Number of partition entries */
  partition_count: number;
  /** Size of each partition entry */
  partition_entry_size: number;
}

/**
 * Complete GPT partition table information.
 */
export interface GptInfo {
  /** GPT header */
  header: GptHeader;
  /** Partition entries */
  partitions: GptPartition[];
  /** Disk sector size */
  sector_size: number;
  /** Total disk size */
  total_size: number;
}

/**
 * Result from GPT parsing operation.
 */
export interface ParseGptResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** Error message if failed */
  message: string;
  /** Parsed GPT info if successful */
  gpt_info: GptInfo | null;
}

/**
 * MBR partition entry.
 *
 * Represents a single partition in the Master Boot Record.
 */
export interface MbrPartition {
  /** Partition index (1-4) */
  index: number;
  /** Partition name (derived from type) */
  name: string;
  /** Starting LBA */
  start_lba: number;
  /** Ending LBA */
  end_lba: number;
  /** Partition size in bytes */
  size: number;
  /** Partition type byte */
  partition_type: number;
  /** Human-readable partition type name */
  partition_type_name: string;
  /** Whether partition is bootable */
  bootable: boolean;
}

/**
 * MBR disk information.
 *
 * Contains the disk signature and partition count.
 */
export interface MbrInfo {
  /** Disk signature (32-bit) */
  disk_signature: number;
  /** Number of defined partitions */
  partition_count: number;
  /** Disk sector size */
  sector_size: number;
  /** Total disk size */
  total_size: number;
}

/**
 * Result from MBR parsing operation.
 */
export interface ParseMbrResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** Error message if failed */
  message: string;
  /** MBR disk info if successful */
  mbr_info: MbrInfo | null;
  /** Partition entries */
  partitions: MbrPartition[];
}

/** Union type for GPT or MBR partition */
export type DiskPartition = GptPartition | MbrPartition;

/**
 * Unified disk information.
 *
 * Contains partition table type and partition entries.
 */
export interface DiskInfo {
  /** Partition table type */
  type: 'gpt' | 'mbr' | 'raw';
  /** GPT info if type is GPT */
  gpt_info?: GptInfo;
  /** MBR info if type is MBR */
  mbr_info?: MbrInfo;
  /** All partition entries */
  partitions: DiskPartition[];
  /** Disk sector size */
  sector_size: number;
  /** Total disk size */
  total_size: number;
}

/**
 * Parses GPT from a file.
 *
 * @param filePath - Path to disk/partition image file
 * @param sectorSize - Sector size in bytes (default 512)
 * @returns ParseGptResult with GPT info
 */
export async function parseGptFromFile(
  filePath: string,
  sectorSize?: number
): Promise<ParseGptResult> {
  return (await invokeCommand('parse_gpt_from_file', {
    filePath,
    sectorSize: sectorSize ?? 512,
  })) as ParseGptResult;
}

/**
 * Parses GPT from binary data.
 *
 * @param data - Binary disk/partition image data
 * @param sectorSize - Sector size in bytes (default 512)
 * @returns ParseGptResult with GPT info
 */
export async function parseGptFromData(
  data: Uint8Array,
  sectorSize?: number
): Promise<ParseGptResult> {
  return (await invokeCommand('parse_gpt_from_data', {
    data: Array.from(data),
    sectorSize: sectorSize ?? 512,
  })) as ParseGptResult;
}

/**
 * Parses MBR from a file.
 *
 * @param filePath - Path to disk/partition image file
 * @param sectorSize - Sector size in bytes (default 512)
 * @returns ParseMbrResult with MBR info
 */
export async function parseMbrFromFile(
  filePath: string,
  sectorSize?: number
): Promise<ParseMbrResult> {
  return (await invokeCommand('parse_mbr_from_file', {
    filePath,
    sectorSize: sectorSize ?? 512,
  })) as ParseMbrResult;
}

/**
 * Parses MBR from binary data.
 *
 * @param data - Binary disk/partition image data
 * @param sectorSize - Sector size in bytes (default 512)
 * @returns ParseMbrResult with MBR info
 */
export async function parseMbrFromData(
  data: Uint8Array,
  sectorSize?: number
): Promise<ParseMbrResult> {
  return (await invokeCommand('parse_mbr_from_data', {
    data: Array.from(data),
    sectorSize: sectorSize ?? 512,
  })) as ParseMbrResult;
}

/**
 * Parses disk partition table from file (auto-detect GPT/MBR).
 *
 * Attempts to parse as GPT first, then falls back to MBR
 * if GPT parsing fails. Returns raw type if both fail.
 *
 * @param filePath - Path to disk/partition image file
 * @param sectorSize - Sector size in bytes (default 512)
 * @returns DiskInfo with detected partition table
 */
export async function parseDiskFromFile(filePath: string, sectorSize?: number): Promise<DiskInfo> {
  const gptResult = await parseGptFromFile(filePath, sectorSize);

  if (gptResult.success && gptResult.gpt_info) {
    return {
      type: 'gpt',
      gpt_info: gptResult.gpt_info,
      partitions: gptResult.gpt_info.partitions,
      sector_size: gptResult.gpt_info.sector_size,
      total_size: gptResult.gpt_info.total_size,
    };
  }

  const mbrResult = await parseMbrFromFile(filePath, sectorSize);

  if (mbrResult.success && mbrResult.mbr_info) {
    return {
      type: 'mbr',
      mbr_info: mbrResult.mbr_info,
      partitions: mbrResult.partitions,
      sector_size: mbrResult.mbr_info.sector_size,
      total_size: mbrResult.mbr_info.total_size,
    };
  }

  return {
    type: 'raw',
    partitions: [],
    sector_size: sectorSize ?? 512,
    total_size: 0,
  };
}