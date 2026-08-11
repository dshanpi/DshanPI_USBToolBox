import {
  readRegister,
  writeRegister,
  readRegisterBatch,
  type ChipInfo,
  type PinMuxInfo,
  type PinInfo,
  type PinctrlController,
  type ProgressCallback,
} from './DeviceInfo';

/**
 * Pinctrl register offset constants for version 1 (older chips).
 *
 * V1 uses 2 bits per pin for DRV and PUL registers, allowing
 * 16 pins per register. CFG uses 3 bits per pin (8 pins per register).
 */
const PINCTRL_REG_OFFSET_V1 = {
  GPIO_CFG0: 0x00,
  GPIO_CFG1: 0x04,
  GPIO_CFG2: 0x08,
  GPIO_CFG3: 0x0c,
  GPIO_DAT: 0x10,
  GPIO_DRV0: 0x14,
  GPIO_DRV1: 0x18,
  GPIO_PUL0: 0x1c,
  GPIO_PUL1: 0x20,
  GPIO_OFFSET: 0x24,
  GPIO_CFG_MASK: 0x7,
  GPIO_DRV_MASK: 0x3,
  GPIO_PUL_MASK: 0x3,
};

/**
 * Pinctrl register offset constants for version 2 (standard chips).
 *
 * V2 uses 4 bits per pin for CFG and DRV registers, allowing
 * 8 pins per register. PUL still uses 2 bits (16 pins per register).
 */
const PINCTRL_REG_OFFSET_V2 = {
  GPIO_CFG0: 0x00,
  GPIO_CFG1: 0x04,
  GPIO_CFG2: 0x08,
  GPIO_CFG3: 0x0c,
  GPIO_DAT: 0x10,
  GPIO_DRV0: 0x14,
  GPIO_DRV1: 0x18,
  GPIO_DRV2: 0x1c,
  GPIO_DRV3: 0x20,
  GPIO_PUL0: 0x24,
  GPIO_PUL1: 0x28,
  GPIO_OFFSET: 0x30,
  GPIO_CFG_MASK: 0xf,
  GPIO_DRV_MASK: 0xf,
  GPIO_PUL_MASK: 0x3,
};

/**
 * Pinctrl register offset constants for version 3 (newer chips).
 *
 * V3 uses higher base offsets (starting at 0x80) and includes
 * separate SET/CLR registers for data manipulation.
 */
const PINCTRL_REG_OFFSET_V3 = {
  GPIO_CFG0: 0x80,
  GPIO_CFG1: 0x84,
  GPIO_CFG2: 0x88,
  GPIO_CFG3: 0x8c,
  GPIO_DAT: 0x90,
  GPIO_DAT_SET: 0x94,
  GPIO_DAT_CLR: 0x98,
  GPIO_DRV0: 0xa0,
  GPIO_DRV1: 0xa4,
  GPIO_DRV2: 0xa8,
  GPIO_DRV3: 0xac,
  GPIO_PUL0: 0xb0,
  GPIO_PUL1: 0xb4,
  GPIO_OFFSET: 0x80,
  GPIO_CFG_MASK: 0xf,
  GPIO_DRV_MASK: 0xf,
  GPIO_PUL_MASK: 0x3,
};

/**
 * Pinctrl register offset constants for version 4.
 *
 * Similar to V3 but without GPIO_DAT_SET/CLR registers.
 */
const PINCTRL_REG_OFFSET_V4 = {
  GPIO_CFG0: 0x80,
  GPIO_CFG1: 0x84,
  GPIO_CFG2: 0x88,
  GPIO_CFG3: 0x8c,
  GPIO_DAT: 0x90,
  GPIO_DRV0: 0xa0,
  GPIO_DRV1: 0xa4,
  GPIO_DRV2: 0xa8,
  GPIO_DRV3: 0xac,
  GPIO_PUL0: 0xb0,
  GPIO_PUL1: 0xb4,
  GPIO_OFFSET: 0x80,
  GPIO_CFG_MASK: 0xf,
  GPIO_DRV_MASK: 0xf,
  GPIO_PUL_MASK: 0x3,
};

/**
 * Pinctrl register offset constants for version 5.
 *
 * V5 uses separate register areas: CFG/DRV/PUL at low offsets,
 * and DAT registers at 0x500 range.
 */
