import { readUint16LE, readUint32LE } from './Binary';

/** Sparse header magic number identifier */
export const SPARSE_HEADER_MAGIC = 0xed26ff3a;

/** Supported sparse header major version */
export const SPARSE_HEADER_MAJOR_VER = 1;

/** Chunk type: Raw data */
export const CHUNK_TYPE_RAW = 0xcac1;

/** Chunk type: Fill value */
export const CHUNK_TYPE_FILL = 0xcac2;

/** Chunk type: Don't care (sparse hole) */
export const CHUNK_TYPE_DONT_CARE = 0xcac3;

/** Chunk type: CRC32 checksum */
export const CHUNK_TYPE_CRC32 = 0xcac4;

/**
 * Sparse file header structure.
 *
 * Contains metadata for Android sparse image format,
 * including block size, total blocks, and chunk count.
 */
export interface SparseHeader {
  /** Magic number (0xed26ff3a) */
  magic: number;
  /** Major version number */
  majorVersion: number;
  /** Minor version number */
  minorVersion: number;
  /** File header size in bytes */
  fileHdrSz: number;
  /** Chunk header size in bytes */
  chunkHdrSz: number;
  /** Block size in bytes */
  blkSz: number;
  /** Total blocks in output */
  totalBlks: number;
  /** Total chunks in file */
  totalChunks: number;
  /** Image checksum */
  imageChecksum: number;
}

/**
 * Sparse chunk header structure.
 *
 * Contains metadata for individual chunks within a
 * sparse image file.
 */
export interface ChunkHeader {
  /** Chunk type (RAW, FILL, DONT_CARE, CRC32) */
  chunkType: number;
  /** Reserved field */
  reserved1: number;
  /** Chunk size in blocks */
  chunkSz: number;
  /** Total chunk size including header */
  totalSz: number;
}

/**
 * Parses sparse file header from buffer.
 *
 * Reads 28-byte sparse header structure starting at offset.
 *
 * @param buffer - Uint8Array containing sparse header
 * @param offset - Byte offset to start reading (default: 0)
 * @returns SparseHeader structure
 */
export function parseSparseHeader(buffer: Uint8Array, offset: number = 0): SparseHeader {
  return {
    magic: readUint32LE(buffer, offset),
    majorVersion: readUint16LE(buffer, offset + 4),
    minorVersion: readUint16LE(buffer, offset + 6),
    fileHdrSz: readUint16LE(buffer, offset + 8),
    chunkHdrSz: readUint16LE(buffer, offset + 10),
    blkSz: readUint32LE(buffer, offset + 12),
    totalBlks: readUint32LE(buffer, offset + 16),
    totalChunks: readUint32LE(buffer, offset + 20),
    imageChecksum: readUint32LE(buffer, offset + 24),
  };
}

/**
 * Parses chunk header from buffer.
 *
 * Reads 12-byte chunk header structure starting at offset.
 *
 * @param buffer - Uint8Array containing chunk header
 * @param offset - Byte offset to start reading (default: 0)
 * @returns ChunkHeader structure
 */
export function parseChunkHeader(buffer: Uint8Array, offset: number = 0): ChunkHeader {
  return {
    chunkType: readUint16LE(buffer, offset),
    reserved1: readUint16LE(buffer, offset + 2),
    chunkSz: readUint32LE(buffer, offset + 4),
    totalSz: readUint32LE(buffer, offset + 8),
  };
}

/**
 * Checks if buffer contains valid sparse format.
 *
 * Validates magic number, version, and header sizes
 * to determine if data is in Android sparse format.
 *
 * @param buffer - Uint8Array to check
 * @returns True if buffer is valid sparse format
 */
export function isSparseFormat(buffer: Uint8Array): boolean {
  if (buffer.length < 28) {
    return false;
  }

  const header = parseSparseHeader(buffer);

  if (header.magic !== SPARSE_HEADER_MAGIC) {
    return false;
  }

  if (header.majorVersion !== SPARSE_HEADER_MAJOR_VER) {
    return false;
  }

  if (header.fileHdrSz !== 28) {
    return false;
  }

  if (header.chunkHdrSz !== 12) {
    return false;
  }

  return true;
}

/**
 * Probes buffer for sparse format.
 *
 * Alias for isSparseFormat, used for format detection.
 *
 * @param buffer - Uint8Array to probe
 * @returns True if buffer is sparse format
 */
export function sparseFormatProbe(buffer: Uint8Array): boolean {
  return isSparseFormat(buffer);
}

/**
 * Gets uncompressed size for sparse image.
 *
 * Calculates total output size based on block count
 * and block size from header.
 *
 * @param buffer - Uint8Array containing sparse header
 * @returns Uncompressed size in bytes, or 0 if not sparse
 */
export function getSparseUncompressedSize(buffer: Uint8Array): number {
  if (!isSparseFormat(buffer)) {
    return 0;
  }

  const header = parseSparseHeader(buffer);
  return header.totalBlks * header.blkSz;
}

/**
 * Gets total block count for sparse image.
 *
 * @param buffer - Uint8Array containing sparse header
 * @returns Total output block count, or 0 if not sparse
 */
export function getSparseBlockCount(buffer: Uint8Array): number {
  if (!isSparseFormat(buffer)) {
    return 0;
  }

  const header = parseSparseHeader(buffer);
  return header.totalBlks;
}

/**
 * Gets chunk count for sparse image.
 *
 * @param buffer - Uint8Array containing sparse header
 * @returns Number of chunks in file, or 0 if not sparse
 */
export function getSparseChunkCount(buffer: Uint8Array): number {
  if (!isSparseFormat(buffer)) {
    return 0;
  }

  const header = parseSparseHeader(buffer);
  return header.totalChunks;
}

/**
 * Gets block size for sparse image.
 *
 * @param buffer - Uint8Array containing sparse header
 * @returns Block size in bytes, or 0 if not sparse
 */
export function getSparseBlockSize(buffer: Uint8Array): number {
  if (!isSparseFormat(buffer)) {
    return 0;
  }

  const header = parseSparseHeader(buffer);
  return header.blkSz;
}