import { SunxiMbr, PartitionInfo, MbrInfo } from './Types';
import {
  ipcCreateEmptyMbr,
  ipcIsValidSunxiMbr,
  ipcMbrAddPartition,
  ipcMbrAddPartitionRaw,
  ipcMbrClearPartitions,
  ipcMbrMovePartition,
  ipcMbrRemovePartition,
  ipcMbrSetCopy,
  ipcMbrSetIndex,
  ipcMbrSetVersion,
  ipcMbrUpdatePartition,
  ipcMbrUpdateStamp,
  ipcParseSunxiMbr,
  ipcSerializeMbr,
  ipcSerializeMbrWithCopies,
  ipcSunxiMbrToInfo,
} from '../Platform/IPC';

/**
 * Partition info payload with string address/length.
 *
 * IPC layer converts BigInt to strings for transport,
 * requiring normalization back to BigInt on receipt.
 */
interface PartitionInfoPayload extends Omit<PartitionInfo, 'address' | 'length'> {
  /** Address as string for IPC transport */
  address: string;
  /** Length as string for IPC transport */
  length: string;
}

/**
 * MBR info payload from IPC layer.
 *
 * Contains partition info with string-based addresses
 * that need normalization to BigInt.
 */
interface MbrInfoPayload {
  /** CRC32 checksum */
  crc32: number;
  /** MBR version number */
  version: number;
  /** Magic string identifier */
  magic: string;
  /** Copy count for redundancy */
  copy: number;
  /** MBR index number */
  index: number;
  /** Partition count (snake_case from IPC) */
  part_count: number;
  /** Partition info array */
  partitions: PartitionInfoPayload[];
}

/**
 * Sunxi MBR payload with optional part_count field.
 *
 * IPC responses may include either PartCount or part_count
 * depending on the command used.
 */
type SunxiMbrPayload = SunxiMbr & { part_count?: number };

/**
 * Encodes partition info for IPC transport.
 *
 * Converts BigInt address and length to strings for
 * serialization through Tauri IPC layer.
 *
 * @param partition - Partition info with BigInt fields
 * @returns Partition payload with string fields
 */
function encodePartitionInfo(partition: PartitionInfo) {
  return {
    ...partition,
    address: partition.address.toString(),
    length: partition.length.toString(),
  };
}

/**
 * Normalizes MBR info payload from IPC.
 *
 * Converts string-based addresses back to BigInt and
 * snake_case field names to camelCase.
 *
 * @param payload - MBR info payload from IPC
 * @returns Normalized MbrInfo structure
 */
function normalizeMbrInfo(payload: MbrInfoPayload): MbrInfo {
  return {
    crc32: payload.crc32,
    version: payload.version,
    magic: payload.magic,
    copy: payload.copy,
    index: payload.index,
    partCount: payload.part_count,
    partitions: payload.partitions.map((partition) => ({
      ...partition,
      address: BigInt(partition.address),
      length: BigInt(partition.length),
    })),
  };
}

/**
 * Normalizes Sunxi MBR payload from IPC.
 *
 * Handles the dual naming convention where PartCount
 * or part_count may be present in the response.
 *
 * @param payload - MBR payload from IPC
 * @returns Normalized SunxiMbr structure
 */
function normalizeMbrPayload(payload: SunxiMbrPayload): SunxiMbr {
  return {
    ...payload,
    PartCount: payload.PartCount ?? payload.part_count ?? 0,
  };
}

/**
 * Placeholder class for partition parsing utilities.
 *
 * Partition parsing functionality is handled by SunxiMbrParser
 * and MbrBuilder classes.
 */
export class SunxiPartitionParser {}

/**
 * Sunxi MBR (Master Boot Record) parser.
 *
 * Provides static methods for parsing, validating, and
 * serializing Allwinner's sunxi MBR format, which defines
 * the partition layout for flash storage.
 *
 * Sunxi MBR differs from standard MBR by supporting:
 * - Multiple redundant copies
 * - Extended partition attributes (keydata, readonly)
 * - Larger partition counts (up to 120)
 *
 * Example usage:
 * ```typescript
 * const mbr = await SunxiMbrParser.parse(mbrBuffer);
 * const info = await SunxiMbrParser.toMbrInfo(mbr);
 * console.log(`Found ${info.partCount} partitions`);
 * ```
 */
