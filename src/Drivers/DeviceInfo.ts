import { adbService } from '../Services';
import type { SunxiInfo } from './Types';
import { formatHex } from '../Utils/Format';

/**
 * Callback type for progress reporting during batch operations.
 *
 * @param current - Current operation number
 * @param total - Total number of operations
 */
export type ProgressCallback = (current: number, total: number) => void;

/**
 * Reads register values from device memory using sunxi_dump sysfs interface.
 *
 * Uses ADB shell to access /sys/class/sunxi_dump/dump which provides
 * read access to memory-mapped registers on Allwinner SoCs.
 *
 * For single register reads, returns a number.
 * For multiple register reads, returns a record mapping addresses to values.
 *
 * @param serial - ADB device serial number
 * @param address - Starting memory address to read
 * @param length - Number of registers to read (default 1)
 * @returns Promise resolving to register value(s)
 * @throws Error if no device is selected
 */
export async function readRegister(
  serial: string | null,
  address: number,
  length?: number
): Promise<number | Record<string, number>> {
  if (!serial) {
    throw new Error('No device selected');
  }

  const len = length || 1;
  if (len === 1) {
    const cmd = `echo ${formatHex(address)} > /sys/class/sunxi_dump/dump && cat /sys/class/sunxi_dump/dump`;
    const result = await adbService.shellCommand(serial, cmd);
    return parseInt(result.trim(), 16);
  } else {
    const regEnd = address + (len - 1) * 4;
    const cmd = `echo ${formatHex(address)},${formatHex(regEnd)} > /sys/class/sunxi_dump/dump && cat /sys/class/sunxi_dump/dump`;
    const result = await adbService.shellCommand(serial, cmd);

    const regMap: Record<string, number> = {};
    const lines = result.trim().split('\r\n');
    for (const line of lines) {
      try {
        const [addrPart, valuesPart] = line.split(':');
        if (!addrPart || !valuesPart) continue;

        const addr = addrPart.trim();
        const values = valuesPart.trim().split(/\s+/);

        for (let i = 0; i < values.length; i++) {
          const startAddr = parseInt(addr, 16) + i * 4;
          const key = formatHex(startAddr);
          regMap[key] = parseInt(values[i], 16);
        }
      } catch {
        continue;
      }
    }
    return regMap;
  }
}

/**
 * Reads multiple registers in batch with progress reporting.
 *
 * Splits large reads into chunks of 128 registers maximum to avoid
 * timeout issues. Reports progress after each chunk is read.
 *
 * Returns a Map with numeric address keys instead of hex strings,
 * which is more efficient for GPIO operations.
 *
 * @param serial - ADB device serial number
 * @param address - Starting memory address to read
 * @param length - Total number of registers to read
 * @param progress - Optional callback for progress updates
 * @returns Promise resolving to Map of address to value
 * @throws Error if no device is selected
 */
export async function readRegisterBatch(
  serial: string | null,
  address: number,
  length: number,
  progress?: ProgressCallback
): Promise<Map<number, number>> {
  if (!serial) {
    throw new Error('No device selected');
  }

  if (length <= 0) {
    return new Map();
  }

  console.log(
    `[readRegisterBatch] address=${formatHex(address)}, regEnd=${formatHex(address + length - 1)}, length=${length}`
  );

  const MAX_REGS_PER_READ = 128;
  const regMap = new Map<number, number>();

  let remaining = length;
  let currentAddr = address;
  const totalReads = Math.ceil(length / MAX_REGS_PER_READ);
  let currentRead = 0;

  while (remaining > 0) {
    const chunkLen = Math.min(remaining, MAX_REGS_PER_READ);
    const regEnd = currentAddr + (chunkLen - 1) * 4;
    const cmd = `echo ${formatHex(currentAddr)},${formatHex(regEnd)} > /sys/class/sunxi_dump/dump && cat /sys/class/sunxi_dump/dump`;
    const result = await adbService.shellCommand(serial, cmd);

    const lines = result.trim().split(/\r?\n/);
    for (const line of lines) {
      try {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const addrPart = line.substring(0, colonIndex).trim();
        const valuesPart = line.substring(colonIndex + 1).trim();
        if (!addrPart || !valuesPart) continue;

        const baseAddr = parseInt(addrPart.replace(/^0x/i, ''), 16);
        const values = valuesPart.split(/\s+/);

        for (let i = 0; i < values.length; i++) {
          const addr = baseAddr + i * 4;
          const val = parseInt(values[i], 16);
          regMap.set(addr, val);
        }
      } catch {
        continue;
      }
    }

    remaining -= chunkLen;
    currentAddr += chunkLen * 4;
    currentRead++;
    if (progress) progress(currentRead, totalReads);
  }

  return regMap;
}

