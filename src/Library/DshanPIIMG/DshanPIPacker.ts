import { ImageHeader, FileHeader, ImageInfo, FileInfo, IMAGEWTY_MAGIC } from './Types';
import { getFunctionBySubtype } from './GetImageData';
import {
  ipcParseFirmwareImage,
  ipcReadFirmwareEntryByFilename,
  ipcReadFirmwareEntryByMaintypeSubtype,
  ipcReadFirmwareEntryRangeByFilename,
  ipcReadFirmwareEntryRangeByMaintypeSubtype,
} from '../../Platform/IPC';
import { formatErrorMessage } from '../../Utils/Error';

/** Suffix appended to partition names for download file subtype */
const PARTITION_DOWNLOADFILE_SUFFIX = '0000000000';

/**
 * Result from firmware image parsing.
 *
 * Contains image header, file headers, encryption status, and any errors.
 */
interface ParseImageResult {
  /** Image information if parsing succeeded */
  image_info: ImageInfo | null;
  /** Array of file headers found in image */
  file_headers: FileHeader[];
  /** Whether the image is encrypted (cannot be parsed) */
  is_encrypted: boolean;
  /** Error message if parsing failed */
  last_error: string | null;
}

/**
 * Firmware image packer for IMAGEWTY format files.
 *
 * DshanPIPacker provides functionality for loading, parsing, and extracting
 * data from Allwinner firmware images in IMAGEWTY format. The firmware image
 * contains multiple files (FES, UBoot, MBR, partitions) organized by maintype
 * and subtype identifiers.
 *
 * Parsing is performed by the Rust backend for efficiency, with results
 * passed back to TypeScript for UI display and operation planning.
 *
 * Example usage:
 * ```typescript
 * const packer = new DshanPIPacker();
 * if (await packer.loadImageFromPath('/path/to/firmware.img')) {
 *   const uboot = await packer.getFileDataByMaintypeSubtype('12345678', 'UBOOT_0000000000');
 *   const partitions = packer.getFileHeaders().filter(fh => fh.maintype === 'LOGO');
 * }
 * ```
 */
export class DshanPIPacker {
  /** Path to loaded firmware image file */
  private filePath: string | null = null;

  /** Image header containing metadata */
  private imageHeader: ImageHeader | null = null;

  /** Array of file headers for entries in image */
  private fileHeaders: FileHeader[] = [];

  /** Whether the loaded image is encrypted */
  private isEncrypted = false;

  /** Whether an image has been successfully loaded */
  private imageLoaded = false;

  /** Last error message from operations */
  private lastError: string | null = null;

  /**
   * Loads and parses a firmware image from file path.
   *
   * Parses the IMAGEWTY format image using the Rust backend,
   * extracting headers and file information. Returns false if
   * the image is encrypted or parsing fails.
   *
   * @param filePath - Path to firmware image file
   * @returns True if image loaded successfully, false otherwise
   */
  async loadImageFromPath(filePath: string): Promise<boolean> {
    try {
      this.lastError = null;
      const result = (await ipcParseFirmwareImage(filePath)) as ParseImageResult;

      this.filePath = filePath;
      this.isEncrypted = result.is_encrypted;
      this.lastError = result.last_error;
      this.fileHeaders = result.file_headers ?? [];
      this.imageHeader = result.image_info?.header ?? null;
      this.imageLoaded = !this.isEncrypted && !!this.imageHeader;

      return this.imageLoaded;
    } catch (error) {
      this.lastError = formatErrorMessage(error);
      this.filePath = null;
      this.imageHeader = null;
      this.fileHeaders = [];
      this.isEncrypted = false;
      this.imageLoaded = false;
      return false;
    }
  }

  /**
   * Loads image from ArrayBuffer (deprecated).
   *
   * This method is no longer supported; parsing is done in Rust backend.
   *
   * @deprecated Use loadImageFromPath instead
   * @param _data - ArrayBuffer with image data
   * @throws Error indicating method is deprecated
   */
  loadImage(_data: ArrayBuffer): boolean {
    throw new Error('DshanPIPacker.loadImage is no longer supported on the TS side');
  }

