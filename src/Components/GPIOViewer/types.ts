import { type PinMuxInfo } from '../../Drivers/DeviceInfo';

/**
 * GPIO pin row data for table display.
 *
 * Contains all information about a GPIO pin for display
 * in the GPIO viewer table, including pin name, mux options,
 * pull setting, drive level, and data value.
 */
export interface PinRowData {
  /** Pin name (e.g., 'PB0', 'PC5') */
  pin: string;
  /** GPIO numeric identifier */
  gpioId: number;
  /** Pin multiplexing information */
  mux: PinMuxInfo;
  /** Pull direction string (up, down, none) */
  pull: string;
  /** Drive level/strength value */
  drv: number;
  /** Data value or function indicator */
  data: boolean | 'FUNCTION';
}

/**
 * GPIO edit values for configuration changes.
 *
 * Contains the numeric values for GPIO configuration
 * fields that can be edited in the GPIO viewer.
 */
export interface EditValues {
  /** Function select value (0-15) */
  mux: number;
  /** Pull direction value */
  pull: number;
  /** Drive level value */
  drv: number;
  /** Data/output value */
  data: number;
}

/**
 * Progress state for GPIO read operations.
 *
 * Tracks current and total for batch GPIO register
 * read operations showing progress to user.
 */
export interface ProgressState {
  /** Current item count */
  current: number;
  /** Total item count */
  total: number;
}