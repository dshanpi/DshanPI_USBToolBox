import { Partition } from './Types';
import { ipcParsePartitionConfig } from '../../Platform/IPC';

/**
 * Partition configuration data from parsing result.
 *
 * Contains MBR size and partition definitions extracted from
 * sys_partition.fex or similar partition configuration files.
 */
interface PartitionConfigDto {
  /** Total MBR size in bytes */
  mbr_size: number;
  /** Array of partition definitions */
  partitions: Partition[];
}

/**
 * Partition configuration parser for firmware partition tables.
 *
 * DshanPIPartition parses partition configuration files (sys_partition.fex)
 * that define the partition layout for firmware images. Provides methods
 * for querying partition information by name.
 *
 * Partition configuration includes:
 * - Partition name and size
 * - Download file path
 * - User type, encryption, verification flags
 *
 * Example usage:
 * ```typescript
 * const partitionParser = new DshanPIPartition();
 * await partitionParser.parseFromData(partitionData);
 * const bootPartition = partitionParser.getPartitionByName('boot');
 * ```
 */
export class DshanPIPartition {
  /** Total MBR partition table size */
  private mbrSize = 0;

  /** Array of parsed partition definitions */
  private partitions: Partition[] = [];

  /**
   * Parses partition configuration from binary data.
   *
   * Uses Rust backend for parsing partition config format.
   *
   * @param data - Binary partition configuration data
   * @returns True if parsing succeeded
   */
  async parseFromData(data: Uint8Array): Promise<boolean> {
    const parsed = (await ipcParsePartitionConfig(data)) as PartitionConfigDto;
    this.mbrSize = parsed.mbr_size ?? 0;
    this.partitions = parsed.partitions ?? [];
    return true;
  }

  /**
   * Parses partition configuration from string content.
   *
   * Encodes string to UTF-8 and parses as binary data.
   *
   * @param content - Partition configuration string
   * @returns True if parsing succeeded
   */
  async parseFromContent(content: string): Promise<boolean> {
    return this.parseFromData(new TextEncoder().encode(content));
  }

  /**
   * Gets the total MBR size.
   *
   * @returns MBR size in bytes
   */
  getMbrSize(): number {
    return this.mbrSize;
  }

  /**
   * Gets all partition definitions.
   *
   * @returns Array of Partition objects
   */
  getPartitions(): Partition[] {
    return this.partitions;
  }

  /**
   * Gets a partition by name.
   *
   * @param name - Partition name to search for
   * @returns Partition object or null if not found
   */
  getPartitionByName(name: string): Partition | null {
    return this.partitions.find((p) => p.name === name) || null;
  }

  /**
   * Checks if a partition name exists.
   *
   * @param name - Partition name to check
   * @returns True if partition exists
   */
  isPartitionNameExists(name: string): boolean {
    return this.partitions.some((p) => p.name === name);
  }

  /**
   * Serializes partition configuration to JSON.
   *
   * Useful for debugging and logging.
   *
   * @returns JSON string with partition data
   */
  dumpToJson(): string {
    return JSON.stringify(
      {
        mbr_size: this.mbrSize,
        partitions: this.partitions,
      },
      null,
      2
    );
  }

  /**
   * Clears all parsed partition data.
   */
  clear(): void {
    this.mbrSize = 0;
    this.partitions = [];
  }
}