const PINCTRL_REG_OFFSET_V5 = {
  GPIO_CFG0: 0x00,
  GPIO_CFG1: 0x04,
  GPIO_CFG2: 0x08,
  GPIO_CFG3: 0x0c,
  GPIO_DAT: 0x500,
  GPIO_DAT_SET: 0x504,
  GPIO_DAT_CLR: 0x508,
  GPIO_DRV0: 0x14,
  GPIO_DRV1: 0x18,
  GPIO_DRV2: 0x1c,
  GPIO_DRV3: 0x20,
  GPIO_PUL0: 0x24,
  GPIO_PUL1: 0x28,
  GPIO_OFFSET: 0x30,
  GPIO_CFG_MASK: 0xf,
  GPIO_DRV_MASK: 0xf,
  GPIO_PUL_MASK: 0x3,
};

/**
 * Pinctrl register offset constants for version 6.
 *
 * V6 is a simplified variant with CFG and DAT at 0x500 range.
 * DRV and PUL registers may not be present.
 */
const PINCTRL_REG_OFFSET_V6 = {
  GPIO_CFG0: 0x500,
  GPIO_DAT: 0x510,
  GPIO_OFFSET: 0x14,
  GPIO_CFG_MASK: 0xf,
};

/** Number of bits used to encode pin number within GPIO pin ID */
const PIO_NUM_IO_BITS = 5;

/** Re-export types from DeviceInfo for convenience */
export type { ChipInfo, PinMuxInfo, PinInfo, PinctrlController, ProgressCallback };

/**
 * Converts pull register value to human-readable string.
 *
 * @param pull - Pull register value (0-3)
 * @returns Human-readable pull configuration name
 */
function sunxiGpioPinGetPullName(pull: number): string {
  switch (pull) {
    case 0b00:
      return 'PULL DISABLE';
    case 0b01:
      return 'PULL UP';
    case 0b10:
      return 'PULL DOWN';
    default:
      return 'RESERVED';
  }
}

/**
 * Complete GPIO pin data including all configurable parameters.
 *
 * Contains mux configuration, pull setting, data value, and drive strength
 * for all pins across all banks.
 */
export interface PinAllData {
  /** Pin multiplexer configuration for each pin */
  mux: Record<string, PinMuxInfo>;
  /** Pull configuration name for each pin */
  pull: Record<string, string>;
  /** Data value (high/low) for each pin */
  data: Record<string, boolean>;
  /** Drive strength value for each pin */
  drv: Record<string, number>;
}

/**
 * Base interface for register offset constants.
 *
 * Defines common register offsets that all versions share,
 * with optional registers for versions that support them.
 */
interface RegOffsetBase {
  /** CFG0 register offset (configures pins 0-7 or 0-15) */
  GPIO_CFG0: number;
  /** Data register offset for reading/writing pin values */
  GPIO_DAT: number;
  /** Offset between consecutive GPIO banks */
  GPIO_OFFSET: number;
  /** Mask for extracting CFG value from register */
  GPIO_CFG_MASK: number;
  /** DRV0 register offset (drive strength) */
  GPIO_DRV0?: number;
  /** DRV1 register offset */
  GPIO_DRV1?: number;
  /** DRV2 register offset */
  GPIO_DRV2?: number;
  /** DRV3 register offset */
  GPIO_DRV3?: number;
  /** PUL0 register offset (pull configuration) */
  GPIO_PUL0?: number;
  /** PUL1 register offset */
  GPIO_PUL1?: number;
  /** Mask for extracting DRV value from register */
  GPIO_DRV_MASK?: number;
  /** Mask for extracting PUL value from register */
  GPIO_PUL_MASK?: number;
  /** CFG1 register offset */
  GPIO_CFG1?: number;
  /** CFG2 register offset */
  GPIO_CFG2?: number;
  /** CFG3 register offset */
  GPIO_CFG3?: number;
  /** Data set register offset (write 1 to set bit) */
  GPIO_DAT_SET?: number;
  /** Data clear register offset (write 1 to clear bit) */
  GPIO_DAT_CLR?: number;
}

/** Union type for all register offset versions */
type RegOffset = RegOffsetBase;

/**
 * Internal structure mapping bank name to controller info.
 *
 * Used for efficient lookup of controller configuration
 * for a given GPIO bank.
 */
