/**
 * Checksum / CRC calculation utilities for serial data.
 */

export type ChecksumType = 'CRC32' | 'CRC16_MODBUS' | 'CRC16_CCITT' | 'SUM8' | 'SUM16' | 'XOR8' | 'ADD8' | 'ADD8_0' | 'ADDR16';
export type ChecksumMode = 'append' | 'replace' | 'insert';
export type ChecksumEndian = 'big' | 'little';

export interface ChecksumConfig {
  enabled: boolean;
  type: ChecksumType;
  startOffset: number;
  mode: ChecksumMode;
  endian: ChecksumEndian;
  previewOnly: boolean;
  manualMode: boolean;
  manualValue: string;
}

export const DEFAULT_CHECKSUM_CONFIG: ChecksumConfig = {
  enabled: false,
  type: 'CRC16_MODBUS',
  startOffset: 0,
  mode: 'append',
  endian: 'big',
  previewOnly: false,
  manualMode: false,
  manualValue: '',
};

// --- CRC tables ---

function makeCrc16Table(poly: number): Uint16Array {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ poly) : (crc << 1);
    }
    table[i] = crc & 0xffff;
  }
  return table;
}

function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc;
  }
  return table;
}

const CRC16_MODBUS_TABLE = makeCrc16Table(0x8005);
const CRC16_CCITT_TABLE = makeCrc16Table(0x1021);
const CRC32_TABLE = makeCrc32Table();

// --- Calculation functions ---

function calcCrc16(data: Uint8Array, table: Uint16Array, initial: number): number {
  let crc = initial & 0xffff;
  for (const b of data) {
    crc = ((crc << 8) ^ table[((crc >> 8) ^ b) & 0xff]) & 0xffff;
  }
  return crc;
}

function calcCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) {
    crc = CRC32_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function calcSum8(data: Uint8Array): number {
  return data.reduce((sum, b) => (sum + b) & 0xff, 0);
}

function calcSum16(data: Uint8Array): number {
  return data.reduce((sum, b) => (sum + b) & 0xffff, 0);
}

function calcXor8(data: Uint8Array): number {
  return data.reduce((xor, b) => xor ^ b, 0);
}

function calcAdd8(data: Uint8Array): number {
  return data.reduce((sum, b) => (sum + b) & 0xff, 0);
}

/** 0-ADD8: complement so (sum + checksum) & 0xFF == 0 */
function calcAdd8_0(data: Uint8Array): number {
  const sum = data.reduce((s, b) => (s + b) & 0xff, 0);
  return (256 - sum) & 0xff;
}

/**
 * Calculate checksum for the given data based on type.
 * Returns the raw checksum value as a number.
 */
export function calcChecksum(data: Uint8Array, type: ChecksumType): number {
  switch (type) {
    case 'CRC32':
      return calcCrc32(data);
    case 'CRC16_MODBUS':
      return calcCrc16(data, CRC16_MODBUS_TABLE, 0xffff);
    case 'CRC16_CCITT':
      return calcCrc16(data, CRC16_CCITT_TABLE, 0x0000);
    case 'SUM8':
      return calcSum8(data);
    case 'SUM16':
      return calcSum16(data);
    case 'XOR8':
      return calcXor8(data);
    case 'ADD8':
      return calcAdd8(data);
    case 'ADD8_0':
      return calcAdd8_0(data);
    case 'ADDR16':
      // ADDR16 = sum of address bytes + data bytes, XORed into 8-bit
      return calcXor8(data);
    default:
      return 0;
  }
}

/** Get the byte length of a checksum type's result. */
export function checksumByteLen(type: ChecksumType): number {
  switch (type) {
    case 'CRC32': return 4;
    case 'CRC16_MODBUS':
    case 'CRC16_CCITT':
    case 'SUM16': return 2;
    case 'SUM8':
    case 'XOR8':
    case 'ADD8':
    case 'ADD8_0':
    case 'ADDR16': return 1;
    default: return 0;
  }
}

/** Convert a numeric checksum value to bytes with the given endianness and length. */
export function checksumToBytes(value: number, len: number, endian: ChecksumEndian): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < len; i++) {
    if (endian === 'big') {
      bytes.push((value >>> ((len - 1 - i) * 8)) & 0xff);
    } else {
      bytes.push((value >>> (i * 8)) & 0xff);
    }
  }
  return bytes;
}

/** Parse hex string like "A1 3F" or "A13F" into byte array */
function parseHexBytes(hex: string): number[] {
  const clean = hex.replace(/\s/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    const b = parseInt(clean.substring(i, i + 2), 16);
    if (!isNaN(b)) bytes.push(b);
  }
  return bytes;
}

/**
 * Apply checksum to original data according to config.
 * Returns the modified byte array, or the original if config is disabled.
 */
export function applyChecksum(originalData: number[], config: ChecksumConfig): number[] {
  if (!config.enabled || originalData.length === 0) return originalData;

  // Get checksum bytes: either from manual input or auto-calculated
  let csBytes: number[];
  if (config.manualMode) {
    csBytes = parseHexBytes(config.manualValue);
    if (csBytes.length === 0) return originalData;
  } else {
    const start = Math.max(0, Math.min(config.startOffset, originalData.length));
    const rangeData = new Uint8Array(originalData.slice(start));
    const value = calcChecksum(rangeData, config.type);
    csBytes = checksumToBytes(value, checksumByteLen(config.type), config.endian);
  }

  if (config.previewOnly) return originalData;

  const start = Math.max(0, Math.min(config.startOffset, originalData.length));
  const result = [...originalData];
  switch (config.mode) {
    case 'append':
      result.push(...csBytes);
      break;
    case 'replace':
      result.splice(start, csBytes.length, ...csBytes);
      break;
    case 'insert':
      result.splice(start, 0, ...csBytes);
      break;
  }
  return result;
}

/**
 * Calculate checksum for preview display.
 * Returns a formatted hex string of the checksum value.
 */
export function previewChecksum(originalData: number[], config: ChecksumConfig): string {
  if (config.manualMode) {
    const bytes = parseHexBytes(config.manualValue);
    return bytes.length > 0
      ? bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
      : '—';
  }
  if (originalData.length === 0) return '—';
  const start = Math.max(0, Math.min(config.startOffset, originalData.length));
  const rangeData = new Uint8Array(originalData.slice(start));
  const value = calcChecksum(rangeData, config.type);
  const len = checksumByteLen(config.type);
  const bytes = checksumToBytes(value, len, config.endian);
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
