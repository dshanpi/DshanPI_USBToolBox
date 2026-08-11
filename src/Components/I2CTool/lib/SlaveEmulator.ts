export type SlaveDeviceType = 'memory' | 'screen';

export interface SlaveDisplayData {
  type: SlaveDeviceType;
  dump?: string;
  content?: string;
}

export class SlaveEmulator {
  type: SlaveDeviceType;
  address: number;
  memory: Uint8Array;
  screenBuffer: string;
  private onUpdate?: (emulator: SlaveEmulator) => void;

  constructor(type: SlaveDeviceType, address: number, onUpdate?: (emulator: SlaveEmulator) => void) {
    this.type = type;
    this.address = address;
    this.memory = new Uint8Array(65536);
    this.screenBuffer = '';
    this.onUpdate = onUpdate;
    this._initMemory();
  }

  private _initMemory() {
    for (let i = 0; i < 32; i++) this.memory[i] = 0x20 + i;
    this.memory[0] = 0x49; this.memory[1] = 0x32; this.memory[2] = 0x43;
    this.memory[3] = 0x20; this.memory[4] = 0x53; this.memory[5] = 0x69;
    this.memory[6] = 0x6d;
    if (this.type === 'screen') this.screenBuffer = 'I2C Virtual Screen Ready';
  }

  setOnUpdate(fn: (emulator: SlaveEmulator) => void) {
    this.onUpdate = fn;
  }

  setAddress(newAddr: number) {
    this.address = newAddr;
  }

  setType(newType: SlaveDeviceType) {
    this.type = newType;
    if (newType === 'screen' && !this.screenBuffer) this.screenBuffer = 'OLED Simulator Ready';
    if (newType === 'memory') this._initMemory();
    this._triggerRender();
  }

  read(regStart: number, length: number, _is16BitReg = true): number[] {
    const offset = regStart & 0xffff;
    const len = Math.min(length, 256);
    const result: number[] = [];
    if (this.type === 'memory') {
      for (let i = 0; i < len; i++) result.push(this.memory[(offset + i) & 0xffff]);
    } else {
      for (let i = 0; i < len; i++) result.push(0x00);
      if (len > 0) result[0] = 0xaa;
    }
    return result;
  }

  write(regStart: number, dataArray: number[], _is16BitReg = true): boolean {
    const offset = regStart & 0xffff;
    if (this.type === 'memory') {
      for (let i = 0; i < dataArray.length; i++) {
        this.memory[(offset + i) & 0xffff] = dataArray[i] & 0xff;
      }
      this._triggerRender();
      return true;
    } else {
      let text = '';
      for (const byte of dataArray) {
        if (byte >= 32 && byte <= 126) text += String.fromCharCode(byte);
        else text += `[${byte.toString(16)}]`;
      }
      if (this.screenBuffer.length > 400) this.screenBuffer = this.screenBuffer.slice(-350);
      this.screenBuffer += text;
      const lines = this.screenBuffer.split('\n');
      if (lines.length > 10) this.screenBuffer = lines.slice(-10).join('\n');
      this._triggerRender();
      return true;
    }
  }

  reset() {
    if (this.type === 'memory') {
      this.memory.fill(0);
      this._initMemory();
    } else {
      this.screenBuffer = 'Screen Reset | I2C Slave Ready';
    }
    this._triggerRender();
  }

  injectTestData() {
    if (this.type === 'memory') {
      for (let i = 0; i < 64; i++) this.memory[i] = (i * 0xaa) & 0xff;
      this.memory[0] = 0xde; this.memory[1] = 0xad; this.memory[2] = 0xbe; this.memory[3] = 0xef;
    } else {
      this.screenBuffer = '=== Test Data ===\nHello I2C Slave\nEmulation Active\nI2C Tool Ready';
    }
    this._triggerRender();
  }

  private _triggerRender() {
    if (this.onUpdate) this.onUpdate(this);
  }

  getDisplayData(): SlaveDisplayData {
    if (this.type === 'memory') {
      let hexDump = '';
      const limit = Math.min(128, this.memory.length);
      for (let i = 0; i < limit; i++) {
        if (i % 16 === 0) hexDump += `\n${i.toString(16).padStart(4, '0')}: `;
        hexDump += this.memory[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
      }
      return { type: 'memory', dump: hexDump };
    } else {
      return { type: 'screen', content: this.screenBuffer || 'Waiting for I2C write data...' };
    }
  }
}
