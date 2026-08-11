import { invokeCommand } from '../../Platform/IPC';
import { EfexError } from './Error';
import { EfexErrorData } from './Types';

/**
 * Operations for FEL mode device communication.
 *
 * FEL is the bootloader mode on Allwinner devices that allows
 * basic memory operations: read, write, and execute. Used for
 * loading initial payloads and transitioning to FES mode.
 *
 * Operations include:
 * - read: Read memory buffer from device
 * - write: Write memory buffer to device
 * - exec: Execute code at address
 * - setTimeout: Set operation timeout
 */
export interface FelOperations {
  /** Read buffer from memory address */
  read(addr: number, len: number): Promise<Uint8Array>;
  /** Write buffer to memory address */
  write(addr: number, data: Uint8Array): Promise<void>;
  /** Execute code at memory address */
  exec(addr: number): Promise<void>;
  /** Set operation timeout in seconds */
  setTimeout(timeoutSecs: number): Promise<void>;
}

/**
 * Creates FEL operations for a specific device.
 *
 * @param deviceId - USB device ID from scan
 * @returns FelOperations implementation
 */
export function createFelOperations(deviceId: number): FelOperations {
  return {
    /**
     * Reads data from device memory at specified address.
     *
     * @param addr - Memory address to read from
     * @param len - Number of bytes to read
     * @returns Uint8Array with read data
     */
    async read(addr: number, len: number): Promise<Uint8Array> {
      try {
        const result = await invokeCommand('efex_fel_read', {
          deviceId,
          addr,
          len,
        });
        return new Uint8Array(result);
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Writes data to device memory at specified address.
     *
     * @param addr - Memory address to write to
     * @param data - Data buffer to write
     */
    async write(addr: number, data: Uint8Array): Promise<void> {
      try {
        await invokeCommand('efex_fel_write', {
          deviceId,
          addr,
          data: Array.from(data),
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Executes code at specified memory address.
     *
     * Used to run loaded payloads like UBoot or eGON.
     *
     * @param addr - Address of code to execute
     */
    async exec(addr: number): Promise<void> {
      try {
        await invokeCommand('efex_fel_exec', {
          deviceId,
          addr,
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Sets FEL operation timeout.
     *
     * @param timeoutSecs - Timeout duration in seconds
     */
    async setTimeout(timeoutSecs: number): Promise<void> {
      try {
        await invokeCommand('efex_set_fel_timeout', {
          timeoutSecs,
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },
  };
}