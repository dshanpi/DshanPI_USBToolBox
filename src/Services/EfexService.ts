import {
  EfexContext,
  EfexDevice,
  DeviceMode,
  UsbBackend,
  EfexError,
  DEVICE_MODE_NAMES,
} from '../Library/libEFEX';
import { invokeCommand } from '../Platform/IPC';

/** Re-export types from libEFEX for convenience */
export type { EfexContext, EfexDevice, DeviceMode, UsbBackend, EfexError };
export { DEVICE_MODE_NAMES };

/**
 * Result from DRAM initialization operation.
 *
 * Contains DRAM initialization flags and parameters returned
 * after FEL mode DRAM setup.
 */
export interface InitDRAMResult {
  /** Whether initialization succeeded */
  success: boolean;
  /** DRAM initialization completion flag */
  dram_init_flag: number;
  /** DRAM parameter update flag */
  dram_update_flag: number;
  /** Return address for initialization code */
  ret_addr: number;
  /** DRAM parameters array */
  dram_para: number[];
}

/**
 * Service for EFEX device operations.
 *
 * EfexService provides a simplified API for EFEX (FEL/FES) device
 * communication, wrapping the EfexContext class with convenient
 * methods for device scanning, context management, and memory operations.
 *
 * This service is used by DeviceDiscoveryService for device scanning
 * and by FlashManager for flash operations requiring FEL mode.
 *
 * Example usage:
 * ```typescript
 * const devices = await efexService.scanDevices();
 * const ctx = await efexService.createContextAndOpen(devices[0]);
 * const mode = await efexService.refreshMode(ctx);
 * await efexService.writeMemory(ctx, 0x4000, ubootData);
 * await efexService.closeContext(ctx);
 * ```
 */
export class EfexService {
  /**
   * Scans for connected EFEX devices.
   *
   * Returns all FEL/FES mode devices found on USB.
   *
   * @returns Promise resolving to array of EfexDevice
   */
  async scanDevices(): Promise<EfexDevice[]> {
    return EfexContext.scanDevices();
  }

  /**
   * Gets the current USB backend driver setting.
   *
   * @returns Promise resolving to UsbBackend type
   */
  async getUsbBackend(): Promise<UsbBackend> {
    return EfexContext.getUsbBackend();
  }

  /**
   * Sets the USB backend driver type.
   *
   * @param backend - USB backend ('libusb' or 'winusb')
   */
  async setUsbBackend(backend: UsbBackend): Promise<void> {
    await EfexContext.setUsbBackend(backend);
  }

  /**
   * Creates an EFEX context for a device.
   *
   * Context is created but not yet opened/refreshed.
   *
   * @param device - Device to create context for
   * @returns EfexContext instance
   */
  createContext(device: EfexDevice): EfexContext {
    return new EfexContext(device.deviceId, device.bus, device.port);
  }

  /**
   * Closes an EFEX context and releases resources.
   *
   * @param context - Context to close
   */
  async closeContext(context: EfexContext): Promise<void> {
    await context.close();
  }

  /**
   * Creates context and opens/refreshes device mode.
   *
   * Convenience method combining createContext and refreshMode.
   *
   * @param device - Device to open
   * @returns EfexContext with mode refreshed
   */
  async createContextAndOpen(device: EfexDevice): Promise<EfexContext> {
    const context = this.createContext(device);
    await context.refreshMode();
    return context;
  }

  /**
   * Refreshes the device mode from hardware.
   *
   * @param context - Context to refresh
   * @returns Updated DeviceMode
   */
  async refreshMode(context: EfexContext): Promise<DeviceMode> {
    await context.refreshMode();
    return context.mode;
  }

  /**
   * Gets device mode with automatic context lifecycle.
   *
   * Creates context, refreshes mode, and closes context.
   *
   * @param device - Device to query
   * @returns DeviceMode value
   */
  async getDeviceMode(device: EfexDevice): Promise<DeviceMode> {
    const ctx = await this.createContextAndOpen(device);
    try {
      return this.refreshMode(ctx);
    } finally {
      await this.closeContext(ctx);
    }
  }

  /**
   * Checks if an error is a timeout error.
   *
   * @param error - Error to check
   * @returns True if error is EfexError timeout
   */
  isTimeoutError(error: unknown): boolean {
    return error instanceof EfexError && error.isTimeout();
  }

  /**
   * Reads memory from device in FEL mode.
   *
   * @param context - Open context in FEL mode
   * @param address - Memory address to read
   * @param length - Number of bytes to read
   * @returns Uint8Array with read data
   */
  readMemory(context: EfexContext, address: number, length: number): Promise<Uint8Array> {
    return context.fel.read(address, length);
  }

  /**
   * Writes memory to device in FEL mode.
   *
   * @param context - Open context in FEL mode
   * @param address - Memory address to write
   * @param data - Data to write
   */
  async writeMemory(context: EfexContext, address: number, data: Uint8Array): Promise<void> {
    await context.fel.write(address, data);
  }

  /**
   * Executes code at memory address in FEL mode.
   *
   * @param context - Open context in FEL mode
   * @param address - Address of code to execute
   */
  async execute(context: EfexContext, address: number): Promise<void> {
    await context.fel.exec(address);
  }

  /**
   * Initializes DRAM using default parameters.
   *
   * Loads FES data and initializes DRAM controller.
   *
   * @param context - Open context in FEL mode
   * @param fexData - FES binary data
   * @returns InitDRAMResult with initialization status
   */
  initDram(context: EfexContext, fexData: Uint8Array): Promise<InitDRAMResult> {
    return invokeCommand('efex_fel_init_dram', {
      deviceId: context.deviceId,
      fexData: Array.from(fexData),
    });
  }

  /**
   * Initializes DRAM with custom parameters.
   *
   * Loads FES data and initializes DRAM with specified parameters,
   * useful for DRAM tuning and custom configurations.
   *
   * @param context - Open context in FEL mode
   * @param fexData - FES binary data
   * @param dramPara - Custom DRAM parameters array
   * @returns InitDRAMResult with initialization status
   */
  initDramWithParams(
    context: EfexContext,
    fexData: Uint8Array,
    dramPara: number[]
  ): Promise<InitDRAMResult> {
    return invokeCommand('efex_fel_init_dram_with_params', {
      deviceId: context.deviceId,
      fexData: Array.from(fexData),
      dramInfo: {
        dram_init_flag: 0,
        dram_update_flag: 0,
        dram_para: dramPara,
      },
    });
  }
}

/** Singleton instance of EfexService */
export const efexService = new EfexService();