  /**
   * Checks if an image has been successfully loaded.
   *
   * @returns True if image is loaded and parsed
   */
  isImageLoaded(): boolean {
    return this.imageLoaded;
  }

  /**
   * Checks if the loaded image is encrypted.
   *
   * Encrypted images cannot be parsed or extracted.
   *
   * @returns True if image is encrypted
   */
  isEncryptedImage(): boolean {
    return this.isEncrypted;
  }

  /**
   * Gets the last error message from operations.
   *
   * @returns Error message string or null if no error
   */
  getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Gets the image header with metadata.
   *
   * @returns ImageHeader object or null if not loaded
   */
  getImageHeader(): ImageHeader | null {
    return this.imageHeader;
  }

  /**
   * Gets all file headers from the image.
   *
   * File headers contain information about each entry in the
   * firmware image including maintype, subtype, and offsets.
   *
   * @returns Array of FileHeader objects
   */
  getFileHeaders(): FileHeader[] {
    return this.fileHeaders;
  }

  /**
   * Gets complete image information for UI display.
   *
   * Combines header and file information into a single object
   * suitable for serialization and display.
   *
   * @returns ImageInfo object or null if not loaded
   */
  getImageInfo(): ImageInfo | null {
    if (!this.imageLoaded || !this.imageHeader) {
      return null;
    }

    const files: FileInfo[] = this.fileHeaders.map((fh) => {
      const v = fh.v3 || fh.v1;
      return {
        filename: v?.filename || '',
        maintype: fh.maintype,
        subtype: fh.subtype,
        storedLength: v?.stored_length || 0,
        originalLength: v?.original_length || 0,
        offset: v?.offset || 0,
      };
    });

    return {
      header: this.imageHeader,
      files,
      isEncrypted: this.isEncrypted,
    };
  }

  /**
   * Checks if a file exists in the image by filename.
   *
   * @param filename - Filename to search for
   * @returns True if file exists in image
   */
  checkFileByFilename(filename: string): boolean {
    return this.fileHeaders.some((fh) => {
      const v = fh.v3 || fh.v1;
      return v?.filename === filename;
    });
  }

  /**
   * Gets file header by filename.
   *
   * @param filename - Filename to search for
   * @returns FileHeader or null if not found
   */
  getFileHeaderByFilename(filename: string): FileHeader | null {
    return (
      this.fileHeaders.find((fh) => {
        const v = fh.v3 || fh.v1;
        return v?.filename === filename;
      }) || null
    );
  }

  /**
   * Gets file data by filename.
   *
   * Reads and returns the complete file content from the image.
   *
   * @param filename - Filename to read
   * @returns Uint8Array with file data or null if not found
   */
  async getFileDataByFilename(filename: string): Promise<Uint8Array | null> {
    if (!this.imageLoaded || !this.filePath) {
      return null;
    }
    const data = await ipcReadFirmwareEntryByFilename(this.filePath, filename);
    return data ? new Uint8Array(data) : null;
  }

  /**
   * Gets file data by maintype and subtype identifiers.
   *
   * Maintype and subtype are 8 and 16 character identifiers
   * used to categorize files in IMAGEWTY format.
   *
   * @param maintype - 8-character maintype identifier
   * @param subtype - 16-character subtype identifier
   * @returns Uint8Array with file data or null if not found
   */
  async getFileDataByMaintypeSubtype(
    maintype: string,
    subtype: string
  ): Promise<Uint8Array | null> {
    if (!this.imageLoaded || !this.filePath) {
      return null;
    }
    const data = await ipcReadFirmwareEntryByMaintypeSubtype(this.filePath, maintype, subtype);
    return data ? new Uint8Array(data) : null;
  }

