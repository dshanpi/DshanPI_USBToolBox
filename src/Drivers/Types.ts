/**
 * System information retrieved from Allwinner SoC device.
 *
 * Contains platform identification, security status, and manufacturing
 * information read from sunxi_info sysfs interface.
 */
export interface SunxiInfo {
  /** Platform name (e.g., 'sun50iw10') */
  platform: string;
  /** Secure boot status ('1' for secure-enabled devices) */
  secure: string;
  /** Device unique serial number */
  serial: string;
  /** Chip type identifier */
  chiptype: string;
  /** Manufacturing batch number */
  batchno: string;
}

/**
 * Pinctrl controller configuration for a GPIO controller.
 *
 * Defines register base address, version-specific register layout,
 * bank pin counts, and multiplexer function mappings.
 */
export interface PinctrlController {
  /** Base address of pinctrl register block */
  reg_base: number;
  /** Pinctrl register layout version (1-6) */
  version: number;
  /** Map of bank name to pin count (e.g., { 'PA': 16, 'PB': 12 }) */
  pin_bank_num: Record<string, number>;
  /** Map of pin name to mux function array (e.g., { 'PA0': ['GPIO', 'UART0_TX', ...] }) */
  pin_mux: Record<string, string[]>;
  /**
   * Optional hook to override bank register offset calculation.
   * Called with bank name (e.g., "PK") and should return the register offset,
   * or undefined to use default calculation.
   */
  bankOffsetHook?: (bankName: string) => number | undefined;
}

/**
 * Definition of a DRAM parameter field for configuration UI.
 *
 * Supports various field types including numbers, enums, and bitfields
 * with full metadata for display and validation.
 */
export interface DramParamFieldDef {
  /** Index of this field in the DRAM parameter array */
  index: number;
  /** Internal field name */
  name: string;
  /** Display label for UI */
  label: string;
  /** Optional description/help text */
  description?: string;
  /** Field type determining UI widget */
  type: 'number' | 'enum' | 'bitfield';
  /** Options for enum type fields */
  options?: { value: number; label: string }[];
  /** Bit definitions for bitfield type fields */
  bits?: {
    /** Bit field name */
    name: string;
    /** Display label for bit field */
    label: string;
    /** Bit offset within the value */
    offset: number;
    /** Number of bits in this sub-field */
    width: number;
    /** Options for enum-like bit fields */
    options?: { value: number; label: string }[];
  }[];
  /** Minimum value for number fields */
  min?: number;
  /** Maximum value for number fields */
  max?: number;
  /** Step value for number field increments */
  step?: number;
  /** Unit suffix for display (e.g., 'MHz', 'MB') */
  unit?: string;
  /** Display value in hexadecimal format */
  hex?: boolean;
}

/**
 * DRAM configuration for a specific chip variant.
 *
 * Contains default values and field definitions for DRAM tuning
 * parameters stored in the firmware.
 */
export interface DramConfig {
  /** Chip name this config applies to */
  chipName: string;
  /** Optional description of this DRAM configuration */
  description?: string;
  /** Default DRAM parameter values */
  defaults: number[];
  /** Field definitions for each parameter */
  fields: DramParamFieldDef[];
}

/**
 * Complete chip information for GPIO and DRAM configuration.
 *
 * Chip definitions are stored in src/Chips/ directory with specific
 * configurations for each supported Allwinner SoC variant.
 */
export interface ChipInfo {
  /** Unique chip identifier (e.g., 'aw1859') */
  id: string;
  /** Map of chip mark strings to numeric identifiers for detection */
  chipMark: Record<string, number>;
  /** Pinctrl controller configurations indexed by controller name */
  pinctrl: Record<string, PinctrlController>;
  /** Optional DRAM tuning configuration */
  dramConfig?: DramConfig;
}

/**
 * Multiplexer configuration information for a pin.
 *
 * Contains both the numeric mux value and its human-readable name.
 */
export interface PinMuxInfo {
  /** Multiplexer configuration value (0-15) */
  id: number;
  /** Function name corresponding to this mux value */
  name: string;
}

/**
 * Complete information for a single GPIO pin.
 *
 * Contains all configurable parameters for a pin including
 * multiplexer, pull, drive strength, and data value.
 */
export interface PinInfo {
  /** Pin name (e.g., 'PA0') */
  pin: string;
  /** GPIO pin ID for use in GPIO class methods */
  gpioId: number;
  /** Multiplexer configuration */
  mux: PinMuxInfo;
  /** Pull configuration string */
  pull: string;
  /** Drive strength value */
  drv: number;
  /** Data value, or 'FUNCTION' if pin is not in GPIO mode */
  data: boolean | 'FUNCTION';
}