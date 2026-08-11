import { invokeCommand } from '../../Platform/IPC';
import { EfexError } from './Error';
import { DeviceMode, EfexDevice, EfexErrorData, PayloadArch, UsbBackend } from './Types';
import { FelOperations, createFelOperations } from './FEL';
import { FesOperations, createFesOperations } from './FES';

/**
 * Operations for low-level memory access via payload execution.
 *
 * Provides readl/writel for reading and writing 32-bit values
 * at memory addresses, useful for hardware register manipulation.
 */
export interface PayloadsOperations {
  /** Read 32-bit value at address */
  readl(addr: number): Promise<number>;
  /** Write 32-bit value at address */
  writel(value: number, addr: number): Promise<void>;
}

/**
 * Context for communicating with an EFEX device (FEL/FES mode).
 *
 * EfexContext wraps all operations for a single device connection,
 * providing access to FEL operations (bootloader), FES operations
 * (firmware execution service), and payload execution for memory access.
 *
 * The context manages device mode detection and operation lifecycle.
 * Use withEfexContext for automatic cleanup, or manually manage
 * open/close lifecycle.
 *
 * Example usage:
 * ```typescript
 * // Automatic cleanup
 * await withEfexContext(device, async (ctx) => {
 *   await ctx.refreshMode();
 *   if (ctx.mode === 'fel') {
 *     await ctx.fel.write(0x4000, ubootData);
 *   }
 * });
 *
 * // Manual lifecycle
 * const ctx = new EfexContext(device.deviceId, device.bus, device.port);
 * await ctx.refreshMode();
 * await ctx.close();
 * ```
 */
export class EfexContext {
  /** USB device ID assigned by libefex */
  private readonly _deviceId: number;

  /** USB bus number */
  private readonly _bus: number;

  /** USB port number */
  private readonly _port: number;

  /** Current device mode detected */
  private _mode: DeviceMode = 'unknown';

  /** Human-readable mode string */
  private _modeStr: string = '';

  /** FEL operations instance */
  private _fel: FelOperations | null = null;

  /** FES operations instance */
  private _fes: FesOperations | null = null;

  /** Payload operations instance */
  private _payloads: PayloadsOperations | null = null;

  /**
   * Creates a context for the specified device.
   *
   * Automatically initializes FEL, FES, and payload operations.
   *
   * @param deviceId - USB device ID from scan
   * @param bus - USB bus number
   * @param port - USB port number
   */
  constructor(deviceId: number, bus: number, port: number) {
    this._deviceId = deviceId;
    this._bus = bus;
    this._port = port;
    this.initOperations();
  }

  /** Gets the USB device ID */
  get deviceId(): number {
    return this._deviceId;
  }

  /** Gets the USB bus number */
  get bus(): number {
    return this._bus;
  }

  /** Gets the USB port number */
  get port(): number {
    return this._port;
  }

  /** Gets the current device mode */
  get mode(): DeviceMode {
    return this._mode;
  }

  /** Gets the human-readable mode string */
  get modeStr(): string {
    return this._modeStr;
  }

  /**
   * Gets FEL operations for bootloader communication.
   *
   * @throws Error if device not opened
   */
  get fel(): FelOperations {
    if (!this._fel) {
      throw new Error('Device not opened');
    }
    return this._fel;
  }

  /**
   * Gets FES operations for firmware execution service.
   *
   * @throws Error if device not opened
   */
  get fes(): FesOperations {
    if (!this._fes) {
      throw new Error('Device not opened');
    }
    return this._fes;
  }

  /**
   * Gets payload operations for memory access.
   *
   * @throws Error if context not initialized
   */
  get payloads(): PayloadsOperations {
    if (!this._payloads) {
      throw new Error('Device context not initialized');
    }
    return this._payloads;
  }

  /** Checks if the context has been opened */
  get isOpened(): boolean {
    return this._fel !== null && this._fes !== null && this._payloads !== null;
  }

  /**
   * Sets the USB backend driver type.
   *
   * @param backend - USB backend ('libusb' or 'winusb')
   */
  static async setUsbBackend(backend: UsbBackend): Promise<void> {
    try {
      await invokeCommand('efex_set_usb_backend', { backend });
    } catch (e) {
      throw EfexError.fromData(e as EfexErrorData);
    }
  }