/**
 * Writes a value to a device memory register using sunxi_dump sysfs interface.
 *
 * Uses ADB shell to access /sys/class/sunxi_dump/write which provides
 * write access to memory-mapped registers on Allwinner SoCs.
 *
 * After writing, reads back the register to verify the write succeeded.
 *
 * @param serial - ADB device serial number
 * @param address - Memory address to write
 * @param data - Value to write to register
 * @returns Promise resolving to true if write verified, false otherwise
 * @throws Error if no device is selected
 */
export async function writeRegister(
  serial: string | null,
  address: number,
  data: number
): Promise<boolean> {
  if (!serial) {
    throw new Error('No device selected');
  }
  console.log(`[writeRegister] address=${formatHex(address)}, data=${formatHex(data)}`);

  const cmd = `echo ${formatHex(address)} ${formatHex(data)} > /sys/class/sunxi_dump/write && echo ${formatHex(address)} > /sys/class/sunxi_dump/dump && cat /sys/class/sunxi_dump/dump`;
  const result = await adbService.shellCommand(serial, cmd);

  try {
    const readBack = parseInt(result.trim(), 16);
    return readBack === data;
  } catch {
    return false;
  }
}

/**
 * Retrieves system information from Allwinner SoC device.
 *
 * Reads sunxi_info sysfs entries to get platform, secure status,
 * serial number, chip type, and batch number.
 *
 * Automatically handles permission issues by attempting 'su' command
 * if initial read fails with 'inaccessible or not found' error.
 *
 * @param serial - ADB device serial number
 * @returns Promise resolving to SunxiInfo object
 * @throws Error if no device is selected
 */
export async function getSunxiInfo(serial: string | null): Promise<SunxiInfo> {
  if (!serial) {
    throw new Error('No device selected');
  }

  let result = await adbService.shellCommand(serial, 'find /sys/class -name sunxi_info');
  let infoPath = '';

  if (result.includes('sunxi_info')) {
    infoPath = result.trim();
    result = await adbService.shellCommand(serial, `cat ${infoPath}/sys_info`);
    if (result.includes('inaccessible or not found')) {
      await adbService.shellCommand(serial, 'su');
      result = await adbService.shellCommand(serial, `cat ${infoPath}/sys_info`);
    }
  } else {
    result = await adbService.shellCommand(serial, 'cat /sys/class/sunxi_info/sys_info');
    if (result.includes('inaccessible or not found')) {
      await adbService.shellCommand(serial, 'su');
      result = await adbService.shellCommand(serial, 'cat /sys/class/sunxi_info/sys_info');
    }
  }

  const infoDict: Record<string, string> = {};
  const lines = result.trim().split('\n');
  for (const line of lines) {
    if (line.includes(':')) {
      const [key, value] = line.split(':');
      infoDict[key.trim()] = value.trim();
    }
  }
  console.log(`[getSunxiInfo] result: ${result}`);

  return {
    platform: infoDict['sunxi_platform'] || '',
    secure: infoDict['sunxi_secure'] || '',
    serial: infoDict['sunxi_serial'] || '',
    chiptype: infoDict['sunxi_chiptype'] || '',
    batchno: infoDict['sunxi_batchno'] || '',
  };
}

/** Re-export all types from Types.ts */
export * from './Types';