/**
 * Modbus Protocol Utilities — CRC, frame building, parsing.
 * Supports Modbus RTU and Modbus TCP.
 */

/** Calculate Modbus CRC-16 for RTU frames */
export function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) crc = (crc >> 1) ^ 0xa001;
      else crc = crc >> 1;
    }
  }
  return crc & 0xffff;
}

/** Build a Modbus RTU request frame: [slaveId, funcCode, ...dataBytes, crcLo, crcHi] */
export function buildRTUFrame(slaveId: number, funcCode: number, dataBytes: number[]): Uint8Array {
  const pdu = [slaveId, funcCode, ...dataBytes];
  const crc = crc16(new Uint8Array(pdu));
  return new Uint8Array([...pdu, crc & 0xff, (crc >> 8) & 0xff]);
}

/** Parse a Modbus RTU response. Returns parsed payload or error description. */
export function parseRTUResponse(buffer: Uint8Array): ModbusResponse | ModbusError {
  if (buffer.length < 4) return { error: 'Response too short' };
  const recvCrc = (buffer[buffer.length - 2] | (buffer[buffer.length - 1] << 8));
  const calcCrc = crc16(buffer.slice(0, -2));
  if (recvCrc !== calcCrc) return { error: `CRC mismatch: recv 0x${recvCrc.toString(16)}, calc 0x${calcCrc.toString(16)}` };
  const slaveId = buffer[0];
  const funcCode = buffer[1];
  if ((funcCode & 0x80) !== 0) {
    const exceptionCode = buffer[2];
    return { error: `Exception: func=${funcCode & 0x7f} code=${exceptionCode}`, slaveId, funcCode, exception: exceptionCode };
  }
  return {
    slaveId,
    funcCode,
    data: buffer.slice(2, buffer.length - 2), // Strip slaveId, funcCode, CRC
    raw: buffer.slice(0, -2), // PDU without CRC
  };
}

/** Build a Modbus TCP request frame: MBAP header + PDU */
export function buildTCPFrame(transId: number, slaveId: number, funcCode: number, dataBytes: number[]): Uint8Array {
  const pdu = [slaveId, funcCode, ...dataBytes];
  const len = pdu.length;
  const mbap = [
    (transId >> 8) & 0xff, transId & 0xff, // Transaction ID
    0, 0, // Protocol ID (0 = Modbus)
    (len >> 8) & 0xff, len & 0xff, // Length (PDU byte count)
  ];
  return new Uint8Array([...mbap, ...pdu]);
}

/** Parse a Modbus TCP response. */
export function parseTCPResponse(buffer: Uint8Array): ModbusResponse | ModbusError {
  if (buffer.length < 8) return { error: 'Response too short for MBAP' };
  const transId = (buffer[0] << 8) | buffer[1];
  const len = (buffer[4] << 8) | buffer[5];
  if (buffer.length < 6 + len) return { error: 'Incomplete TCP frame' };
  const pdu = buffer.slice(6, 6 + len);
  const slaveId = pdu[0];
  const funcCode = pdu[1];
  if ((funcCode & 0x80) !== 0) {
    const exceptionCode = pdu[2];
    return { error: `Exception: func=${funcCode & 0x7f} code=${exceptionCode}`, slaveId, funcCode, exception: exceptionCode };
  }
  return { slaveId, funcCode, data: pdu.slice(2), raw: pdu, transId };
}

// ─── Types ────────────────────────────────────────────

export interface ModbusResponse {
  slaveId: number;
  funcCode: number;
  data: Uint8Array;
  raw?: Uint8Array;
  transId?: number;
}

export interface ModbusError {
  error: string;
  slaveId?: number;
  funcCode?: number;
  exception?: number;
}

export function isModbusError(r: ModbusResponse | ModbusError): r is ModbusError {
  return 'error' in r;
}

// ─── Function code helpers ────────────────────────────

export const FUNC_CODES: Record<number, string> = {
  1: 'Read Coils (01)',
  2: 'Read Discrete Inputs (02)',
  3: 'Read Holding Registers (03)',
  4: 'Read Input Registers (04)',
  5: 'Write Single Coil (05)',
  6: 'Write Single Register (06)',
  15: 'Write Multiple Coils (15)',
  16: 'Write Multiple Registers (16)',
};

export function isReadFunc(code: number): boolean {
  return [1, 2, 3, 4].includes(code);
}

export function isSingleWriteFunc(code: number): boolean {
  return [5, 6].includes(code);
}

export function isMultiWriteFunc(code: number): boolean {
  return [15, 16].includes(code);
}

// ─── PDU data builder helpers ─────────────────────────

