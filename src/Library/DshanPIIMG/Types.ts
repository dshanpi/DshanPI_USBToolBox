/** Magic string identifying IMAGEWTY format files */
export const IMAGEWTY_MAGIC = 'IMAGEWTY';

/** Length of the IMAGEWTY magic string */
export const IMAGEWTY_MAGIC_LEN = 8;

/** IMAGEWTY format version number */
export const IMAGEWTY_VERSION = 0x100234;

/** Length of each file header entry in bytes */
export const IMAGEWTY_FILEHDR_LEN = 1024;

/** Length of maintype identifier field */
export const IMAGEWTY_FHDR_MAINTYPE_LEN = 8;

/** Length of subtype identifier field */
export const IMAGEWTY_FHDR_SUBTYPE_LEN = 16;

/** Length of filename field */
export const IMAGEWTY_FHDR_FILENAME_LEN = 256;

/**
 * Version 1 image header structure.
 *
 * Legacy header format with PID/VID and file count.
 */
export interface ImageHeaderV1 {
  /** Product ID */
  pid: number;
  /** Vendor ID */
  vid: number;
  /** Hardware revision ID */
  hardware_id: number;
  /** Firmware ID */
  firmware_id: number;
  /** Unknown field (always 1?) */
  val1: number;
  /** Unknown field (always 1024?) */
  val1024: number;
  /** Number of files in image */
  num_files: number;
  /** Unknown field */
  val1024_2: number;
  /** Reserved fields */
  val0: number;
  val0_2: number;
  val0_3: number;
  val0_4: number;
}

/**
 * Version 3 image header structure.
 *
 * Extended header format with additional fields.
 */
export interface ImageHeaderV3 {
  /** Unknown field */
  unknown: number;
  /** Product ID */
  pid: number;
  /** Vendor ID */
  vid: number;
  /** Hardware revision ID */
  hardware_id: number;
  /** Firmware ID */
  firmware_id: number;
  /** Unknown field (always 1?) */
  val1: number;
  /** Unknown field (always 1024?) */
  val1024: number;
  /** Number of files in image */
  num_files: number;
  /** Unknown field */
  val1024_2: number;
  /** Reserved fields */
  val0: number;
  val0_2: number;
  val0_3: number;
  val0_4: number;
}

/**
 * Unified image header interface.
 *
 * Contains parsed header information from IMAGEWTY image,
 * supporting both V1 and V3 formats.
 */
export interface ImageHeader {
  /** Magic string (should be 'IMAGEWTY') */
  magic: string;
  /** Header version (1 or 3) */
  header_version: number;
  /** Header size in bytes */
  header_size: number;
  /** RAM base address for loading */
  ram_base: number;
  /** Firmware version number */
  version: number;
  /** Total image size in bytes */
  image_size: number;
  /** Image header size */
  image_header_size: number;
  /** Version 1 header fields if applicable */
  v1?: ImageHeaderV1;
  /** Version 3 header fields if applicable */
  v3?: ImageHeaderV3;
}

/**
 * Version 1 file header structure.
 *
 * Legacy file entry format with offset and length.
 */
export interface FileHeaderV1 {
  /** Unknown field */
  unknown_3: number;
  /** Stored (compressed) length in bytes */
  stored_length: number;
  /** Original (uncompressed) length in bytes */
  original_length: number;
  /** Offset within image file */
  offset: number;
  /** Unknown field */
  unknown: number;
  /** Entry filename */
  filename: string;
}

/**
 * Version 3 file header structure.
 *
 * Extended file entry format with padding fields.
 */
export interface FileHeaderV3 {
  /** Unknown field */
  unknown_0: number;
  /** Entry filename */
  filename: string;
  /** Stored (compressed) length in bytes */
  stored_length: number;
  /** Padding field */
  pad1: number;
  /** Original (uncompressed) length in bytes */
  original_length: number;
  /** Padding field */
  pad2: number;
  /** Offset within image file */
  offset: number;
}

/**
 * Unified file header interface.
 *
 * Contains parsed file entry information from IMAGEWTY image,
 * supporting both V1 and V3 formats.
 */
export interface FileHeader {
  /** Filename field length */
  filename_len: number;
  /** Total header size for this entry */
  total_header_size: number;
  /** 8-character maintype identifier */
  maintype: string;
  /** 16-character subtype identifier */
  subtype: string;
  /** Version 1 fields if applicable */
  v1?: FileHeaderV1;
  /** Version 3 fields if applicable */
  v3?: FileHeaderV3;
}

/**
 * Partition definition from partition configuration.
 *
 * Defines a single partition in the firmware partition table.
 */
export interface Partition {
  /** Partition name */
  name: string;
  /** Partition size in bytes */
  size: number;
  /** Download file path for partition content */
  downloadfile: string;
  /** User type attribute */
  user_type: number;
  /** Whether partition contains key data */
  keydata: boolean;
  /** Whether partition is encrypted */
  encrypt: boolean;
  /** Whether partition should be verified */
  verify: boolean;
  /** Whether partition is read-only */
  ro: boolean;
  /** Custom file path override (optional) */
  customFilePath?: string;
}

/**
 * Value type enumeration for configuration variables.
 */
export enum ValueType {
  /** Numeric value */
  NUMBER = 'NUMBER',
  /** String value */
  STRING = 'STRING',
  /** List item selection */
  LIST_ITEM = 'LIST_ITEM',
  /** Reference to another variable */
  REFERENCE = 'REFERENCE',
}

/**
 * Configuration variable definition.
 *
 * Represents a single variable in sys_config or board_config.
 */
export interface Variable {
  /** Variable name */
  name: string;
  /** Variable value type */
  type: ValueType;
  /** Numeric value if type is NUMBER */
  numberValue?: number;
  /** String value if type is STRING */
  stringValue?: string;
  /** List items if type is LIST_ITEM */
  items?: Variable[];
}

/**
 * Configuration group definition.
 *
 * Groups related variables in sys_config or board_config.
 */
export interface Group {
  /** Group name */
  name: string;
  /** Variables in this group */
  variables: Variable[];
}

/**
 * Complete image information for display.
 *
 * Combines header and file list for UI presentation.
 */
export interface ImageInfo {
  /** Image header with metadata */
  header: ImageHeader;
  /** Array of file information */
  files: FileInfo[];
  /** Whether image is encrypted */
  isEncrypted: boolean;
}

/**
 * File information extracted from file header.
 *
 * Simplified file entry info for UI display.
 */
export interface FileInfo {
  /** Entry filename */
  filename: string;
  /** 8-character maintype identifier */
  maintype: string;
  /** 16-character subtype identifier */
  subtype: string;
  /** Stored (compressed) length */
  storedLength: number;
  /** Original (uncompressed) length */
  originalLength: number;
  /** Offset within image */
  offset: number;
}