export class SunxiMbrParser {
  /**
   * Parses sunxi MBR from binary data.
   *
   * @param buffer - Binary MBR data
   * @returns SunxiMbr structure
   */
  static async parse(buffer: Uint8Array): Promise<SunxiMbr> {
    return normalizeMbrPayload((await ipcParseSunxiMbr(buffer)) as SunxiMbrPayload);
  }

  /**
   * Converts SunxiMbr to MbrInfo format.
   *
   * MbrInfo provides a more user-friendly structure with
   * BigInt addresses and camelCase field names.
   *
   * @param mbr - SunxiMbr structure to convert
   * @returns MbrInfo structure
   */
  static async toMbrInfo(mbr: SunxiMbr): Promise<MbrInfo> {
    return normalizeMbrInfo((await ipcSunxiMbrToInfo(mbr)) as MbrInfoPayload);
  }

  /**
   * Serializes SunxiMbr to binary format.
   *
   * @param mbr - SunxiMbr structure to serialize
   * @returns Binary MBR data
   */
  static async serialize(mbr: SunxiMbr): Promise<Uint8Array> {
    return ipcSerializeMbr(mbr);
  }

  /**
   * Validates sunxi MBR binary data.
   *
   * Checks for valid magic string and structure.
   *
   * @param buffer - Binary MBR data to validate
   * @returns True if data contains valid sunxi MBR
   */
  static async isValid(buffer: Uint8Array): Promise<boolean> {
    return ipcIsValidSunxiMbr(buffer);
  }
}

/**
 * Parses MBR from binary buffer and returns MbrInfo.
 *
 * Convenience function combining parse and toMbrInfo operations.
 *
 * @param buffer - Binary MBR data
 * @returns MbrInfo structure with partition details
 */
export async function parseMbrFromBuffer(buffer: Uint8Array): Promise<MbrInfo> {
  const mbr = await SunxiMbrParser.parse(buffer);
  return normalizeMbrInfo((await ipcSunxiMbrToInfo(mbr)) as MbrInfoPayload);
}

/**
 * Validates MBR binary data.
 *
 * Convenience wrapper for SunxiMbrParser.isValid.
 *
 * @param buffer - Binary MBR data to validate
 * @returns True if data contains valid sunxi MBR
 */
export async function isValidMbr(buffer: Uint8Array): Promise<boolean> {
  return SunxiMbrParser.isValid(buffer);
}

/**
 * Creates an empty partition structure.
 *
 * Returns a default SunxiPartition with zeroed fields,
 * ready for configuration and addition to MBR.
 *
 * @returns Empty SunxiPartition structure
 */
export function createEmptyPartition() {
  return {
    addrhi: 0,
    addrlo: 0,
    lenhi: 0,
    lenlo: 0,
    classname: '',
    name: '',
    user_type: 0,
    keydata: 0,
    ro: 0,
    res: [],
  };
}

/**
 * Creates a SunxiPartition from PartitionInfo.
 *
 * Converts BigInt address and length to 32-bit high/low
 * pairs for the SunxiPartition format.
 *
 * @param info - PartitionInfo with BigInt address/length
 * @returns SunxiPartition structure
 */
export function createPartitionFromInfo(info: PartitionInfo) {
  const address = BigInt(info.address);
  const length = BigInt(info.length);
  return {
    addrhi: Number((address >> 32n) & 0xffffffffn),
    addrlo: Number(address & 0xffffffffn),
    lenhi: Number((length >> 32n) & 0xffffffffn),
    lenlo: Number(length & 0xffffffffn),
    classname: info.classname,
    name: info.name,
    user_type: info.user_type,
    keydata: info.keydata,
    ro: info.readonly ? 1 : 0,
    res: [],
  };
}

