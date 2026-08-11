/**
 * Converts Uint8Array to string, stopping at null terminator.
 *
 * Reads bytes from array until null byte (0) is encountered
 * or max length is reached, converting each byte to a character.
 * Used for reading fixed-length string fields from binary structures.
 *
 * @param arr - Uint8Array containing string bytes
 * @param maxLength - Optional maximum length (default: array length)
 * @returns Decoded string without null terminator
 */
export function uint8ArrayToString(arr: Uint8Array, maxLength?: number): string {
  const len = maxLength ?? arr.length;
  let result = '';
  for (let i = 0; i < len && arr[i] !== 0; i++) {
    result += String.fromCharCode(arr[i]);
  }
  return result;
}

/**
 * Converts string to fixed-length Uint8Array.
 *
 * Encodes string characters to bytes, padding with zeros
 * if string is shorter than the target length. Used for
 * writing fixed-length string fields to binary structures.
 *
 * @param str - String to encode
 * @param length - Target array length
 * @returns Uint8Array with encoded string and zero padding
 */
export function stringToUint8Array(str: string, length: number): Uint8Array {
  const arr = new Uint8Array(length);
  for (let i = 0; i < str.length && i < length; i++) {
    arr[i] = str.charCodeAt(i);
  }
  return arr;
}

/**
 * Reads 32-bit unsigned integer from buffer (little-endian).
 *
 * Reads 4 bytes starting at offset and interprets them as
 * a 32-bit unsigned integer in little-endian byte order.
 *
 * @param buffer - Uint8Array to read from
 * @param offset - Byte offset to start reading
 * @returns 32-bit unsigned integer value
 */
export function readUint32LE(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset] |
      (buffer[offset + 1] << 8) |
      (buffer[offset + 2] << 16) |
      (buffer[offset + 3] << 24)) >>>
    0
  );
}

/**
 * Writes 32-bit unsigned integer to buffer (little-endian).
 *
 * Writes a 32-bit value as 4 bytes in little-endian order
 * starting at the specified offset.
 *
 * @param buffer - Uint8Array to write to
 * @param offset - Byte offset to start writing
 * @param value - 32-bit unsigned integer value to write
 */
export function writeUint32LE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
  buffer[offset + 3] = (value >> 24) & 0xff;
}

/**
 * Reads 16-bit unsigned integer from buffer (little-endian).
 *
 * Reads 2 bytes starting at offset and interprets them as
 * a 16-bit unsigned integer in little-endian byte order.
 *
 * @param buffer - Uint8Array to read from
 * @param offset - Byte offset to start reading
 * @returns 16-bit unsigned integer value
 */
export function readUint16LE(buffer: Uint8Array, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

/**
 * Writes 16-bit unsigned integer to buffer (little-endian).
 *
 * Writes a 16-bit value as 2 bytes in little-endian order
 * starting at the specified offset.
 *
 * @param buffer - Uint8Array to write to
 * @param offset - Byte offset to start writing
 * @param value - 16-bit unsigned integer value to write
 */
export function writeUint16LE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
}

/**
 * Reads a slice of Uint8Array from buffer.
 *
 * Creates a new Uint8Array containing the specified range
 * of bytes from the source buffer.
 *
 * @param buffer - Uint8Array to read from
 * @param offset - Byte offset to start reading
 * @param length - Number of bytes to read
 * @returns Uint8Array slice of the buffer
 */
export function readUint8Array(buffer: Uint8Array, offset: number, length: number): Uint8Array {
  return buffer.slice(offset, offset + length);
}

/**
 * Writes Uint8Array to target buffer at offset.
 *
 * Copies all bytes from source array to target buffer
 * starting at the specified offset.
 *
 * @param target - Uint8Array to write to
 * @param offset - Byte offset to start writing
 * @param source - Uint8Array to copy
 */
export function writeUint8Array(target: Uint8Array, offset: number, source: Uint8Array): void {
  target.set(source, offset);
}

/**
 * Reads array of 32-bit unsigned integers from buffer.
 *
 * Reads count consecutive 32-bit values starting at offset,
 * each in little-endian byte order.
 *
 * @param buffer - Uint8Array to read from
 * @param offset - Byte offset to start reading
 * @param count - Number of 32-bit values to read
 * @returns Array of 32-bit unsigned integers
 */
export function readUint32Array(buffer: Uint8Array, offset: number, count: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    result.push(readUint32LE(buffer, offset + i * 4));
  }
  return result;
}

/**
 * Writes array of 32-bit unsigned integers to buffer.
 *
 * Writes each value from the array as 4 bytes in little-endian
 * order, starting at the specified offset.
 *
 * @param buffer - Uint8Array to write to
 * @param offset - Byte offset to start writing
 * @param values - Array of 32-bit values to write
 */
export function writeUint32Array(buffer: Uint8Array, offset: number, values: number[]): void {
  for (let i = 0; i < values.length; i++) {
    writeUint32LE(buffer, offset + i * 4, values[i]);
  }
}

/**
 * Combines high and low 32-bit parts into 64-bit BigInt.
 *
 * Used for handling 64-bit addresses/sizes that are stored
 * as two 32-bit values in binary structures.
 *
 * @param hi - High 32-bit part
 * @param lo - Low 32-bit part
 * @returns 64-bit BigInt value
 */
export function combineHiLo(hi: number, lo: number): bigint {
  return (BigInt(hi) << 32n) | BigInt(lo);
}

/**
 * Reads 32-bit signed integer from buffer (little-endian).
 *
 * Reads a 32-bit value and interprets it as a signed integer,
 * handling the sign bit appropriately.
 *
 * @param buffer - Uint8Array to read from
 * @param offset - Byte offset to start reading
 * @returns 32-bit signed integer value
 */
export function readInt32LE(buffer: Uint8Array, offset: number): number {
  const value = readUint32LE(buffer, offset);
  return value > 0x7fffffff ? value - 0x100000000 : value;
}

/**
 * Reads 32-bit unsigned integer from buffer (big-endian).
 *
 * Reads 4 bytes starting at offset and interprets them as
 * a 32-bit unsigned integer in big-endian byte order.
 *
 * @param buffer - Uint8Array to read from
 * @param offset - Byte offset to start reading
 * @returns 32-bit unsigned integer value
 */
export function readUint32BE(buffer: Uint8Array, offset: number): number {
  return (
    ((buffer[offset] << 24) |
      (buffer[offset + 1] << 16) |
      (buffer[offset + 2] << 8) |
      buffer[offset + 3]) >>>
    0
  );
}

/**
 * Writes 32-bit unsigned integer to buffer (big-endian).
 *
 * Writes a 32-bit value as 4 bytes in big-endian order
 * starting at the specified offset.
 *
 * @param buffer - Uint8Array to write to
 * @param offset - Byte offset to start writing
 * @param value - 32-bit unsigned integer value to write
 */
export function writeUint32BE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = (value >> 24) & 0xff;
  buffer[offset + 1] = (value >> 16) & 0xff;
  buffer[offset + 2] = (value >> 8) & 0xff;
  buffer[offset + 3] = value & 0xff;
}