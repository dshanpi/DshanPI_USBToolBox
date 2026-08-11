export type SpiSlaveType = 'eeprom' | 'sensor';

export interface SpiSlaveDisplayData {
  type: SpiSlaveType;
  dump?: string;
  sensorInfo?: string;
}

export class SpiSlaveSim {
  type: SpiSlaveType;
  eeprom: Uint8Array;
  private onUpdate?: (slave: SpiSlaveSim) => void;

  constructor(type: SpiSlaveType = 'eeprom', onUpdate?: (slave: SpiSlaveSim) => void) {
    this.type = type;
    this.eeprom = new Uint8Array(256);
    this.onUpdate = onUpdate;
    for (let i = 0; i < 256; i++) this.eeprom[i] = i & 0xff;
  }

  setOnUpdate(fn: (slave: SpiSlaveSim) => void) { this.onUpdate = fn; }

  setType(t: SpiSlaveType) { this.type = t; this._updateUI(); }

  handleTransfer(txBytes: number[]): number[] {
    if (this.type === 'eeprom') {
      if (txBytes.length === 0) return [];
      const cmd = txBytes[0];
      if (cmd === 0x03) {
        const addr = txBytes[1] || 0;
        const len = Math.min(txBytes.length - 2, 16) || 16;
        const rx = [0x03];
        for (let i = 0; i < len; i++) rx.push(this.eeprom[(addr + i) & 0xff]);
        return rx;
      } else if (cmd === 0x02) {
        const addr = txBytes[1];
        const data = txBytes.slice(2);
        for (let i = 0; i < data.length; i++) this.eeprom[(addr + i) & 0xff] = data[i];
        this._updateUI();
        return [0x02, 0xaa];
      }
      return [0x00];
    } else {
      return [0x12, 0x34, 0x56];
    }
  }

  reset() {
    if (this.type === 'eeprom') {
      this.eeprom.fill(0);
      for (let i = 0; i < 256; i++) this.eeprom[i] = i & 0xff;
    }
    this._updateUI();
  }

  injectTest() {
    if (this.type === 'eeprom') {
      for (let i = 0; i < 32; i++) this.eeprom[i] = 0x55;
      this.eeprom[0] = 0xde; this.eeprom[1] = 0xad; this.eeprom[2] = 0xbe; this.eeprom[3] = 0xef;
    }
    this._updateUI();
  }

  private _updateUI() { if (this.onUpdate) this.onUpdate(this); }

  getDisplayData(): SpiSlaveDisplayData {
    if (this.type === 'eeprom') {
      let dump = '';
      for (let i = 0; i < 64; i++) {
        if (i % 16 === 0) dump += `\n${i.toString(16).padStart(4, '0')}: `;
        dump += this.eeprom[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
      }
      return { type: 'eeprom', dump };
    }
    return { type: 'sensor', sensorInfo: 'Temperature: 0x1234 (46.6°C)' };
  }
}