interface BankControllerInfo {
  /** Pinctrl controller configuration */
  controller: PinctrlController;
  /** Controller name (e.g., 'pinctrl0') */
  name: string;
  /** Register offset constants for this controller version */
  regOffset: RegOffset;
}

/**
 * GPIO class for Allwinner Sunxi SoC GPIO operations.
 *
 * Provides comprehensive GPIO control including:
 * - Pin multiplexer (CFG) configuration
 * - Data register read/write
 * - Pull up/down configuration
 * - Drive strength configuration
 *
 * Supports multiple pinctrl controller versions (V1-V6) with
 * different register layouts. Uses ADB shell commands to
 * read/write memory-mapped registers.
 *
 * Example usage:
 * ```typescript
 * const gpio = new GPIO(deviceSerial, chipInfo);
 * const allData = await gpio.sunxiGpioGetAllPinData();
 * await gpio.sunxiGpioSetData(gpio.gpioPin('PA', 0), 1);
 * ```
 */
export class GPIO {
  /** ADB device serial number for shell commands */
  private serial: string | null;

  /** Chip information containing pinctrl configuration */
  private chipInfo: ChipInfo;

  /** Map from bank name (e.g., 'PA') to controller information */
  private bankToController: Map<string, BankControllerInfo>;

  /**
   * Creates a GPIO controller for the specified device and chip.
   *
   * Initializes bank-to-controller mapping based on chipInfo
   * pinctrl configuration.
   *
   * @param serial - ADB device serial number for shell commands
   * @param chipInfo - Chip configuration with pinctrl definitions
   */
  constructor(serial: string | null, chipInfo: ChipInfo) {
    this.serial = serial;
    this.chipInfo = chipInfo;
    this.bankToController = new Map();

    for (const [controllerName, controller] of Object.entries(chipInfo.pinctrl)) {
      const regOffset = this.getRegOffsetForVersion(controller.version);
      for (const bankName of Object.keys(controller.pin_bank_num)) {
        this.bankToController.set(bankName, {
          controller,
          name: controllerName,
          regOffset,
        });
      }
    }
  }

  /**
   * Gets register offset constants for a pinctrl version.
   *
   * @param version - Pinctrl controller version (1-6)
   * @returns Register offset constants object
   */
  private getRegOffsetForVersion(version: number): RegOffset {
    switch (version) {
      case 1:
        return PINCTRL_REG_OFFSET_V1;
      case 2:
        return PINCTRL_REG_OFFSET_V2;
      case 3:
        return PINCTRL_REG_OFFSET_V3;
      case 4:
        return PINCTRL_REG_OFFSET_V4;
      case 5:
        return PINCTRL_REG_OFFSET_V5;
      case 6:
        return PINCTRL_REG_OFFSET_V6;
      default:
        return PINCTRL_REG_OFFSET_V2;
    }
  }

  /**
   * Gets controller information for a GPIO bank.
   *
   * @param bank - Bank name (e.g., 'PA', 'PB')
   * @returns BankControllerInfo or undefined if not found
   */
  private getControllerForBank(bank: string): BankControllerInfo | undefined {
    return this.bankToController.get(bank);
  }

  /**
   * Converts bank name and pin number to GPIO pin ID.
   *
   * GPIO pin ID format: (bank_number << 5) | pin_number
   * Bank number is derived from letter (A=0, B=1, etc.)
   *
   * @param bank - Bank name with or without 'P' prefix (e.g., 'PA', 'A')
   * @param pin - Pin number within bank (0-31)
   * @returns GPIO pin ID for use in other methods
   */
  gpioPin(bank: string, pin: number): number {
    const bankStr = bank.replace('P', '');
    if (bankStr.length === 1 && /[A-Za-z]/.test(bankStr)) {
      const bankNum = bankStr.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
      return (bankNum << PIO_NUM_IO_BITS) | pin;
    }
    return 0;
  }

  /**
   * Extracts port/bank number from GPIO pin ID.
   *
   * @param gpio - GPIO pin ID
   * @returns Port/bank number (A=0, B=1, etc.)
   */
  private portNum(gpio: number): number {
    return gpio >> PIO_NUM_IO_BITS;
  }

