import { BootFileHead, DramParamInfo } from './Types';
import {
  ipcParseBoot0,
  ipcParseDramParams,
  ipcSerializeBoot0,
  ipcSerializeDramParams,
} from '../Platform/IPC';

/**
 * Boot0 header parser and serializer.
 *
 * Boot0 is the first-stage bootloader for Allwinner SoCs.
 * It initializes minimal hardware and loads the next stage
 * (Boot1/U-Boot) from storage media.
 *
 * The Boot0 header contains critical information including:
 * - Magic number for identification
 * - Run address where code executes
 * - Return address for boot flow
 * - Platform and CPU information
 *
 * Example usage:
 * ```typescript
 * const header = await Boot0Header.parse(boot0Buffer);
 * console.log(`Boot0 runs at 0x${header.run_addr.toString(16)}`);
 * ```
 */
export class Boot0Header {
  /**
   * Parses Boot0 header from binary data.
   *
   * @param buffer - Binary Boot0 data
   * @returns Parsed BootFileHead structure
   */
  static async parse(buffer: Uint8Array): Promise<BootFileHead> {
    return (await ipcParseBoot0(buffer)) as BootFileHead;
  }

  /**
   * Serializes Boot0 header to binary format.
   *
   * @param header - BootFileHead structure to serialize
   * @returns Binary Boot0 data
   */
  static async serialize(header: BootFileHead): Promise<Uint8Array> {
    return ipcSerializeBoot0(header);
  }

  /**
   * Validates Boot0 binary data.
   *
   * Attempts to parse the buffer and returns true if successful.
   *
   * @param buffer - Binary Boot0 data to validate
   * @returns True if data contains valid Boot0 header
   */
  static async isValid(buffer: Uint8Array): Promise<boolean> {
    try {
      await this.parse(buffer);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the run address from Boot0 header.
   *
   * Run address is where Boot0 code executes in memory.
   *
   * @param buffer - Binary Boot0 data
   * @returns Run address value
   */
  static async getRunAddress(buffer: Uint8Array): Promise<number> {
    const header = await this.parse(buffer);
    return header.run_addr;
  }

  /**
   * Gets the return address from Boot0 header.
   *
   * Return address is where Boot0 jumps after completing
   * hardware initialization.
   *
   * @param buffer - Binary Boot0 data
   * @returns Return address value
   */
  static async getRetAddress(buffer: Uint8Array): Promise<number> {
    const header = await this.parse(buffer);
    return header.ret_addr;
  }

  /**
   * Gets the total length from Boot0 header.
   *
   * Length includes header and bootloader code size.
   *
   * @param buffer - Binary Boot0 data
   * @returns Total length in bytes
   */
  static async getLength(buffer: Uint8Array): Promise<number> {
    const header = await this.parse(buffer);
    return header.length;
  }
}

/**
 * DRAM parameter parser and serializer.
 *
 * DRAM parameters define the memory controller configuration
 * for the SoC, including timing, size, and type settings.
 * These parameters are critical for proper DRAM initialization
 * during boot and can be tuned for optimization.
 *
 * Example usage:
 * ```typescript
 * const params = await DramParamParser.parse(dramBuffer);
 * console.log(`DRAM init flag: ${params.dram_init_flag}`);
 * const empty = DramParamParser.createEmpty();
 * ```
 */
export class DramParamParser {
  /**
   * Parses DRAM parameters from binary data.
   *
   * @param buffer - Binary DRAM parameter data
   * @returns Parsed DramParamInfo structure
   */
  static async parse(buffer: Uint8Array): Promise<DramParamInfo> {
    return (await ipcParseDramParams(buffer)) as DramParamInfo;
  }

  /**
   * Serializes DRAM parameters to binary format.
   *
   * @param info - DramParamInfo structure to serialize
   * @returns Binary DRAM parameter data
   */
  static async serialize(info: DramParamInfo): Promise<Uint8Array> {
    return ipcSerializeDramParams(info);
  }

  /**
   * Creates an empty DRAM parameter structure.
   *
   * Returns a default DramParamInfo with zeroed parameters,
   * useful for initializing new configurations.
   *
   * @returns Empty DramParamInfo structure
   */
  static createEmpty(): DramParamInfo {
    return {
      dram_init_flag: 0,
      dram_update_flag: 0,
      dram_para: new Array(32).fill(0),
    };
  }
}