/** Build PDU data bytes for a given function code */
export function buildPDUData(
  funcCode: number,
  startAddr: number,
  quantity: number,
  writeBytes: number[],
): number[] {
  if (isReadFunc(funcCode)) {
    return [(startAddr >> 8) & 0xff, startAddr & 0xff, (quantity >> 8) & 0xff, quantity & 0xff];
  }
  if (funcCode === 5) {
    const userVal = writeBytes.length >= 2 ? ((writeBytes[0] << 8) | writeBytes[1]) : 0;
    const coilVal = userVal === 0 ? 0x0000 : 0xff00;
    return [(startAddr >> 8) & 0xff, startAddr & 0xff, (coilVal >> 8) & 0xff, coilVal & 0xff];
  }
  if (funcCode === 6) {
    const regVal = writeBytes.length >= 2 ? ((writeBytes[0] << 8) | writeBytes[1]) : quantity;
    return [(startAddr >> 8) & 0xff, startAddr & 0xff, (regVal >> 8) & 0xff, regVal & 0xff];
  }
  if (funcCode === 15) {
    const byteCount = Math.ceil(quantity / 8);
    const data = new Array(byteCount).fill(0);
    for (let i = 0; i < Math.min(quantity, writeBytes.length * 8); i++) {
      const bit = (writeBytes[Math.floor(i / 8)] >> (i % 8)) & 1;
      if (bit) data[Math.floor(i / 8)] |= (1 << (i % 8));
    }
    return [(startAddr >> 8) & 0xff, startAddr & 0xff, (quantity >> 8) & 0xff, quantity & 0xff, byteCount, ...data];
  }
  if (funcCode === 16) {
    const byteCount = quantity * 2;
    const data: number[] = [];
    for (let i = 0; i < quantity; i++) {
      const hi = i * 2 < writeBytes.length ? writeBytes[i * 2] : 0;
      const lo = i * 2 + 1 < writeBytes.length ? writeBytes[i * 2 + 1] : 0;
      data.push(hi, lo);
    }
    return [(startAddr >> 8) & 0xff, startAddr & 0xff, (quantity >> 8) & 0xff, quantity & 0xff, byteCount, ...data];
  }
  return [];
}

/** Format hex bytes as readable string */
export function formatHex(data: Uint8Array | number[]): string {
  const arr = Array.isArray(data) ? data : Array.from(data);
  return arr.map((b) => '0x' + b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

// ─── ASCII / LRC utilities ───────────────────────────

/** Calculate LRC (Longitudinal Redundancy Check) for Modbus ASCII */
export function lrc(data: Uint8Array | number[]): number {
  const arr = Array.isArray(data) ? data : Array.from(data);
  let sum = 0;
  for (const b of arr) sum = (sum + b) & 0xff;
  return ((~sum + 1) & 0xff);
}

/** Build a Modbus ASCII request frame: ":01 03 0000 000A F7\r\n" style string */
export function buildASCIIFrame(slaveId: number, funcCode: number, dataBytes: number[]): string {
  const pdu = [slaveId, funcCode, ...dataBytes];
  const lrcVal = lrc(new Uint8Array(pdu));
  const hex = pdu.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  const lrcHex = lrcVal.toString(16).padStart(2, '0').toUpperCase();
  return `:${hex}${lrcHex}\r\n`;
}

/** Format raw bytes as a compact RTU hex string: "01 03 00 00 00 0A C5 CD" */
export function formatRTUHex(data: Uint8Array | number[]): string {
  const arr = Array.isArray(data) ? data : Array.from(data);
  return arr.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/** Convert response payload to array of 16-bit register values */
export function responseToRegisters(data: Uint8Array): number[] {
  if (data.length < 1) return [];
  const byteCount = data[0];
  const payload = data.slice(1, 1 + byteCount);
  const regs: number[] = [];
  for (let i = 0; i + 1 < payload.length; i += 2) {
    regs.push(((payload[i] << 8) | payload[i + 1]) & 0xffff);
  }
  return regs;
}

/** Convert response payload to array of bit values */
export function responseToBits(data: Uint8Array, count: number): number[] {
  if (data.length < 1) return [];
  const byteCount = data[0];
  const payload = data.slice(1, 1 + byteCount);
  const bits: number[] = [];
  for (let i = 0; i < count; i++) {
    const byte = payload[Math.floor(i / 8)] || 0;
    bits.push((byte >> (i % 8)) & 1);
  }
  return bits;
}

/** PLC address mapping for function codes. Returns the 1-based PLC address prefix */
export function getPLCAddressPrefix(funcCode: number): string {
  switch (funcCode) {
    case 1: return '0';   // Coils: 00001-09999
    case 2: return '1';   // Discrete Inputs: 10001-19999
    case 3: return '4';   // Holding Registers: 40001-49999
    case 4: return '3';   // Input Registers: 30001-39999
    default: return '';
  }
}

/** Parse response data into readable values */
export function parseResponseData(funcCode: number, data: Uint8Array): string {
  if (isReadFunc(funcCode)) {
    const byteCount = data[0];
    const payload = data.slice(1, 1 + byteCount);
    if (funcCode === 1 || funcCode === 2) {
      // Bit values
      const bits: number[] = [];
      for (let i = 0; i < byteCount * 8; i++) {
        const byte = payload[Math.floor(i / 8)] || 0;
        bits.push((byte >> (i % 8)) & 1);
      }
      return `Bits: [${bits.join(', ')}]`;
    }
    // Register values
    const regs: number[] = [];
    for (let i = 0; i + 1 < payload.length; i += 2) {
      regs.push(((payload[i] << 8) | payload[i + 1]) & 0xffff);
    }
    return `Regs: [${regs.map((v) => `0x${v.toString(16).padStart(4, '0').toUpperCase()} (${v})`).join(', ')}]`;
  }
  if (funcCode === 5 || funcCode === 6 || funcCode === 15 || funcCode === 16) {
    const addr = (data[0] << 8) | data[1];
    const val = (data[2] << 8) | data[3];
    return `Addr 0x${addr.toString(16).toUpperCase()}, Val 0x${val.toString(16).padStart(4, '0').toUpperCase()}`;
  }
  return formatHex(data);
}
