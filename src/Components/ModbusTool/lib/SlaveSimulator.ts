/**
 * Modbus Slave Simulator — emulates coils and holding registers.
 * Responds to read/write requests matching its slave ID.
 */

export interface SlaveDataSnapshot {
  coils: number[]; // 0 or 1 for each address
  holdings: number[]; // 0-65535 for each address
}

const DEFAULT_SIZE = 256;

export class SlaveSimulator {
  private coils: number[] = new Array(DEFAULT_SIZE).fill(0);
  private holdings: number[] = new Array(DEFAULT_SIZE).fill(0);
  public slaveId = 1;
  private _enabled = true;

  constructor() {
    this.resetDefaults();
  }

  get enabled(): boolean { return this._enabled; }
  set enabled(v: boolean) { this._enabled = v; }

  resetDefaults(count: number = DEFAULT_SIZE): void {
    this.coils.fill(0);
    this.holdings.fill(0);
    for (let i = 0; i < count; i++) this.holdings[i] = i * 10;
  }

  injectTestData(count: number = DEFAULT_SIZE): void {
    this.coils.fill(0);
    this.holdings.fill(0);
    for (let i = 0; i < count; i++) this.coils[i] = i % 2;
    for (let i = 0; i < count; i++) this.holdings[i] = 0x55aa + i;
  }

  getCoil(addr: number): number { return this.coils[addr] || 0; }
  setCoil(addr: number, val: number): void { if (addr >= 0 && addr < this.coils.length) this.coils[addr] = val ? 1 : 0; }

  getHolding(addr: number): number { return this.holdings[addr] ?? 0; }
  setHolding(addr: number, val: number): void { if (addr >= 0 && addr < this.holdings.length) this.holdings[addr] = val & 0xffff; }

  getCoilsSlice(start: number, len: number): number[] {
    return this.coils.slice(start, start + len);
  }
  getHoldingsSlice(start: number, len: number): number[] {
    return this.holdings.slice(start, start + len);
  }
  setHoldingsSlice(start: number, values: number[]): void {
    values.forEach((v, i) => { this.holdings[start + i] = v & 0xffff; });
  }
  setCoilsSlice(start: number, bits: number, _byteCount: number, data: number[]): void {
    for (let i = 0; i < bits; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitPos = i % 8;
      const bit = (data[byteIdx] >> bitPos) & 1;
      this.coils[start + i] = bit;
    }
  }

  snapshot(): SlaveDataSnapshot {
    return { coils: [...this.coils], holdings: [...this.holdings] };
  }

  // ─── Response generation ────────────────────────────

  /**
   * Process a Modbus PDU (excluding CRC for RTU, excluding MBAP for TCP).
   * Returns the response PDU (slaveId + funcCode + data) or null if not for this slave.
   */
  processPDU(pdu: Uint8Array): number[] | null {
    if (!this._enabled) return null;
    if (pdu.length < 2) return null;
    const slaveId = pdu[0];
    if (slaveId !== this.slaveId) return null;

    const func = pdu[1];
    try {
      switch (func) {
        case 1: return this.handleReadCoils(pdu);
        case 2: return this.handleReadCoils(pdu); // Discrete inputs same as coils for sim
        case 3: return this.handleReadHoldings(pdu);
        case 4: return this.handleReadHoldings(pdu); // Input registers same as holdings for sim
        case 5: return this.handleWriteSingleCoil(pdu);
        case 6: return this.handleWriteSingleRegister(pdu);
        case 15: return this.handleWriteMultipleCoils(pdu);
        case 16: return this.handleWriteMultipleRegisters(pdu);
        default: return [slaveId, func | 0x80, 0x01]; // Illegal function
      }
    } catch {
      return [slaveId, func | 0x80, 0x02]; // Slave device failure
    }
  }

  private handleReadCoils(pdu: Uint8Array): number[] {
    const func = pdu[1];
    const startAddr = (pdu[2] << 8) | pdu[3];
    const quantity = (pdu[4] << 8) | pdu[5];
    const byteCount = Math.ceil(quantity / 8);
    const data: number[] = [];
    for (let i = 0; i < quantity; i++) {
      const bit = this.coils[startAddr + i] || 0;
      const byteIdx = Math.floor(i / 8);
      if (data.length <= byteIdx) data.push(0);
      if (bit) data[byteIdx] |= (1 << (i % 8));
    }
    return [pdu[0], func, byteCount, ...data];
  }

  private handleReadHoldings(pdu: Uint8Array): number[] {
    const func = pdu[1];
    const startAddr = (pdu[2] << 8) | pdu[3];
    const quantity = (pdu[4] << 8) | pdu[5];
    const byteCount = quantity * 2;
    const data: number[] = [];
    for (let i = 0; i < quantity; i++) {
      const val = this.holdings[startAddr + i] || 0;
      data.push((val >> 8) & 0xff, val & 0xff);
    }
    return [pdu[0], func, byteCount, ...data];
  }

  private handleWriteSingleCoil(pdu: Uint8Array): number[] {
    const func = pdu[1];
    const addr = (pdu[2] << 8) | pdu[3];
    const val = (pdu[4] << 8) | pdu[5];
    // Modbus FC5 only accepts 0xFF00 (ON) or 0x0000 (OFF); any other value is illegal.
    if (val !== 0xff00 && val !== 0x0000) return [pdu[0], func | 0x80, 0x03]; // Illegal data value
    if (addr >= this.coils.length) return [pdu[0], func | 0x80, 0x02]; // Illegal data address
    this.coils[addr] = val === 0xff00 ? 1 : 0;
    return [pdu[0], func, pdu[2], pdu[3], pdu[4], pdu[5]];
  }

  private handleWriteSingleRegister(pdu: Uint8Array): number[] {
    const func = pdu[1];
    const addr = (pdu[2] << 8) | pdu[3];
    const val = (pdu[4] << 8) | pdu[5];
    if (addr >= this.holdings.length) return [pdu[0], func | 0x80, 0x02]; // Illegal data address
    this.holdings[addr] = val & 0xffff;
    return [pdu[0], func, pdu[2], pdu[3], pdu[4], pdu[5]];
  }

  private handleWriteMultipleCoils(pdu: Uint8Array): number[] {
    const func = pdu[1];
    const startAddr = (pdu[2] << 8) | pdu[3];
    const quantity = (pdu[4] << 8) | pdu[5];
    if (quantity < 1 || startAddr + quantity > this.coils.length) return [pdu[0], func | 0x80, 0x02]; // Illegal data address
    for (let i = 0; i < quantity; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitPos = i % 8;
      const bit = (pdu[7 + byteIdx] >> bitPos) & 1;
      this.coils[startAddr + i] = bit;
    }
    return [pdu[0], func, (startAddr >> 8) & 0xff, startAddr & 0xff, (quantity >> 8) & 0xff, quantity & 0xff];
  }

  private handleWriteMultipleRegisters(pdu: Uint8Array): number[] {
    const func = pdu[1];
    const startAddr = (pdu[2] << 8) | pdu[3];
    const quantity = (pdu[4] << 8) | pdu[5];
    if (quantity < 1 || startAddr + quantity > this.holdings.length) return [pdu[0], func | 0x80, 0x02]; // Illegal data address
    for (let i = 0; i < quantity; i++) {
      const val = (pdu[7 + 2 * i] << 8) | pdu[7 + 2 * i + 1];
      this.holdings[startAddr + i] = val & 0xffff;
    }
    return [pdu[0], func, (startAddr >> 8) & 0xff, startAddr & 0xff, (quantity >> 8) & 0xff, quantity & 0xff];
  }
}
