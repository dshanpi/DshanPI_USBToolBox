import type { ChecksumConfig } from './checksum';

export interface SerialPortConfig {
  port: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  flowControl: string;
}

export interface DisplayOptions {
  showTimestamp: boolean;
  hexDisplay: boolean;
  ansiDisplay: boolean;
}

export type ReceiveFrameMode = 'idle' | 'fixed' | 'newline' | 'delimiter' | 'raw';
export type SerialTextEncoding = 'utf-8' | 'gbk' | 'ascii' | 'latin1';
export type LogDirectionFilter = 'all' | 'received' | 'sent';
export type LogTimeFilter = 'all' | '1m' | '5m' | '30m';
export type LogExportFormat = 'txt' | 'hex' | 'csv';

export interface ReceiveOptions {
  frameMode: ReceiveFrameMode;
  idleGapMs: number;
  fixedLength: number;
  delimiterHex: string;
  encoding: SerialTextEncoding;
  showInvisible: boolean;
}

export interface SerialProfileSnapshot {
  config: SerialPortConfig;
  displayOptions: DisplayOptions;
  receiveOptions: ReceiveOptions;
  checksumConfig: ChecksumConfig;
  sendText: string;
  sendHexMode: boolean;
  sendAppendNewline: boolean;
  autoRefresh: boolean;
  lockToBottom: boolean;
}

export interface SerialProfile {
  id: string;
  name: string;
  updatedAt: number;
  snapshot: SerialProfileSnapshot;
}

export const DEFAULT_SERIAL_CONFIG: SerialPortConfig = {
  port: '',
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none',
};

export const DEFAULT_RECEIVE_OPTIONS: ReceiveOptions = {
  frameMode: 'idle',
  idleGapMs: 15,
  fixedLength: 8,
  delimiterHex: '0D 0A',
  encoding: 'latin1',
  showInvisible: true,
};

export function parseHexBytes(value: string): number[] {
  const compact = value.replace(/(?:0x|\s|,|-)/gi, '');
  if (!compact || compact.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(compact)) return [];
  return compact.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [];
}

export function findByteSequence(data: number[], sequence: number[]): number {
  if (sequence.length === 0 || data.length < sequence.length) return -1;
  const finalStart = data.length - sequence.length;
  for (let start = 0; start <= finalStart; start += 1) {
    let matches = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (data[start + offset] !== sequence[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return start;
  }
  return -1;
}

function decodeSegment(
  data: number[],
  encoding: SerialTextEncoding,
  showInvisible: boolean
): string {
  if (data.length === 0) return '';
  if (encoding === 'latin1') {
    return data.map((byte) => String.fromCharCode(byte)).join('');
  }
  if (encoding === 'ascii') {
    return data
      .map((byte) =>
        byte <= 0x7e
          ? String.fromCharCode(byte)
          : showInvisible
            ? `\\x${byte.toString(16).padStart(2, '0').toUpperCase()}`
            : '�'
      )
      .join('');
  }

  const label = encoding === 'gbk' ? 'gbk' : 'utf-8';
  const decoded = new TextDecoder(label).decode(Uint8Array.from(data));
  if (!showInvisible || !decoded.includes('�')) return decoded;

  // Preserve invalid byte sequences instead of silently replacing them. A
  // valid UTF-8/GBK segment is decoded normally; only an invalid segment falls
  // back to explicit byte escapes.
  return data
    .map((byte) =>
      byte < 0x80
        ? String.fromCharCode(byte)
        : `\\x${byte.toString(16).padStart(2, '0').toUpperCase()}`
    )
    .join('');
}

function invisibleByte(byte: number): string | null {
  if (byte === 0x00) return '\\0';
  if (byte === 0x07) return '\\a';
  if (byte === 0x08) return '\\b';
  if (byte === 0x09) return '\\t';
  if (byte === 0x0a) return '\\n\n';
  if (byte === 0x0d) return '\\r';
  if (byte < 0x20 || byte === 0x7f) {
    return `\\x${byte.toString(16).padStart(2, '0').toUpperCase()}`;
  }
  return null;
}

/** Decode serial bytes without losing control or invalid bytes in the UI. */
export function decodeSerialBytes(
  data: number[],
  encoding: SerialTextEncoding,
  showInvisible: boolean,
  preserveAnsiEscape = false
): string {
  if (!showInvisible) return decodeSegment(data, encoding, false);

  let result = '';
  let printable: number[] = [];
  const flushPrintable = () => {
    result += decodeSegment(printable, encoding, true);
    printable = [];
  };

  for (const byte of data) {
    if (preserveAnsiEscape && byte === 0x1b) {
      flushPrintable();
      result += '\x1b';
      continue;
    }
    const visible = invisibleByte(byte);
    if (visible === null) {
      printable.push(byte);
    } else {
      flushPrintable();
      result += visible;
    }
  }
  flushPrintable();
  return result;
}

export function logTimeFilterDuration(filter: LogTimeFilter): number | null {
  if (filter === '1m') return 60_000;
  if (filter === '5m') return 5 * 60_000;
  if (filter === '30m') return 30 * 60_000;
  return null;
}