  /**
   * Extracts pin number from GPIO pin ID.
   *
   * @param gpio - GPIO pin ID
   * @returns Pin number within bank (0-31)
   */
  private pinNum(gpio: number): number {
    return gpio & ((1 << PIO_NUM_IO_BITS) - 1);
  }

  /**
   * Gets base address and controller info for a GPIO pin.
   *
   * Calculates the register base address for the bank containing
   * the specified GPIO pin, including controller configuration.
   *
   * @param gpio - GPIO pin ID
   * @returns Object with base address, controller, and register offsets
   */
  private portBaseGet(gpio: number): {
    base: number;
    controller: PinctrlController;
    regOffset: RegOffset;
  } {
    const port = this.portNum(gpio);
    const bankChar = String.fromCharCode('A'.charCodeAt(0) + port);
    const bankName = `P${bankChar}`;

    const controllerInfo = this.getControllerForBank(bankName);
    if (controllerInfo) {
      const bankOffset = this.getBankOffset(
        controllerInfo.controller,
        bankName,
        controllerInfo.regOffset
      );
      return {
        base: controllerInfo.controller.reg_base + bankOffset,
        controller: controllerInfo.controller,
        regOffset: controllerInfo.regOffset,
      };
    }

    const firstController = Object.values(this.chipInfo.pinctrl)[0];
    return {
      base: 0,
      controller: firstController,
      regOffset: this.getRegOffsetForVersion(firstController.version),
    };
  }

  /**
   * Reads a single register value from device memory.
   *
   * @param addr - Memory address to read
   * @returns Promise resolving to register value
   */
  async readRegisterSingle(addr: number): Promise<number> {
    const result = await readRegister(this.serial, addr, 1);
    return typeof result === 'number' ? result : 0;
  }

  /**
   * Reads all registers for a pinctrl controller in batch.
   *
   * Calculates the required register range based on bank offsets
   * and uses batch reading for efficiency.
   *
   * @param controller - Pinctrl controller to read
   * @param regOffset - Register offset constants for this controller
   * @param progress - Optional progress callback for batch reading
   * @returns Map of address to register value
   */
  private async readControllerRegisters(
    controller: PinctrlController,
    regOffset: RegOffset,
    progress?: ProgressCallback
  ): Promise<Map<number, number>> {
    const bankNames = Object.keys(controller.pin_bank_num);
    if (bankNames.length === 0) {
      return new Map();
    }

    let maxOffset = 0;
    for (const bankName of bankNames) {
      const offset = this.getBankOffset(controller, bankName, regOffset);
      if (offset > maxOffset) {
        maxOffset = offset;
      }
    }

    const totalRegs = (maxOffset + regOffset.GPIO_OFFSET) / 4;
    const startAddr = controller.reg_base + regOffset.GPIO_CFG0;
    return readRegisterBatch(this.serial, startAddr, totalRegs, progress);
  }

  /**
   * Calculates register offset for a specific GPIO bank.
   *
   * Uses controller's bankOffsetHook if available, otherwise
   * calculates based on letter index and GPIO_OFFSET constant.
   *
   * @param controller - Pinctrl controller configuration
   * @param bankName - Bank name (e.g., 'PA', 'PL')
   * @param regOffset - Register offset constants
   * @returns Byte offset for the bank within controller address space
   */
  private getBankOffset(
    controller: PinctrlController,
    bankName: string,
    regOffset: RegOffset
  ): number {
    const bankNames = Object.keys(controller.pin_bank_num);
    if (bankNames.length === 0) return 0;

    // Check if there's a custom hook for bank offset calculation
    if (controller.bankOffsetHook) {
      const customOffset = controller.bankOffsetHook(bankName);
      if (customOffset !== undefined) {
        return customOffset;
      }
    }

    // Use letter index (A=0, B=1, etc.) for bank offset calculation
    // PA=0, PB=0x30, PC=0x60, etc.
    const letterIndex = this.getLetterIndex(bankName);
    return letterIndex * regOffset.GPIO_OFFSET;
  }

