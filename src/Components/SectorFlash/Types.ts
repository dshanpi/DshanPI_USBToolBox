import { MbrInfo, PartitionInfo } from '../../FlashConfig/Types';
import { FlashDevice } from '../../FlashManager';

/**
 * Sector flash component state.
 *
 * Contains the current state of the sector flash tool including
 * loaded firmware, MBR info, device selection, and flash status.
 */
export interface SectorFlashState {
  /** Boot image file path */
  bootImagePath: string | null;
  /** parsed MBR information */
  mbrInfo: MbrInfo | null;
  /** Whether MBR has been modified from original */
  mbrModified: boolean;
  /** Selected flash device */
  selectedDevice: FlashDevice | null;
  /** Whether flash operation is active */
  isFlashing: boolean;
  /** Loading state indicator */
  loading: boolean;
}

/**
 * Partition edit form data.
 *
 * String-based representation of partition info for form editing,
 * converting BigInt addresses to strings for user input.
 */
export interface PartitionEditData {
  /** Partition name */
  name: string;
  /** Partition class name */
  classname: string;
  /** Partition address as string */
  address: string;
  /** Partition length as string */
  length: string;
  /** User type as hex string */
  user_type: string;
  /** Keydata flag as string */
  keydata: string;
  /** Read-only flag */
  readonly: boolean;
}

/**
 * Converts PartitionInfo to edit form data.
 *
 * Transforms BigInt values to strings and numeric flags to
 * hex/decimal strings for user editing.
 *
 * @param partition - PartitionInfo to convert
 * @returns PartitionEditData for form display
 */
export function partitionInfoToEditData(partition: PartitionInfo): PartitionEditData {
  return {
    name: partition.name,
    classname: partition.classname,
    address: partition.address.toString(),
    length: partition.length.toString(),
    user_type: partition.user_type.toString(16),
    keydata: partition.keydata.toString(),
    readonly: partition.readonly,
  };
}

/**
 * Converts edit form data to PartitionInfo.
 *
 * Parses string values back to BigInt and numeric types
 * after user editing.
 *
 * @param data - PartitionEditData from form
 * @returns PartitionInfo structure
 */
export function editDataToPartitionInfo(data: PartitionEditData): PartitionInfo {
  return {
    name: data.name,
    classname: data.classname,
    address: BigInt(data.address || '0'),
    length: BigInt(data.length || '0'),
    user_type: parseInt(data.user_type || '0', 16),
    keydata: parseInt(data.keydata || '0', 10),
    readonly: data.readonly,
  };
}