  /**
   * Gets file offset and length by filename.
   *
   * Returns position information for the file within the image,
   * useful for partial reads or position calculations.
   *
   * @param filename - Filename to search for
   * @returns Object with offset and length, or null if not found
   */
  getFileInfoByFilename(filename: string): { offset: number; length: number } | null {
    if (!this.imageLoaded) {
      return null;
    }

    const fileHeader = this.getFileHeaderByFilename(filename);
    if (!fileHeader) {
      return null;
    }

    const v = fileHeader.v3 || fileHeader.v1;
    if (!v) {
      return null;
    }

    return { offset: v.offset, length: v.original_length };
  }

  /**
   * Gets file offset and length by maintype and subtype.
   *
   * @param maintype - 8-character maintype identifier
   * @param subtype - 16-character subtype identifier
   * @returns Object with offset and length, or null if not found
   */
  getFileInfoByMaintypeSubtype(
    maintype: string,
    subtype: string
  ): { offset: number; length: number } | null {
    if (!this.imageLoaded) {
      return null;
    }

    const fileHeader = this.fileHeaders.find((fh) => {
      return fh.maintype === maintype && fh.subtype === subtype;
    });

    if (!fileHeader) {
      return null;
    }

    const v = fileHeader.v3 || fileHeader.v1;
    if (!v) {
      return null;
    }

    return { offset: v.offset, length: v.original_length };
  }

  /**
   * Reads a range of data from a file by filename.
   *
   * Useful for reading partial file contents without loading
   * the entire file into memory.
   *
   * @param filename - Filename to read from
   * @param start - Start offset within the file
   * @param length - Number of bytes to read
   * @returns Uint8Array with data or null if not found
   */
  async getFileDataRangeByFilename(
    filename: string,
    start: number,
    length: number
  ): Promise<Uint8Array | null> {
    if (!this.imageLoaded || !this.filePath) {
      return null;
    }
    const data = await ipcReadFirmwareEntryRangeByFilename(this.filePath, filename, start, length);
    return data ? new Uint8Array(data) : null;
  }

  /**
   * Reads a range of data from a file by maintype and subtype.
   *
   * @param maintype - 8-character maintype identifier
   * @param subtype - 16-character subtype identifier
   * @param start - Start offset within the file
   * @param length - Number of bytes to read
   * @returns Uint8Array with data or null if not found
   */
  async getFileDataRangeByMaintypeSubtype(
    maintype: string,
    subtype: string,
    start: number,
    length: number
  ): Promise<Uint8Array | null> {
    if (!this.imageLoaded || !this.filePath) {
      return null;
    }
    const data = await ipcReadFirmwareEntryRangeByMaintypeSubtype(
      this.filePath,
      maintype,
      subtype,
      start,
      length
    );
    return data ? new Uint8Array(data) : null;
  }

  /**
   * Frees the loaded image and resets all state.
   *
   * Called after flash operations complete to release resources.
   */
  async freeImage(): Promise<void> {
    this.filePath = null;
    this.imageHeader = null;
    this.fileHeaders = [];
    this.imageLoaded = false;
    this.isEncrypted = false;
    this.lastError = null;
  }

  /**
   * Gets human-readable function name for a subtype.
   *
   * @param subtype - 16-character subtype identifier
   * @returns Localized function name or null if unknown
   */
  getFunctionBySubtype(subtype: string): string | null {
    return getFunctionBySubtype(subtype);
  }

  /**
   * Builds subtype identifier for a partition download file.
   *
   * Partition download files use a specific subtype format:
   * partition name (uppercase, dots replaced with underscores)
   * followed by '0000000000' suffix, truncated to 16 characters.
   *
   * @param partitionName - Partition name (e.g., 'boot.fex')
   * @returns 16-character subtype identifier
   */
  buildSubtypeByFilename(partitionName: string): string {
    const suffix = `${partitionName.toUpperCase().replace('.', '_')}${PARTITION_DOWNLOADFILE_SUFFIX}`;
    return suffix.slice(0, 16);
  }

  /**
   * Gets the IMAGEWTY magic string from the header.
   *
   * @returns Magic string or default IMAGEWTY if not loaded
   */
  getMagic(): string {
    return this.imageHeader?.magic || IMAGEWTY_MAGIC;
  }
}