  /**
   * Gets letter index for bank name, handling PL+ banks specially.
   *
   * Banks A-K use indices 0-10, banks L+ restart at 0.
   * This accounts for separate pinctrl controllers for L+ banks.
   *
   * @param bankName - Bank name (e.g., 'PA', 'PL')
   * @returns Letter index for offset calculation
   */
  private getLetterIndex(bankName: string): number {
    const bankStr = bankName.replace('P', '');
    if (bankStr.length === 1 && /[A-Za-z]/.test(bankStr)) {
      const index = bankStr.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
      // For banks >= PL (L=11), restart counting from 0
      if (index >= 11) {
        return index - 11; // L=0, M=1, N=2, ...
      }
      return index;
    }
    return 0;
  }

  /**
   * Calculates number of batch reads needed for a controller.
   *
   * Determines how many 128-register batch reads are required
   * to read all registers for a pinctrl controller.
   *
   * @param controller - Pinctrl controller configuration
   * @param regOffset - Register offset constants
   * @returns Number of batch read operations needed
   */
  private getControllerReadCount(controller: PinctrlController, regOffset: RegOffset): number {
    const bankNames = Object.keys(controller.pin_bank_num);
    if (bankNames.length === 0) {
      return 0;
    }

    let maxOffset = 0;
    for (const bankName of bankNames) {
      const offset = this.getBankOffset(controller, bankName, regOffset);
      if (offset > maxOffset) {
        maxOffset = offset;
      }
    }

    const totalRegs = (maxOffset + regOffset.GPIO_OFFSET) / 4;
    const MAX_REGS_PER_READ = 128;
    return Math.ceil(totalRegs / MAX_REGS_PER_READ);
  }

  /**
   * Reads data values for all GPIO pins across all banks.
   *
   * Uses batch reading for efficiency and reports progress.
   *
   * @param progress - Optional progress callback
   * @returns Record mapping pin names (e.g., 'PA0') to boolean values
   */
  async sunxiGpioGetAllData(progress?: ProgressCallback): Promise<Record<string, boolean>> {
    const gpioDataVal: Record<string, boolean> = {};
    const controllers = Object.entries(this.chipInfo.pinctrl);

    let totalReads = 0;
    for (const [, controller] of controllers) {
      const regOffset = this.getRegOffsetForVersion(controller.version);
      totalReads += this.getControllerReadCount(controller, regOffset);
    }

    let currentRead = 0;

    for (const [, controller] of controllers) {
      const regOffset = this.getRegOffsetForVersion(controller.version);
      const controllerReadCount = this.getControllerReadCount(controller, regOffset);

      const regMap = await this.readControllerRegisters(controller, regOffset, (c, _t) => {
        if (progress) progress(currentRead + c, totalReads);
      });
      currentRead += controllerReadCount;

      for (const [bankName, bankPinNum] of Object.entries(controller.pin_bank_num)) {
        const gpio = this.gpioPin(bankName, 0);
        const { base, regOffset: bankRegOffset } = this.portBaseGet(gpio);
        const datOffset = bankRegOffset.GPIO_DAT;
        const val = regMap.get(base + datOffset) || 0;

        for (let i = 0; i < bankPinNum; i++) {
          gpioDataVal[`${bankName}${i}`] = (val & (1 << i)) !== 0;
        }
      }
    }
    return gpioDataVal;
  }

  /**
   * Sets the data value for a single GPIO pin.
   *
   * Reads the current data register, modifies the bit for the
   * specified pin, and writes back the updated value.
   *
   * @param pin - GPIO pin ID
   * @param data - Value to set (0 or 1)
   */
  async sunxiGpioSetData(pin: number, data: number): Promise<void> {
    const { base, regOffset } = this.portBaseGet(pin);
    const pinNum = this.pinNum(pin);

    const datOffset = regOffset.GPIO_DAT;
    let val = await this.readRegisterSingle(base + datOffset);
    val &= ~(1 << pinNum);
    val |= (data ? 1 : 0) << pinNum;
    await writeRegister(this.serial, base + datOffset, val);
  }

  /**
   * Gets the data value for a single GPIO pin.
   *
   * @param pin - GPIO pin ID
   * @returns Promise resolving to boolean pin value
   */
  async sunxiGpioGetData(pin: number): Promise<boolean> {
    const { base, regOffset } = this.portBaseGet(pin);
    const pinNum = this.pinNum(pin);

    const datOffset = regOffset.GPIO_DAT;
    const val = await this.readRegisterSingle(base + datOffset);
    return (val & (1 << pinNum)) !== 0;
  }