  /**
   * Gets the current USB backend driver type.
   *
   * @returns Current USB backend setting
   */
  static async getUsbBackend(): Promise<UsbBackend> {
    try {
      return await invokeCommand('efex_get_usb_backend');
    } catch (e) {
      throw EfexError.fromData(e as EfexErrorData);
    }
  }

  /**
   * Scans for connected EFEX devices.
   *
   * Returns all FEL/FES mode devices found on USB.
   *
   * @returns Array of EfexDevice information
   */
  static async scanDevices(): Promise<EfexDevice[]> {
    try {
      const devices = await invokeCommand('efex_scan_devices');
      return devices.map((device) => ({
        deviceId: device.device_id,
        chip_version: device.chip_version,
        mode: device.mode,
        mode_str: device.mode_str,
        bus: device.bus,
        port: device.port,
      }));
    } catch (e) {
      throw EfexError.fromData(e as EfexErrorData);
    }
  }

  /** Initializes FEL, FES, and payload operation instances */
  private initOperations(): void {
    this._fel = createFelOperations(this._deviceId);
    this._fes = createFesOperations(this._deviceId);
    this._payloads = this.createPayloadsOperations();
  }

  /**
   * Closes the device connection and cleans up.
   *
   * Resets mode to 'unknown' and clears all operation instances.
   */
  async close(): Promise<void> {
    try {
      await invokeCommand('efex_close_device', { deviceId: this._deviceId });
    } catch (e) {
      throw EfexError.fromData(e as EfexErrorData);
    } finally {
      this._fel = null;
      this._fes = null;
      this._payloads = null;
      this._mode = 'unknown';
      this._modeStr = '';
    }
  }

  /**
   * Refreshes the device mode from hardware.
   *
   * Queries the current device mode (FEL, FES/SRV, etc.) and updates
   * internal state. Should be called after device connection.
   */
  async refreshMode(): Promise<void> {
    try {
      this._mode = await invokeCommand('efex_get_device_mode', {
        deviceId: this._deviceId,
      });
      this._modeStr = await invokeCommand('efex_get_device_mode_str', {
        deviceId: this._deviceId,
      });
    } catch (e) {
      throw EfexError.fromData(e as EfexErrorData);
    }
  }

  /**
   * Creates payload operations for memory access.
   *
   * @returns PayloadsOperations implementation
   */
  private createPayloadsOperations(): PayloadsOperations {
    const deviceId = this._deviceId;
    return {
      /**
       * Reads a 32-bit value from memory address.
       *
       * @param addr - Memory address to read
       * @returns 32-bit value at address
       */
      async readl(addr: number): Promise<number> {
        try {
          return await invokeCommand('efex_payloads_readl', {
            deviceId,
            addr,
          });
        } catch (e) {
          throw EfexError.fromData(e as EfexErrorData);
        }
      },

      /**
       * Writes a 32-bit value to memory address.
       *
       * @param value - Value to write
       * @param addr - Memory address to write
       */
      async writel(value: number, addr: number): Promise<void> {
        try {
          await invokeCommand('efex_payloads_writel', {
            deviceId,
            value,
            addr,
          });
        } catch (e) {
          throw EfexError.fromData(e as EfexErrorData);
        }
      },
    };
  }

  /**
   * Initializes payload executables for the specified architecture.
   *
   * Must be called before using payload operations.
   *
   * @param arch - Target CPU architecture ('arm32', 'aarch64', 'riscv')
   */
  static async payloadsInit(arch: PayloadArch): Promise<void> {
    try {
      await invokeCommand('efex_payloads_init', { arch });
    } catch (e) {
      throw EfexError.fromData(e as EfexErrorData);
    }
  }
}

/**
 * Executes an operation with automatic context cleanup.
 *
 * Creates an EfexContext, executes the callback, and ensures
 * the context is closed regardless of success or failure.
 *
 * @param device - Device to connect to
 * @param callback - Function to execute with context
 * @returns Callback return value
 */
export async function withEfexContext<T>(
  device: EfexDevice,
  callback: (ctx: EfexContext) => Promise<T>
): Promise<T> {
  const ctx = new EfexContext(device.deviceId, device.bus, device.port);
  try {
    await ctx.refreshMode();
    return await callback(ctx);
  } finally {
    await ctx.close();
  }
}