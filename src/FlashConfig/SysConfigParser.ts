import { StorageType } from './Constants';
import { ipcParseSysConfig } from '../Platform/IPC';

/**
 * GPIO configuration structure.
 *
 * Defines a single GPIO pin configuration including
 * port, function, pull direction, drive strength, and level.
 */
export interface GpioConfig {
  /** Port identifier (e.g., 'A', 'B', 'C') */
  port: string;
  /** Bank identifier */
  bank: string;
  /** Pin number within the bank */
  pin: number;
  /** Function selection number */
  function: number;
  /** Pull direction (up, down, none) */
  pull: string;
  /** Drive strength setting */
  drive: string;
  /** Logic level (high, low) */
  level: string;
}

/**
 * TWI (I2C) interface parameters.
 *
 * Defines the TWI/I2C port and its SCL/SDA GPIO configurations
 * for board-level communication interfaces.
 */
export interface TwiPara {
  /** TWI/I2C port number */
  twi_port: number;
  /** SCL (clock) GPIO configuration */
  twi_scl: GpioConfig | null;
  /** SDA (data) GPIO configuration */
  twi_sda: GpioConfig | null;
}

/**
 * UART interface parameters.
 *
 * Defines the UART baud rate, port number, and TX/RX
 * GPIO configurations for serial debug interfaces.
 */
export interface UartPara {
  /** UART baud rate */
  uart_baud_rate: number;
  /** UART debug port number */
  uart_debug_port: number;
  /** TX (transmit) GPIO configuration */
  uart_debug_tx: GpioConfig | null;
  /** RX (receive) GPIO configuration */
  uart_debug_rx: GpioConfig | null;
}

/**
 * Sys_config board configuration structure.
 *
 * Sys_config.bin defines board-level hardware settings
 * including storage type, debug mode, and interface GPIOs.
 * It is parsed from the binary format used in Allwinner firmware.
 */
export interface SysConfig {
  /** Debug mode flag */
  debug_mode: number;
  /** Storage media type */
  storage_type: StorageType;
  /** TWI/I2C interface parameters */
  twi_para: TwiPara;
  /** UART interface parameters */
  uart_para: UartPara;
}

/**
 * Sys_config.bin parser for Allwinner board configuration.
 *
 * Parses the binary sys_config format that defines board-level
 * hardware settings including storage type, debug UART, and
 * I2C interfaces.
 *
 * Example usage:
 * ```typescript
 * const config = await SunxiSysConfigParser.parse(sysConfigBuffer);
 * console.log(`Storage: ${SunxiSysConfigParser.getStorageType(config)}`);
 * ```
 */
export class SunxiSysConfigParser {
  /**
   * Parses sys_config from binary data.
   *
   * @param buffer - Binary sys_config data
   * @returns Parsed SysConfig structure
   */
  static async parse(buffer: Uint8Array): Promise<SysConfig> {
    return (await ipcParseSysConfig(buffer)) as SysConfig;
  }

  /**
   * Gets human-readable storage type name from number.
   *
   * @param type - Storage type number
   * @returns Storage type name string
   */
  static getStorageTypeFromNum(type: number): string {
    switch (type) {
      case StorageType.NAND:
        return 'NAND';
      case StorageType.SDCARD:
        return 'SDCard';
      case StorageType.EMMC:
        return 'eMMC';
      case StorageType.SPINOR:
        return 'SPI NOR';
      case StorageType.EMMC3:
        return 'eMMC3';
      case StorageType.SPINAND:
        return 'SPI NAND';
      case StorageType.SD1:
        return 'SDCard1';
      case StorageType.EMMC0:
        return 'eMMC0';
      case StorageType.UFS:
        return 'UFS';
      case StorageType.AUTO:
        return 'Auto';
      default:
        return 'Unknown';
    }
  }

  /**
   * Gets storage type name from SysConfig.
   *
   * @param config - SysConfig structure
   * @returns Storage type name string
   */
  static getStorageType(config: SysConfig): string {
    return this.getStorageTypeFromNum(config.storage_type);
  }

  /**
   * Formats GPIO configuration as pin string.
   *
   * Returns a human-readable pin identifier like "PA0" or "-"
   * if the GPIO configuration is null.
   *
   * @param gpio - GPIO configuration or null
   * @returns Pin string identifier
   */
  static getGpioString(gpio: GpioConfig | null): string {
    if (!gpio) return '-';
    return `P${gpio.bank}${gpio.pin}`;
  }
}