/**
 * Builder class for constructing and modifying sunxi MBR.
 *
 * MbrBuilder provides a fluent interface for creating and
 * modifying partition tables, supporting operations like
 * adding, removing, updating, and reordering partitions.
 *
 * The builder maintains an internal SunxiMbr structure that
 * is updated through async operations and can be serialized
 * to binary format for writing to firmware.
 *
 * Example usage:
 * ```typescript
 * const builder = await MbrBuilder.create();
 * await builder.addPartition({
 *   name: 'boot',
 *   classname: 'UBOOT',
 *   address: 0n,
 *   length: 1024n * 1024n,
 *   user_type: 0,
 *   keydata: 0,
 *   readonly: false,
 * });
 * const mbrData = await builder.serialize();
 * ```
 */
export class MbrBuilder {
  /** Internal MBR structure being built */
  private mbr: SunxiMbr;

  /**
   * Creates a new MbrBuilder with the given MBR.
   *
   * @param mbr - Initial SunxiMbr structure
   */
  private constructor(mbr: SunxiMbr) {
    this.mbr = mbr;
  }

  /**
   * Creates MbrBuilder from existing binary MBR data.
   *
   * @param buffer - Binary MBR data to parse
   * @returns MbrBuilder instance
   */
  static async fromBuffer(buffer: Uint8Array): Promise<MbrBuilder> {
    const mbr = await SunxiMbrParser.parse(buffer);
    return new MbrBuilder(mbr);
  }

  /**
   * Creates MbrBuilder from MbrInfo structure.
   *
   * Creates an empty MBR that can be populated with
   * partitions from the MbrInfo.
   *
   * @param _info - MbrInfo structure (currently unused)
   * @returns MbrBuilder instance
   */
  static async fromMbrInfo(_info: MbrInfo): Promise<MbrBuilder> {
    const mbr = normalizeMbrPayload((await ipcCreateEmptyMbr()) as SunxiMbrPayload);
    return new MbrBuilder(mbr);
  }

  /**
   * Creates an empty MbrBuilder.
   *
   * @returns MbrBuilder instance with empty MBR
   */
  static async create(): Promise<MbrBuilder> {
    const mbr = normalizeMbrPayload((await ipcCreateEmptyMbr()) as SunxiMbrPayload);
    return new MbrBuilder(mbr);
  }

  /**
   * Gets the internal SunxiMbr structure.
   *
   * @returns Current SunxiMbr
   */
  getMbr(): SunxiMbr {
    return this.mbr;
  }

  /**
   * Gets the MbrInfo representation.
   *
   * @returns Promise resolving to MbrInfo
   */
  getMbrInfo(): Promise<MbrInfo> {
    return ipcSunxiMbrToInfo(this.mbr).then((payload) =>
      normalizeMbrInfo(payload as MbrInfoPayload)
    );
  }

  /**
   * Gets the partition count.
   *
   * @returns Promise resolving to number of partitions
   */
  async getPartCount(): Promise<number> {
    return (await this.getMbrInfo()).partCount;
  }

  /**
   * Gets partition info at the specified index.
   *
   * @param index - Partition index
   * @returns Promise resolving to PartitionInfo or undefined
   */
  async getPartitionInfo(index: number): Promise<PartitionInfo | undefined> {
    return (await this.getMbrInfo()).partitions[index];
  }

  /**
   * Adds a partition to the MBR.
   *
   * Partition is appended to the end of the partition list.
   *
   * @param partition - Partition info to add
   */
  async addPartition(partition: PartitionInfo): Promise<void> {
    this.mbr = normalizeMbrPayload(
      (await ipcMbrAddPartition(this.mbr, encodePartitionInfo(partition))) as SunxiMbrPayload
    );
  }

  /**
   * Adds a partition at a specific index.
   *
   * Inserts the partition before the specified index.
   *
   * @param index - Index to insert before
   * @param partition - Partition info to add
   */
  async addPartitionAt(index: number, partition: PartitionInfo): Promise<void> {
    this.mbr = normalizeMbrPayload(
      (await ipcMbrAddPartition(this.mbr, encodePartitionInfo(partition), index)) as SunxiMbrPayload
    );
  }