  /**
   * Sets the multiplexer configuration for a single GPIO pin.
   *
   * CFG register format: 4 bits per pin (8 pins per register).
   * Pin number determines which CFG register (CFG0-CFG3) and bit position.
   *
   * @param pin - GPIO pin ID
   * @param cfg - Multiplexer configuration value (0-15)
   */
  async sunxiGpioSetMuxSingle(pin: number, cfg: number): Promise<void> {
    const { base, regOffset } = this.portBaseGet(pin);
    const pinNum = this.pinNum(pin);

    const cfg0Offset = regOffset.GPIO_CFG0;
    const cfgMask = regOffset.GPIO_CFG_MASK;

    const addr = base + cfg0Offset + ((pinNum >> 3) << 2);
    let val = await this.readRegisterSingle(addr);
    val &= ~(0xf << ((pinNum & 0x7) << 2));
    val |= (cfg & cfgMask) << ((pinNum & 0x7) << 2);
    await writeRegister(this.serial, addr, val);
  }

  /**
   * Gets the multiplexer configuration for a single GPIO pin.
   *
   * @param pin - GPIO pin ID
   * @returns Promise resolving to CFG value (0-15)
   */
  async sunxiGpioGetMuxSingle(pin: number): Promise<number> {
    const { base, regOffset } = this.portBaseGet(pin);
    const pinNum = this.pinNum(pin);

    const cfg0Offset = regOffset.GPIO_CFG0;
    const cfgMask = regOffset.GPIO_CFG_MASK;

    const addr = base + cfg0Offset + ((pinNum >> 3) << 2);
    const val = await this.readRegisterSingle(addr);
    return (val >> ((pinNum & 0x7) << 2)) & cfgMask;
  }

  /**
   * Converts multiplexer value to function name for a pin.
   *
   * Looks up the pin_mux table from chip info to find the
   * function name corresponding to the mux value.
   *
   * @param pin - Pin name (e.g., 'PA0')
   * @param mux - Multiplexer value
   * @returns Function name or hex value if not found
   */
  sunxiGpioMuxToName(pin: string, mux: number): string {
    for (const controller of Object.values(this.chipInfo.pinctrl)) {
      const muxName = controller.pin_mux[pin];
      if (muxName && muxName[mux]) {
        return muxName[mux];
      }
    }
    return mux.toString(16);
  }

  /**
   * Gets the multiplexer function name for a GPIO pin.
   *
   * @param pin - GPIO pin ID
   * @returns Promise resolving to function name
   */
  async sunxiGpioPinGetMuxName(pin: number): Promise<string> {
    const pinName = this.gpioToPinName(pin);
    const mux = await this.sunxiGpioGetMuxSingle(pin);
    return this.sunxiGpioMuxToName(pinName, mux);
  }

  /**
   * Converts GPIO pin ID to pin name string.
   *
   * @param gpio - GPIO pin ID
   * @returns Pin name (e.g., 'A0')
   */
  private gpioToPinName(gpio: number): string {
    const port = this.portNum(gpio);
    const pin = this.pinNum(gpio);
    const bankChar = String.fromCharCode('A'.charCodeAt(0) + port);
    return `${bankChar}${pin}`;
  }

  /**
   * Gets total number of GPIO banks across all controllers.
   *
   * @returns Number of GPIO banks
   */
  getBankCount(): number {
    let count = 0;
    for (const controller of Object.values(this.chipInfo.pinctrl)) {
      count += Object.keys(controller.pin_bank_num).length;
    }
    return count;
  }

  /**
   * Sets pull configuration for a single GPIO pin.
   *
   * PUL register format: 2 bits per pin (16 pins per register).
   * Values: 0=disable, 1=pull-up, 2=pull-down, 3=reserved.
   *
   * @param pin - GPIO pin ID
   * @param pul - Pull configuration value (0-3)
   */
  async sunxiGpioPinSetPull(pin: number, pul: number): Promise<void> {
    const { base, regOffset } = this.portBaseGet(pin);
    const pinNum = this.pinNum(pin);

    const pul0Offset = regOffset.GPIO_PUL0;
    if (pul0Offset === undefined) {
      return;
    }
    const addr = base + pul0Offset + ((pinNum >> 4) << 2);
    let val = await this.readRegisterSingle(addr);
    val &= ~(0x3 << ((pinNum & 0xf) << 1));
    val |= pul << ((pinNum & 0xf) << 1);
    await writeRegister(this.serial, addr, val);
  }

