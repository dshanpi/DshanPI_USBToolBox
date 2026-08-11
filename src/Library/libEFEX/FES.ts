import { invokeCommand } from '../../Platform/IPC';
import { EfexError } from './Error';
import {
  EfexErrorData,
  FesDataType,
  FesToolMode,
  FesVerifyResp,
  FES_DATA_TYPE_VALUES,
  FES_TOOL_MODE_VALUES,
} from './Types';

/**
 * Operations for FES mode device communication.
 *
 * FES (Firmware Execution Service) is the mode after UBoot is loaded
 * and provides advanced flash operations. Used for partition download,
 * verification, and device mode control.
 *
 * Operations include:
 * - Storage/secure status query
 * - Flash size probing
 * - Data download/upload to flash
 * - Verification commands
 * - Device mode control
 */
export interface FesOperations {
  /** Query storage type (NOR, NAND, SD card, eMMC) */
  queryStorage(): Promise<number>;
  /** Query secure boot status */
  querySecure(): Promise<number>;
  /** Probe flash size in sectors */
  probeFlashSize(): Promise<number>;
  /** Enable/disable flash access */
  flashSetOnoff(storageType: number, onOff: boolean): Promise<void>;
  /** Get unique chip ID */
  getChipId(): Promise<string>;
  /** Download data to flash address */
  down(buf: Uint8Array, addr: number, dataType: FesDataType): Promise<void>;
  /** Upload data from flash address */
  up(buf: Uint8Array, addr: number, dataType: FesDataType): Promise<void>;
  /** Verify by address and size */
  verifyValue(addr: number, size: number): Promise<FesVerifyResp>;
  /** Verify by tag */
  verifyStatus(tag: number): Promise<FesVerifyResp>;
  /** Verify UBoot block by tag */
  verifyUbootBlk(tag: number): Promise<FesVerifyResp>;
  /** Set device tool mode */
  toolMode(toolMode: FesToolMode, nextMode: FesToolMode): Promise<void>;
  /** Set FES operation timeout */
  setTimeout(timeoutSecs: number): Promise<void>;
}

/**
 * Creates FES operations for a specific device.
 *
 * @param deviceId - USB device ID from scan
 * @returns FesOperations implementation
 */
export function createFesOperations(deviceId: number): FesOperations {
  return {
    /**
     * Queries the storage type connected to device.
     *
     * Returns storage type code indicating NOR, NAND, SD card, or eMMC.
     *
     * @returns Storage type number
     */
    async queryStorage(): Promise<number> {
      try {
        const storageType = await invokeCommand('efex_fes_query_storage', {
          deviceId,
        });
        return storageType;
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Queries secure boot status.
     *
     * Returns security configuration indicating if device has
     * secure boot enabled.
     *
     * @returns Secure status number
     */
    async querySecure(): Promise<number> {
      try {
        return await invokeCommand('efex_fes_query_secure', {
          deviceId,
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Probes flash storage size.
     *
     * Returns total number of sectors in flash storage.
     *
     * @returns Flash size in sectors
     */
    async probeFlashSize(): Promise<number> {
      try {
        return await invokeCommand('efex_fes_probe_flash_size', {
          deviceId,
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Enables or disables flash access.
     *
     * Must enable flash before download operations.
     *
     * @param storageType - Storage type from queryStorage
     * @param onOff - True to enable, false to disable
     */
    async flashSetOnoff(storageType: number, onOff: boolean): Promise<void> {
      try {
        await invokeCommand('efex_fes_flash_set_onoff', {
          deviceId,
          storageType,
          onOff,
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Gets unique chip identification string.
     *
     * @returns Chip ID string
     */
    async getChipId(): Promise<string> {
      try {
        return await invokeCommand('efex_fes_get_chipid', {
          deviceId,
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Downloads data buffer to flash at specified address.
     *
     * Data type determines how device interprets the data
     * (DRAM, MBR, boot code, partition data, etc.)
     *
     * @param buf - Data buffer to download
     * @param addr - Flash address to write
     * @param dataType - Type of data being downloaded
     */
    async down(buf: Uint8Array, addr: number, dataType: FesDataType): Promise<void> {
      try {
        await invokeCommand('efex_fes_down', {
          deviceId,
          buf: Array.from(buf),
          addr,
          dataType: FES_DATA_TYPE_VALUES[dataType],
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Uploads data from flash at specified address to buffer.
     *
     * Buffer size determines how much data is read.
     *
     * @param buf - Buffer to receive data (size determines length)
     * @param addr - Flash address to read
     * @param dataType - Type of data being uploaded
     */
    async up(buf: Uint8Array, addr: number, dataType: FesDataType): Promise<void> {
      try {
        const result = await invokeCommand('efex_fes_up', {
          deviceId,
          len: buf.length,
          addr,
          dataType: FES_DATA_TYPE_VALUES[dataType],
        });
        buf.set(new Uint8Array(result));
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Verifies data at flash address by computing CRC.
     *
     * @param addr - Flash address to verify
     * @param size - Size of data to verify
     * @returns Verification response with CRC values
     */
    async verifyValue(addr: number, size: number): Promise<FesVerifyResp> {
      try {
        return await invokeCommand('efex_fes_verify_value', {
          deviceId,
          addr,
          size,
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Verifies data by operation tag.
     *
     * Used to check status of previous download operation.
     *
     * @param tag - Operation tag to verify
     * @returns Verification response with CRC values
     */
    async verifyStatus(tag: number): Promise<FesVerifyResp> {
      try {
        return await invokeCommand('efex_fes_verify_status', {
          deviceId,
          tag,
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Verifies UBoot block by tag.
     *
     * Special verification for UBoot partition.
     *
     * @param tag - Operation tag to verify
     * @returns Verification response with CRC values
     */
    async verifyUbootBlk(tag: number): Promise<FesVerifyResp> {
      try {
        return await invokeCommand('efex_fes_verify_uboot_blk', {
          deviceId,
          tag,
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Sets device tool mode and next mode after completion.
     *
     * Controls device behavior after flash operation:
     * - normal: Stay in FES mode
     * - reboot: Reboot device
     * - poweroff: Power off device
     * - boot: Boot to normal mode
     *
     * @param toolMode - Current tool mode
     * @param nextMode - Mode after operation completes
     */
    async toolMode(toolMode: FesToolMode, nextMode: FesToolMode): Promise<void> {
      try {
        await invokeCommand('efex_fes_tool_mode', {
          deviceId,
          toolMode: FES_TOOL_MODE_VALUES[toolMode],
          nextMode: FES_TOOL_MODE_VALUES[nextMode],
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },

    /**
     * Sets FES operation timeout.
     *
     * @param timeoutSecs - Timeout duration in seconds
     */
    async setTimeout(timeoutSecs: number): Promise<void> {
      try {
        await invokeCommand('efex_set_fes_timeout', {
          timeoutSecs,
        });
      } catch (e) {
        throw EfexError.fromData(e as EfexErrorData);
      }
    },
  };
}