  /**
   * Adds a partition using raw format.
   *
   * Uses raw partition parameters instead of PartitionInfo.
   *
   * @param partition - Partition info to add
   */
  async addPartitionRaw(partition: PartitionInfo): Promise<void> {
    this.mbr = normalizeMbrPayload(
      (await ipcMbrAddPartitionRaw(this.mbr, encodePartitionInfo(partition))) as SunxiMbrPayload
    );
  }

  /**
   * Updates a partition at the specified index.
   *
   * Replaces the partition with new configuration.
   *
   * @param index - Index of partition to update
   * @param partition - New partition info
   * @returns True if update succeeded
   */
  async updatePartition(index: number, partition: PartitionInfo): Promise<boolean> {
    this.mbr = normalizeMbrPayload(
      (await ipcMbrUpdatePartition(
        this.mbr,
        index,
        encodePartitionInfo(partition)
      )) as SunxiMbrPayload
    );
    return true;
  }

  /**
   * Removes a partition at the specified index.
   *
   * @param index - Index of partition to remove
   * @returns True if removal succeeded
   */
  async removePartition(index: number): Promise<boolean> {
    this.mbr = normalizeMbrPayload(
      (await ipcMbrRemovePartition(this.mbr, index)) as SunxiMbrPayload
    );
    return true;
  }

  /**
   * Moves a partition from one index to another.
   *
   * @param fromIndex - Current index of partition
   * @param toIndex - Target index for partition
   * @returns True if move succeeded
   */
  async movePartition(fromIndex: number, toIndex: number): Promise<boolean> {
    this.mbr = normalizeMbrPayload(
      (await ipcMbrMovePartition(this.mbr, fromIndex, toIndex)) as SunxiMbrPayload
    );
    return true;
  }

  /**
   * Clears all partitions from the MBR.
   */
  async clearPartitions(): Promise<void> {
    this.mbr = normalizeMbrPayload((await ipcMbrClearPartitions(this.mbr)) as SunxiMbrPayload);
  }

  /**
   * Sets the MBR version number.
   *
   * @param version - Version number to set
   */
  async setVersion(version: number): Promise<void> {
    this.mbr = normalizeMbrPayload((await ipcMbrSetVersion(this.mbr, version)) as SunxiMbrPayload);
  }

  /**
   * Sets the number of MBR copies.
   *
   * Multiple copies provide redundancy on flash storage.
   *
   * @param copy - Number of copies to store
   */
  async setCopy(copy: number): Promise<void> {
    this.mbr = normalizeMbrPayload((await ipcMbrSetCopy(this.mbr, copy)) as SunxiMbrPayload);
  }

  /**
   * Sets the MBR index number.
   *
   * Index identifies which copy when multiple exist.
   *
   * @param index - Index number to set
   */
  async setIndex(index: number): Promise<void> {
    this.mbr = normalizeMbrPayload((await ipcMbrSetIndex(this.mbr, index)) as SunxiMbrPayload);
  }

  /**
   * Updates the MBR timestamp stamp.
   *
   * Stamp is used to track modification time.
   */
  async updateStamp(): Promise<void> {
    this.mbr = normalizeMbrPayload((await ipcMbrUpdateStamp(this.mbr)) as SunxiMbrPayload);
  }

  /**
   * Serializes the MBR to binary format.
   *
   * @returns Binary MBR data
   */
  async serialize(): Promise<Uint8Array> {
    return ipcSerializeMbr(this.mbr);
  }

  /**
   * Serializes the MBR with multiple copies.
   *
   * Generates binary data with the specified number of
   * redundant MBR copies.
   *
   * @param copyCount - Number of copies to include
   * @returns Binary MBR data with copies
   */
  async serializeWithCopies(copyCount?: number): Promise<Uint8Array> {
    return ipcSerializeMbrWithCopies(this.mbr, copyCount);
  }

  /**
   * Creates a deep clone of the builder.
   *
   * Returns a new MbrBuilder with copied MBR structure,
   * allowing independent modifications.
   *
   * @returns Cloned MbrBuilder instance
   */
  clone(): MbrBuilder {
    return new MbrBuilder(structuredClone(this.mbr));
  }
}