  /**
   * Gets pull configuration for a single GPIO pin.
   *
   * @param pin - GPIO pin ID
   * @returns Promise resolving to pull value (0-3)
   */
  async sunxiGpioPinGetPullSingle(pin: number): Promise<number> {
    const { base, regOffset } = this.portBaseGet(pin);
    const pinNum = this.pinNum(pin);

    const pul0Offset = regOffset.GPIO_PUL0;
    if (pul0Offset === undefined) {
      return 0;
    }
    const pulMask = regOffset.GPIO_PUL_MASK ?? 0x3;

    const addr = base + pul0Offset + ((pinNum >> 4) << 2);
    const val = await this.readRegisterSingle(addr);
    return (val >> ((pinNum & 0xf) << 1)) & pulMask;
  }

  /**
   * Sets drive strength for a single GPIO pin.
   *
   * DRV register format depends on version:
   * - V1: 2 bits per pin (16 pins per register)
   * - V2+: 4 bits per pin (8 pins per register)
   *
   * @param pin - GPIO pin ID
   * @param drv - Drive strength value (0-3 for V1, 0-15 for V2+)
   */
  async sunxiGpioPinSetDrv(pin: number, drv: number) {
    const { base, regOffset } = this.portBaseGet(pin);
    const pinNum = this.pinNum(pin);

    const drv0Offset = regOffset.GPIO_DRV0;
    if (drv0Offset === undefined) {
      return;
    }
    const drvMask = regOffset.GPIO_DRV_MASK ?? 0x3;

    // V1: 2 registers, 2 bits per pin (16 pins per register)
    // V2+: 4 registers, 4 bits per pin (8 pins per register), same as CFG
    const bitsPerPin = drvMask === 0xf ? 4 : 2;
    const pinsPerReg = drvMask === 0xf ? 8 : 16;
    const addr = base + drv0Offset + ((pinNum / pinsPerReg) << 2);

    let val = await this.readRegisterSingle(addr);
    val &= ~(drvMask << ((pinNum % pinsPerReg) * bitsPerPin));
    val |= (drv & drvMask) << ((pinNum % pinsPerReg) * bitsPerPin);
    await writeRegister(this.serial, addr, val);
  }

  /**
   * Gets drive strength for a single GPIO pin.
   *
   * @param pin - GPIO pin ID
   * @returns Promise resolving to drive strength value
   */
  async sunxiGpioGetDrvSingle(pin: number): Promise<number> {
    const { base, regOffset } = this.portBaseGet(pin);
    const pinNum = this.pinNum(pin);

    const drv0Offset = regOffset.GPIO_DRV0;
    if (drv0Offset === undefined) {
      return 0;
    }
    const drvMask = regOffset.GPIO_DRV_MASK ?? 0x3;

    // V1: 2 registers, 2 bits per pin (16 pins per register)
    // V2+: 4 registers, 4 bits per pin (8 pins per register), same as CFG
    const bitsPerPin = drvMask === 0xf ? 4 : 2;
    const pinsPerReg = drvMask === 0xf ? 8 : 16;
    const addr = base + drv0Offset + ((pinNum / pinsPerReg) << 2);

    const val = await this.readRegisterSingle(addr);
    return (val >> ((pinNum % pinsPerReg) * bitsPerPin)) & drvMask;
  }

  /**
   * Gets the chip configuration for this GPIO instance.
   *
   * @returns ChipInfo object
   */
  getChipInfo(): ChipInfo {
    return this.chipInfo;
  }

  /**
   * Gets multiplexer function list for a pin.
   *
   * @param pin - Pin name (e.g., 'PA0')
   * @returns Array of function names indexed by mux value
   */
  getPinMuxList(pin: string): string[] {
    for (const controller of Object.values(this.chipInfo.pinctrl)) {
      const muxList = controller.pin_mux[pin];
      if (muxList) {
        return muxList;
      }
    }
    return [];
  }

  /**
   * Reads complete GPIO data for all pins across all banks.
   *
   * Retrieves mux configuration, pull setting, data value, and
   * drive strength for every pin. Uses batch reading for efficiency.
   *
   * @param progress - Optional progress callback
   * @returns PinAllData with complete pin information
   */
  async sunxiGpioGetAllPinData(progress?: ProgressCallback): Promise<PinAllData> {
    const controllers = Object.entries(this.chipInfo.pinctrl);

    const muxVal: Record<string, PinMuxInfo> = {};
    const pullVal: Record<string, string> = {};
    const dataVal: Record<string, boolean> = {};
    const drvVal: Record<string, number> = {};

    let totalReads = 0;
    for (const [, controller] of controllers) {
      const regOffset = this.getRegOffsetForVersion(controller.version);
      totalReads += this.getControllerReadCount(controller, regOffset);
    }

    let currentRead = 0;

    for (const [, controller] of controllers) {
      const regOffset = this.getRegOffsetForVersion(controller.version);
      const controllerReadCount = this.getControllerReadCount(controller, regOffset);

      const regMap = await this.readControllerRegisters(controller, regOffset, (c, _t) => {
        if (progress) progress(currentRead + c, totalReads);
      });
      currentRead += controllerReadCount;

      for (const [bankName, bankPinNum] of Object.entries(controller.pin_bank_num)) {
        const gpio = this.gpioPin(bankName, 0);
        const { base, regOffset: bankRegOffset } = this.portBaseGet(gpio);

        const cfg0Offset = bankRegOffset.GPIO_CFG0;
        const cfgMask = bankRegOffset.GPIO_CFG_MASK;
        const datOffset = bankRegOffset.GPIO_DAT;
        const pul0Offset = bankRegOffset.GPIO_PUL0;
        const pulMask = bankRegOffset.GPIO_PUL_MASK;
        const drv0Offset = bankRegOffset.GPIO_DRV0;
        const drvMask = bankRegOffset.GPIO_DRV_MASK;

        const gpioCfgVal: number[] = [];
        for (let i = 0; i < 4; i++) {
          gpioCfgVal.push(regMap.get(base + cfg0Offset + (i << 2)) || 0);
        }

        const gpioPulVal: number[] = [];
        if (pul0Offset !== undefined) {
          gpioPulVal.push(regMap.get(base + pul0Offset) || 0);
          gpioPulVal.push(regMap.get(base + pul0Offset + 4) || 0);
        }

        const dataReg = regMap.get(base + datOffset) || 0;

        // V1: 2 registers, 2 bits per pin (16 pins per register)
        // V2+: 4 registers, 4 bits per pin (8 pins per register)
        const drvBitsPerPin = drvMask === 0xf ? 4 : 2;
        const drvPinsPerReg = drvMask === 0xf ? 8 : 16;
        const drvRegCount = Math.ceil(bankPinNum / drvPinsPerReg);
        const gpioDrvVal: number[] = [];
        if (drv0Offset !== undefined) {
          for (let i = 0; i < drvRegCount; i++) {
            gpioDrvVal.push(regMap.get(base + drv0Offset + (i << 2)) || 0);
          }
        }

        for (let i = 0; i < bankPinNum; i++) {
          const pinName = `${bankName}${i}`;
          const mux = (gpioCfgVal[i >> 3] >> ((i & 0x7) << 2)) & cfgMask;
          const pull =
            pul0Offset !== undefined && pulMask !== undefined
              ? (gpioPulVal[i >> 4] >> ((i & 0xf) << 1)) & pulMask
              : 0;
          const data = (dataReg & (1 << i)) !== 0;
          const drv =
            drv0Offset !== undefined && drvMask !== undefined
              ? (gpioDrvVal[Math.floor(i / drvPinsPerReg)] >> ((i % drvPinsPerReg) * drvBitsPerPin)) & drvMask
              : 0;

          muxVal[pinName] = {
            id: mux,
            name: this.sunxiGpioMuxToName(pinName, mux),
          };
          pullVal[pinName] = pul0Offset !== undefined ? sunxiGpioPinGetPullName(pull) : 'N/A';
          dataVal[pinName] = data;
          drvVal[pinName] = drv;
        }
      }
    }

    return {
      mux: muxVal,
      pull: pullVal,
      data: dataVal,
      drv: drvVal,
    };
  }
}