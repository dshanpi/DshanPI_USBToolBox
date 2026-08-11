/**
 * SPI 引擎 Hook —— 封装 CH347 后端的 SPI/GPIO 命令调用。
 *
 * 抽取自 SPIMasterTab 的核心 SPI 操作逻辑，专注显示屏调试场景：
 *   - SPI 初始化（Mode / Speed / CS / DataBits）
 *   - 单次写字节 (write) / 读字节 (read) / 双工传输 (transfer)
 *   - CS / DC / RST GPIO 电平控制（DC=GPIO4, RST=GPIO5，与 SPIMasterTab 一致）
 *   - 命令表执行 (runCommandTable) —— 接受 {cmd|data|delay|dc|rst} 序列并按顺序下发
 *
 * 与 SPIMasterTab 的差异：
 *   - 不维护 Step 列表 UI，纯命令式 API
 *   - 不区分 Run All / Run Selected / Loop —— 由调用方决定
 *   - 内置 await 队列，确保命令按发出顺序串行执行（CH347 是物理设备，并行调用会乱序）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invokeCommand } from '../../../Platform/IPC';
import { sharedDevice } from '../../SPITool/sharedDevice';

/** 命令表中一行的类型。映射到 SPI 总线上的 DC 电平 + 数据位。 */
export type DisplayCommandType = 'cmd' | 'data' | 'delay' | 'cs' | 'dc' | 'rst' | 'bl' | 'fill';

/** 命令表中一行（与 InitCommandTable 组件共用）。 */
export interface DisplayCommandRow {
  /** 唯一 ID（前端用来 React key，不发到硬件） */
  id: number;
  /** 命令类型：cmd=DC低发命令，data=DC高发数据，delay=纯延时，dc=设DC电平，rst=设RST电平，
   *  bl=设背光(PWM/GPIO6)电平，fill=用指定颜色填充 N 个像素(RGB 屏整屏点亮) */
  type: DisplayCommandType;
  /**
   * 数据负载：
   *   - cmd / data：十六进制字符串（如 "AE" 或 "A8 3F"）
   *   - delay：微秒数字符串（如 "20000"）
   *   - cs / dc / rst / bl：电平字符串 "HIGH"(高) 或 "LOW"(低)
   *   - fill："<颜色字节hex> <像素数>"，如 "F8 00 153600" = 红色填充 320×480。
   *     颜色字节按 SPI 顺序给出（RGB565 高字节在前），最后一个空格分隔的整数是像素数。
   *     前置需已发 RAMWR(0x2C) 命令进入显存写入态。
   */
  data: string;
}

/** SPI 配置参数。各字段含义对齐 CH347Demo / SPIMasterTab。 */
export interface SpiConfig {
  /** SPI 模式 0-3（CPOL/CPHA 组合） */
  mode: number;
  /** 频率，单位 Hz */
  frequencyHz: number;
  /** 当前硬件固定使用 CS0 */
  cs: 0;
  /** 数据位宽：8 或 16 */
  dataBits: 8 | 16;
  /** 位序：0=LSB first, 1=MSB first */
  byteOrder: 0 | 1;
}

/** 日志回调函数。 */
export type SpiLogger = (message: string, isError?: boolean) => void;

export interface SpiTransferProgress {
  sentBytes: number;
  totalBytes: number;
  elapsedMs: number;
}

export interface SpiTransferOptions {
  signal?: AbortSignal;
  onProgress?: (progress: SpiTransferProgress) => void;
  /** 连续帧传输时不输出每帧完成日志。 */
  silent?: boolean;
}

function transferCancelled(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

/** Hook 入参。 */
export interface UseSpiEngineProps {
  /** CH347 设备索引（来自 sharedDevice） */
  deviceIndex: number;
  /** 是否已连接（来自 sharedDevice） */
  connected: boolean;
  /** 共享设备每次重新打开时递增的会话编号，用于使旧 SPI 配置立即失效。 */
  connectionSession: number;
  /** 日志输出回调，由调用方挂到 LogConsole */
  log: SpiLogger;
}

/** 解析 hex 字符串为字节数组（容错：忽略非 hex 字符）。 */
function parseHex(str: string): number[] {
  return str
    .trim()
    .split(/[\s,]+/)
    .map((s) => parseInt(s, 16))
    .filter((v) => !isNaN(v) && v >= 0 && v <= 0xff);
}

const CH347_CLOCK_LABELS = [
  '60 MHz',
  '30 MHz',
  '15 MHz',
  '7.5 MHz',
  '3.75 MHz',
  '1.875 MHz',
  '937.5 KHz',
  '468.75 KHz',
];

const SPI_CS0_TRANSFER_CODE = 0x80;
const SPI_CS0_ENABLE_MASK = 0x0001;

/**
 * SPI 引擎 Hook。
 *
 * @returns 一组命令式 API + 当前 CS 电平状态
 */
export function useSpiEngine(props: UseSpiEngineProps) {
  const { deviceIndex, connected, connectionSession, log } = props;
  /** SPI 是否已 init 过 —— 避免每次 write 都重新 init（参考 CH347Demo CH347SpiStream 行为） */
  const configuredRef = useRef(false);
  /** 当前 CS 电平：null=未知，false=LOW，true=HIGH */
  const [csLevel, setCsLevel] = useState<boolean | null>(null);

  // 设备断开、索引改变或重新建立连接会话时复位 SPI 配置标志。
  // sessionId 可以覆盖“快速重插时 React 只观察到 online=true”的情况，避免沿用旧句柄的配置。
  useEffect(() => {
    configuredRef.current = false;
    setCsLevel(null);
  }, [connected, connectionSession, deviceIndex]);

  /**
   * 串行化队列 —— 所有 CH347 操作（setCs/setDc/setRst/writeBytes）排队执行，
   * 确保前一个 USB 事务完成（后端返回）才发下一个。
   * CH347 是物理 USB 设备，setDc（GPIO 事务）和 writeBytes（SPI 事务）是两个独立 USB 请求，
   * 若不串行，SPI 写可能在 DC 切换生效前发出 → 命令字节被当数据写入显存 →
   * 设 page 命令失效 → 所有页数据写到同一页 → 亮一下后被覆盖成黑。
   * 用 promise chain 严格串行：op 必须等前一个 resolve/reject 后才执行。
   */
  const queueTailRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
    const run = queueTailRef.current.then(op, op);
    // 把链尾推进到本次完成（无论成败），失败不阻塞后续
    queueTailRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }, []);

  /**
   * 执行 SPI 初始化。多次调用幂等。
   * 调用方可以传入完整配置；如果只是想"必要时初始化"则用 ensureConfigured。
   */
  const initSpi = useCallback(
    async (cfg: SpiConfig): Promise<boolean> => {
      if (!connected) {
        log('Not connected', true);
        return false;
      }

      const configureSpi = async (): Promise<void> => {
        const csCode = SPI_CS0_TRANSFER_CODE;
        const speedMhz = Math.max(1, Math.round(cfg.frequencyHz / 1_000_000));
        // isAutoDeactiveCs=0 — 多字节传输内 CS 保持低电平（显示屏初始化序列必需）
        await invokeCommand('ch347_spi_init', {
          index: deviceIndex,
          mode: cfg.mode,
          speedMhz,
          frequencyHz: cfg.frequencyHz,
          cs: csCode,
          dataBits: cfg.dataBits,
          byteOrder: cfg.byteOrder,
          outDefaultData: 0xff,
          isAutoDeactiveCs: 0,
        });
        // 初始化后 CS 默认 HIGH，等用户/命令表显式拉低。
        await invokeCommand('ch347_spi_set_chip_select', {
          index: deviceIndex,
          enableSelect: SPI_CS0_ENABLE_MASK,
          chipSelect: SPI_CS0_ENABLE_MASK,
          isAutoDeactiveCs: 0,
          activeDelay: 0,
          delayDeactive: 0,
        });
        configuredRef.current = true;
        setCsLevel(true);
        log(`SPI Init: Mode ${cfg.mode}, ${cfg.frequencyHz}Hz, CS${cfg.cs}, ${cfg.dataBits}-bit`);
        try {
          const actual = await invokeCommand('ch347_spi_get_config', { index: deviceIndex });
          const clockLabel = CH347_CLOCK_LABELS[actual.clock] ?? `index ${actual.clock}`;
          log(
            `SPI 配置读回: Mode ${actual.mode}, ${clockLabel}, ${actual.byteOrder === 1 ? 'MSB' : 'LSB'} First, ` +
              `CS=0x${actual.chipSelect.toString(16).padStart(2, '0')}, AutoCS=${actual.isAutoDeactiveCS}`
          );
          if (actual.byteOrder !== cfg.byteOrder) {
            log(
              `SPI 位序兼容性提示: 已请求 ${cfg.byteOrder === 1 ? 'MSB' : 'LSB'} First，CH347 配置接口报告 ${actual.byteOrder === 1 ? 'MSB' : 'LSB'} First；当前采用原始字节传输，无需软件位序转换`
            );
          }
        } catch (e) {
          log(`SPI 配置读回失败: ${(e as Error).message}`, true);
        }
      };

      configuredRef.current = false;
      await sharedDevice.pausePolling();
      try {
        try {
          await configureSpi();
          return true;
        } catch (firstError) {
          configuredRef.current = false;
          setCsLevel(null);
          log(`检测到 CH347 SPI 会话不可用，正在重新打开设备 #${deviceIndex} 并重试初始化`);

          try {
            await invokeCommand('ch347_reopen', { index: deviceIndex });
            await configureSpi();
            log(`CH347 SPI 会话已恢复，设备 #${deviceIndex} 已重新完成初始化`);
            return true;
          } catch (recoveryError) {
            configuredRef.current = false;
            setCsLevel(null);
            log(
              `SPI 初始化失败: ${(firstError as Error).message}；设备会话自动恢复失败: ${(recoveryError as Error).message}`,
              true
            );
            // 恢复失败后安排一次设备重扫，使物理设备确实不存在时全局状态及时回到离线。
            void sharedDevice.rescan();
            return false;
          }
        }
      } finally {
        sharedDevice.resumePolling();
      }
    },
    [connected, deviceIndex, log]
  );

  /** 若尚未初始化则用提供的配置初始化一次；已初始化则直接返回 true。 */
  const ensureConfigured = useCallback(
    async (cfg: SpiConfig): Promise<boolean> => {
      if (!connected) {
        log('Not connected', true);
        return false;
      }
      if (configuredRef.current) return true;
      log('SPI not configured — auto-initializing...');
      return initSpi(cfg);
    },
    [connected, initSpi, log]
  );

  /** 标记需要重新初始化（断开连接、改了配置等场景）。 */
  const markUnconfigured = useCallback(() => {
    configuredRef.current = false;
  }, []);

  /** 设置指定 CS 电平。level: 0=LOW(Active), 1=HIGH(Deactive)。 */
  const setCs = useCallback(
    async (level: 0 | 1, _cs = 0): Promise<void> => {
      const chipSelect = level === 1 ? SPI_CS0_ENABLE_MASK : 0;
      try {
        await enqueue(() =>
          // 与独立 SPI 工具使用完全相同的手动片选调用。不要在这里叠加
          // ChangeCS；对同一事务连续发送两种片选控制会使 CH347F SPI 会话卡死。
          invokeCommand('ch347_spi_set_chip_select', {
            index: deviceIndex,
            enableSelect: SPI_CS0_ENABLE_MASK,
            chipSelect,
            isAutoDeactiveCs: 0,
            activeDelay: 0,
            delayDeactive: 0,
          })
        );
        setCsLevel(level === 1);
      } catch (e) {
        // 片选失败通常意味着 CH347 SPI 会话已经失效；下次操作必须重新初始化，
        // 不能继续沿用 configured=true 的缓存状态。
        configuredRef.current = false;
        setCsLevel(null);
        throw e;
      }
    },
    [deviceIndex, enqueue]
  );

  /** 设置 DC (GPIO4) 电平。0=命令模式(LOW), 1=数据模式(HIGH)。 */
  const setDc = useCallback(
    async (level: 0 | 1): Promise<void> => {
      await enqueue(() =>
        invokeCommand('ch347_gpio_set', {
          index: deviceIndex,
          enable: 0x10,
          dirOut: 0x10,
          dataOut: level === 1 ? 0x10 : 0x00,
        })
      );
    },
    [deviceIndex, enqueue]
  );

  /** 设置 RST (GPIO5) 电平。0=复位中(LOW), 1=正常运行(HIGH)。 */
  const setRst = useCallback(
    async (level: 0 | 1): Promise<void> => {
      await enqueue(() =>
        invokeCommand('ch347_gpio_set', {
          index: deviceIndex,
          enable: 0x20,
          dirOut: 0x20,
          dataOut: level === 1 ? 0x20 : 0x00,
        })
      );
    },
    [deviceIndex, enqueue]
  );

  /** 设置背光 BL/PWM (GPIO6) 电平。0=背光关(LOW), 1=背光常亮(HIGH)。
   *  ST7796U2 等RGB屏的 PWM 引脚接 CH347 的 GPIO6，高电平=常亮（参考 chapter4-1.md）。 */
  const setBl = useCallback(
    async (level: 0 | 1): Promise<void> => {
      await enqueue(() =>
        invokeCommand('ch347_gpio_set', {
          index: deviceIndex,
          enable: 0x40,
          dirOut: 0x40,
          dataOut: level === 1 ? 0x40 : 0x00,
        })
      );
    },
    [deviceIndex, enqueue]
  );

  /**
   * 硬件复位脉冲：拉低 RST → 等待 → 拉高 RST → 等待。
   * 显示屏开机/复位的标准操作。
   */
  const hardReset = useCallback(
    async (lowMs = 10, highMs = 50): Promise<void> => {
      await setRst(0);
      await new Promise((r) => setTimeout(r, lowMs));
      await setRst(1);
      await new Promise((r) => setTimeout(r, highMs));
      log(`Hard reset: RST LOW ${lowMs}ms → HIGH ${highMs}ms`);
    },
    [setRst, log]
  );

  /** 通过 SPI 写出一段字节（基于当前 SPI 配置）。 */
  const writeBytes = useCallback(
    async (bytes: number[], cfg: SpiConfig): Promise<void> => {
      if (!bytes.length) return;
      // 与 SPIMasterTab 一致：把全部参数通过 spread 传入；ch347_spi_write 类型上不识别 byteOrder
      // 但实际后端会读取（与 SPIMasterTab 行为对齐），所以这里用 cfg 整体 spread 而非显式列出
      const params = {
        mode: cfg.mode,
        speedMhz: Math.max(1, Math.round(cfg.frequencyHz / 1_000_000)),
        // CS 已在整段显示事务开始时通过 SetChipSelect 拉低。这里保持 bit7=0，禁止
        // CH347SPI_Write 在命令/数据及像素分块边界再次操作 CS，避免 RAMWR 流中断。
        cs: 0,
        dataBits: cfg.dataBits,
        byteOrder: cfg.byteOrder,
      };
      // CS 已由调用方在最后一次 GPIO/DC 操作之后手动拉低。
      await enqueue(() =>
        invokeCommand('ch347_spi_write', { index: deviceIndex, txData: bytes, ...params })
      );
    },
    [deviceIndex, enqueue]
  );

  /**
   * 执行命令表 —— 显示屏初始化的核心入口。
   *
   * 行为：
   *   1. 自动确保 SPI 已 init
   *   2. 拉低 CS（保持整个序列内 CS 持续低电平）
   *   3. 按行执行：cmd → DC低 + 写字节；data → DC高 + 写字节；delay → setTimeout；
   *      cs → 设当前所选 CS 电平；dc → 设 DC 电平；rst → 设 RST 电平
   *   4. 结束拉高 CS
   *
   * 所有 setDc/setRst/writeBytes 经 enqueue 串行队列下发，确保 DC 切换完成后再发数据，
   * 避免命令/数据混淆导致乱码。中途任何错误都会 log，并尝试在 finally 恢复 CS=HIGH。
   *
   * @param rows 命令表行
   * @param cfg SPI 配置
   * @returns 是否全部成功
   */
  const runCommandTable = useCallback(
    async (rows: DisplayCommandRow[], cfg: SpiConfig): Promise<boolean> => {
      if (!connected) {
        log('Not connected', true);
        return false;
      }
      if (!rows.length) {
        log('Command table is empty', true);
        return false;
      }
      if (!(await ensureConfigured(cfg))) return false;

      // 暂停 sharedDevice 轮询，避免 ch347_list_devices 与下面的 SPI 写并发访问
      // CH347 DLL（DLL 非线程安全，并发会导致设备断开 + 吞吐被拖慢）。finally 里恢复。
      await sharedDevice.pausePolling();
      let ok = true;
      let csSessionReady = false;
      // 记录命令表最近设置的 RGB 地址窗口。CH347F 的 SPI OUT 单包实际可用数据
      // 小于 512 字节；fill 时据此把大块显存写拆为 <=480B 的独立小窗口，
      // 每块重新发送 CASET/RASET/RAMWR，避免只写入第一条边。
      let pendingCommand: number | null = null;
      let windowX1: number | null = null;
      let windowX2: number | null = null;
      let windowY1: number | null = null;
      let windowY2: number | null = null;
      try {
        try {
          await setCs(0, cfg.cs); // CS LOW — 整个序列保持低电平
        } catch {
          // 快速重插时 connected 可能来不及呈现 false，configuredRef 仍是旧会话状态。
          // 片选操作是最先暴露失效句柄的位置；重新初始化一次后再继续命令表。
          configuredRef.current = false;
          log(`CS${cfg.cs} 会话状态已失效，正在重新建立 SPI 会话`);
          if (!(await initSpi(cfg))) {
            throw new Error('SPI 会话恢复未完成');
          }
          await setCs(0, cfg.cs);
        }
        csSessionReady = true;
        log(
          `CS${cfg.cs}: LOW (初始化序列开始；分块写期间 CS 由软件持续保持，SPI Write 不再切换片选)`
        );
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          try {
            if (row.type === 'cmd') {
              const bytes = parseHex(row.data);
              if (!bytes.length) {
                log(`#${i + 1} cmd: empty data, skipped`, true);
                continue;
              }
              await setDc(0);
              await writeBytes(bytes, cfg);
              pendingCommand = bytes.length === 1 ? bytes[0] : null;
            } else if (row.type === 'data') {
              const bytes = parseHex(row.data);
              if (!bytes.length) {
                log(`#${i + 1} data: empty data, skipped`, true);
                continue;
              }
              await setDc(1);
              await writeBytes(bytes, cfg);
              if (bytes.length >= 4 && pendingCommand === 0x2a) {
                windowX1 = (bytes[0] << 8) | bytes[1];
                windowX2 = (bytes[2] << 8) | bytes[3];
              } else if (bytes.length >= 4 && pendingCommand === 0x2b) {
                windowY1 = (bytes[0] << 8) | bytes[1];
                windowY2 = (bytes[2] << 8) | bytes[3];
              }
              pendingCommand = null;
            } else if (row.type === 'delay') {
              const us = parseInt(row.data, 10) || 0;
              if (us > 0) await new Promise((r) => setTimeout(r, Math.max(1, us / 1000)));
            } else if (row.type === 'cs') {
              // 手动控制固定的 CS0。配合 delay 行可保持电平，
              // 例如 cs LOW -> delay 10000000 -> cs HIGH，便于万用表/示波器测量。
              const level = String(row.data).toUpperCase() === 'HIGH' ? 1 : 0;
              await setCs(level, cfg.cs);
              log(`#${i + 1} cs: CS${cfg.cs} ${level === 1 ? 'HIGH (无效)' : 'LOW (有效)'}`);
            } else if (row.type === 'dc') {
              // 显式设 DC(GPIO4) 电平：LOW=命令模式, HIGH=数据模式
              // 大小写不敏感比较；非法值按 LOW 处理
              const level = String(row.data).toUpperCase() === 'HIGH' ? 1 : 0;
              await setDc(level);
              log(`#${i + 1} dc: ${level === 1 ? 'HIGH (数据)' : 'LOW (命令)'}`);
            } else if (row.type === 'bl') {
              // 设背光 PWM(GPIO6) 电平：LOW=背光关, HIGH=背光常亮
              const level = String(row.data).toUpperCase() === 'HIGH' ? 1 : 0;
              await setBl(level);
              log(`#${i + 1} bl: ${level === 1 ? 'HIGH (on)' : 'LOW (off)'}`);
            } else if (row.type === 'fill') {
              // 用指定颜色填充 N 个像素（RGB 屏整屏点亮）。格式："<颜色字节hex> <像素数>"
              // 例如 "F8 00 153600" = 红色填 320x480。前置需已发 RAMWR(0x2C) 进入显存写入态。
              const parts = String(row.data).trim().split(/\s+/);
              const count = parseInt(parts[parts.length - 1] ?? '', 10) || 0;
              const colorBytes = parseHex(parts.slice(0, -1).join(' '));
              if (!colorBytes.length || count <= 0) {
                log(
                  `#${i + 1} fill: invalid data "${row.data}", expected "<colorHex> <pixelCount>"`,
                  true
                );
                continue;
              }
              log(`#${i + 1} fill: ${count} pixels ...`);
              const window =
                windowX1 !== null && windowX2 !== null && windowY1 !== null && windowY2 !== null
                  ? { x1: windowX1, x2: windowX2, y1: windowY1, y2: windowY2 }
                  : null;
              const windowWidth = window ? window.x2 - window.x1 + 1 : 0;
              const windowHeight = window ? window.y2 - window.y1 + 1 : 0;
              const windowPixels = windowWidth * windowHeight;

              if (window && windowWidth > 0 && windowHeight > 0 && windowPixels === count) {
                // CH347 的 SPI OUT USB 包含 3B 头，实测/开源驱动均不把 512B
                // 全部留给负载。每个独立 RAMWR 事务限制为最多 480B。
                const maxPixelsPerTile = Math.max(1, Math.floor(480 / colorBytes.length));
                const tileRows =
                  windowWidth <= maxPixelsPerTile
                    ? Math.max(1, Math.floor(maxPixelsPerTile / windowWidth))
                    : 1;
                const tileCount =
                  Math.ceil(windowHeight / tileRows) * Math.ceil(windowWidth / maxPixelsPerTile);
                log(
                  `#${i + 1} fill: tiled RAMWR ${tileCount} blocks (<=480B each, window ${windowWidth}×${windowHeight})`
                );
                let completed = 0;
                let lastProgress = 0;
                for (let rowOffset = 0; rowOffset < windowHeight; ) {
                  const tileHeight =
                    windowWidth <= maxPixelsPerTile
                      ? Math.min(
                          windowHeight - rowOffset,
                          Math.max(1, Math.floor(maxPixelsPerTile / windowWidth))
                        )
                      : 1;
                  for (let colOffset = 0; colOffset < windowWidth; colOffset += maxPixelsPerTile) {
                    const tileWidth = Math.min(maxPixelsPerTile, windowWidth - colOffset);
                    const tilePixels = tileWidth * tileHeight;
                    const x1 = window.x1 + colOffset;
                    const x2 = x1 + tileWidth - 1;
                    const y1 = window.y1 + rowOffset;
                    const y2 = y1 + tileHeight - 1;

                    await setDc(0);
                    await writeBytes([0x2a], cfg);
                    await setDc(1);
                    await writeBytes(
                      [(x1 >> 8) & 0xff, x1 & 0xff, (x2 >> 8) & 0xff, x2 & 0xff],
                      cfg
                    );
                    await setDc(0);
                    await writeBytes([0x2b], cfg);
                    await setDc(1);
                    await writeBytes(
                      [(y1 >> 8) & 0xff, y1 & 0xff, (y2 >> 8) & 0xff, y2 & 0xff],
                      cfg
                    );
                    await setDc(0);
                    await writeBytes([0x2c], cfg);
                    await setDc(1);
                    await enqueue(() =>
                      invokeCommand('ch347_spi_fill', {
                        index: deviceIndex,
                        color: colorBytes,
                        pixelCount: tilePixels,
                        cs: cfg.cs & 0x03,
                      })
                    );

                    completed += tilePixels;
                    const progress = Math.floor((completed * 10) / count) * 10;
                    if (progress >= lastProgress + 10 || completed === count) {
                      lastProgress = Math.min(100, progress);
                      log(
                        `#${i + 1} fill: ${lastProgress}% (${Math.min(completed, count)}/${count})`
                      );
                    }
                  }
                  rowOffset += tileHeight;
                }
              } else {
                log(
                  `#${i + 1} fill: address window unavailable/mismatch; using continuous fallback`,
                  true
                );
                await setDc(1);
                await enqueue(() =>
                  invokeCommand('ch347_spi_fill', {
                    index: deviceIndex,
                    color: colorBytes,
                    pixelCount: count,
                    cs: cfg.cs & 0x03,
                  })
                );
                log(`#${i + 1} fill: 100% (${count}/${count})`);
              }
              log(`#${i + 1} fill: done (${count} pixels)`);
            } else if (row.type === 'rst') {
              // 显式设 RST(GPIO5) 电平：LOW=复位中, HIGH=正常运行
              // 复位通常需配合 delay 行：rst LOW → delay → rst HIGH
              const level = String(row.data).toUpperCase() === 'HIGH' ? 1 : 0;
              await setRst(level);
              log(`#${i + 1} rst: ${level === 1 ? 'HIGH (运行)' : 'LOW (复位)'}`);
            }
          } catch (e) {
            ok = false;
            log(`#${i + 1} ${row.type} error: ${(e as Error).message}`, true);
            break;
          }
        }
      } catch (e) {
        ok = false;
        log(`初始化序列启动失败: ${(e as Error).message}`, true);
      } finally {
        if (csSessionReady) {
          try {
            await setCs(1, cfg.cs);
            log(`CS${cfg.cs}: HIGH (初始化序列结束)`);
          } catch (e) {
            configuredRef.current = false;
            log(`CS${cfg.cs} 恢复 HIGH 失败: ${(e as Error).message}`, true);
          }
          try {
            const gpio = await invokeCommand('ch347_gpio_get', { index: deviceIndex });
            log(
              `GPIO 读回: DIR=0x${gpio.direction.toString(16).padStart(2, '0')}, ` +
                `DATA=0x${gpio.data.toString(16).padStart(2, '0')} ` +
                `(GPIO4/DC=${(gpio.data & 0x10) !== 0 ? 'H' : 'L'}, ` +
                `GPIO5/RST=${(gpio.data & 0x20) !== 0 ? 'H' : 'L'}, ` +
                `GPIO6/BLK=${(gpio.data & 0x40) !== 0 ? 'H' : 'L'})`
            );
          } catch (e) {
            log(`GPIO 读回失败: ${(e as Error).message}`, true);
          }
        }
        sharedDevice.resumePolling();
      }
      if (ok) log(`Command table executed: ${rows.length} rows`);
      return ok;
    },
    [
      connected,
      deviceIndex,
      enqueue,
      ensureConfigured,
      initSpi,
      setCs,
      setDc,
      setRst,
      setBl,
      writeBytes,
      log,
    ]
  );

  /**
   * 显存推送：把一帧像素字节按 page-row 写到 SSD1306 显存。
   *
   * 复刻 SPITool SPIMasterTab 验证过能点亮 SSD1306 的 OLED 写入模式，并修复重复发送
   * 时屏幕闪烁 + 文字上下移动/重叠的 bug：
   *   - Page Addressing 模式（SSD1306 复位默认就是 page 模式，init 序列亦未改它，故不发 0x20）
   *   - 写显存期间【不关显示】：SSD1306 在显示开启时直接写 GDDRAM 是标准用法（参考
   *     spi_oled.c / SPIMasterTab 均不关显示）。之前每帧发 AE(关)→写→AF(开) 才是闪烁根因。
   *   - 每页的 3 条地址命令（设 page / 列低 / 列高）合并为【一次】DC=0 的写：三者都是
   *     SSD1306 单字节命令，DC 持续拉低时按命令流连续解析，合并完全安全。合并把每页命令
   *     事务从 3 次降到 1 次 —— 之前逐条单字节命令在连续发送时易被 CH347 USB 管线丢包，
   *     一旦 page 设置命令丢失，该页数据会顺着上一页的列指针写入 → 文字上下错位、与上一帧
   *     内容重叠（正是"重复发送出现上下移动/重叠"的现象）。
   *   - page 数据按 64 字节分块写（避免 CH347 单次过大丢包，沿用 init 命令表实测的分块大小）
   *   - 整帧写入用 CS 低→高 包裹（与 SPIMasterTab 验证过的序列一致，写完让总线回空闲态）
   *
   * @param pageBytes  长度 = width × pageCount 的 page-major 字节数组（每 page = width 字节）
   * @param width      帧宽，通常 128
   * @param pageCount  page 数，SSD1306 全屏 = 8
   * @param cfg        SPI 配置
   * @param colStart   起始列（默认 0）
   */
  const pushFramebuffer = useCallback(
    async (
      pageBytes: number[],
      width: number,
      pageCount: number,
      cfg: SpiConfig,
      colStart = 0,
      options: SpiTransferOptions = {}
    ): Promise<boolean> => {
      if (!connected) {
        log('Not connected', true);
        return false;
      }
      if (pageBytes.length !== width * pageCount) {
        log(`Frame size mismatch: expected ${width * pageCount}, got ${pageBytes.length}`, true);
        return false;
      }
      if (!(await ensureConfigured(cfg))) return false;

      const startedAt = performance.now();
      let sentBytes = 0;
      const reportProgress = () =>
        options.onProgress?.({
          sentBytes,
          totalBytes: pageBytes.length,
          elapsedMs: performance.now() - startedAt,
        });
      reportProgress();

      /** 写一帧到 SSD1306 显存（Page Addressing 模式，逐页设地址 + 64 字节分块写数据） */
      const writeFrame = async () => {
        for (let p = 0; p < pageCount; p++) {
          if (transferCancelled(options.signal)) return false;
          // 设 page + 列地址：3 条单字节命令合并为一次 DC=0 的写，减少事务数避免丢包。
          // 丢失 page 设置会导致该页数据写到上一页 → 文字上下错位 + 与上一帧重叠。
          await setDc(0);
          await setCs(0, cfg.cs);
          await writeBytes(
            [
              0xb0 | p, // 设 page 地址
              colStart & 0x0f, // 列低 4 位
              0x10 | ((colStart >> 4) & 0x0f), // 列高 4 位
            ],
            cfg
          );
          // 写本 page 的 width 字节数据（DC=1）。按 64 字节分块写，避免 CH347 单次过大丢包。
          await setDc(1);
          await setCs(0, cfg.cs);
          const pageData = pageBytes.slice(p * width, (p + 1) * width);
          const CHUNK = 64;
          for (let off = 0; off < pageData.length; off += CHUNK) {
            if (transferCancelled(options.signal)) return false;
            const chunk = pageData.slice(off, Math.min(off + CHUNK, pageData.length));
            await writeBytes(chunk, cfg);
            sentBytes += chunk.length;
            reportProgress();
          }
        }
        return true;
      };

      try {
        // 整帧写入期间保持 CS 拉低（与 SPIMasterTab 验证过的 OLED 写入序列一致），
        // 写完在 finally 恢复 CS 高，让总线回到空闲态。
        // 全程不关/开显示：SSD1306 在显示开启时写 GDDRAM 不会撕裂，每帧 AE/AF 切换才是闪烁根因。
        await sharedDevice.pausePolling();
        await setCs(0, cfg.cs);
        const completed = await writeFrame();
        if (!completed || transferCancelled(options.signal)) {
          if (!options.silent) log('Framebuffer transmission cancelled');
          return false;
        }
        if (!options.silent) {
          log(`Framebuffer pushed: ${width}×${pageCount * 8} (${pageBytes.length}B)`);
        }
        return true;
      } catch (e) {
        log(`pushFramebuffer error: ${(e as Error).message}`, true);
        return false;
      } finally {
        try {
          await setCs(1, cfg.cs);
        } catch {
          /* ignore */
        }
        sharedDevice.resumePolling();
      }
    },
    [connected, ensureConfigured, setCs, setDc, writeBytes, log]
  );

  /**
   * RGB565 区域推送（用于 ST7796、ST7789V 等 RGB 屏，displayType === 'rgb565'）。
   *
   * 把区域切成不超过 480B 的独立小窗口；每块均发送 CASET/RASET -> RAMWR -> RGB565。
   * 这样不依赖 CH347 DLL 在多个 USB 块之间保持一条连续 RAMWR 像素流。
   * 只推 (x,y,w,h) 这块小区域，避开整屏慢推。rgbBytes 的像素字节序由屏幕预设决定，
   * 长度必须 = w*h*2；x/y 已包含对应面板的 GRAM 地址偏移。
   */
  const pushRgbRegion = useCallback(
    async (
      rgbBytes: number[],
      x: number,
      y: number,
      w: number,
      h: number,
      cfg: SpiConfig,
      options: SpiTransferOptions = {}
    ): Promise<boolean> => {
      if (!connected) {
        log('Not connected', true);
        return false;
      }
      if (w <= 0 || h <= 0) {
        log('Empty RGB region', true);
        return false;
      }
      if (rgbBytes.length !== w * h * 2) {
        log(`RGB size mismatch: expected ${w * h * 2}, got ${rgbBytes.length}`, true);
        return false;
      }
      if (!(await ensureConfigured(cfg))) return false;

      // 整个区域事务开始时手动拉低 CS；每个小窗口的数据不超过 480B，因此一次
      // CH347SPI_Write 就能可靠发完，不再依赖 DLL 对大缓冲区的内部分块语义。
      const csCode = cfg.cs & 0x03;
      const maxPixelsPerTile = 240; // RGB565: 240 × 2 = 480B < CH347 SPI OUT 有效载荷
      const startedAt = performance.now();
      let sentBytes = 0;
      const reportProgress = () =>
        options.onProgress?.({
          sentBytes,
          totalBytes: rgbBytes.length,
          elapsedMs: performance.now() - startedAt,
        });
      reportProgress();
      try {
        await sharedDevice.pausePolling();
        await setCs(0, cfg.cs);
        for (let rowOffset = 0; rowOffset < h; ) {
          const tileHeight =
            w <= maxPixelsPerTile
              ? Math.min(h - rowOffset, Math.max(1, Math.floor(maxPixelsPerTile / w)))
              : 1;

          for (let colOffset = 0; colOffset < w; colOffset += maxPixelsPerTile) {
            if (transferCancelled(options.signal)) {
              if (!options.silent) log('RGB transmission cancelled');
              return false;
            }
            const tileWidth = Math.min(maxPixelsPerTile, w - colOffset);
            const x1 = x + colOffset;
            const x2 = x1 + tileWidth - 1;
            const y1 = y + rowOffset;
            const y2 = y1 + tileHeight - 1;
            const tileData: number[] = [];

            for (let tileRow = 0; tileRow < tileHeight; tileRow++) {
              const sourceStart = ((rowOffset + tileRow) * w + colOffset) * 2;
              tileData.push(...rgbBytes.slice(sourceStart, sourceStart + tileWidth * 2));
            }

            // CASET (列地址)
            await setDc(0);
            await writeBytes([0x2a], cfg);
            await setDc(1);
            await writeBytes([(x1 >> 8) & 0xff, x1 & 0xff, (x2 >> 8) & 0xff, x2 & 0xff], cfg);
            // RASET (行地址)
            await setDc(0);
            await writeBytes([0x2b], cfg);
            await setDc(1);
            await writeBytes([(y1 >> 8) & 0xff, y1 & 0xff, (y2 >> 8) & 0xff, y2 & 0xff], cfg);
            // RAMWR (内存写) -> 本小窗口像素数据
            await setDc(0);
            await writeBytes([0x2c], cfg);
            await setDc(1);
            await enqueue(() =>
              invokeCommand('ch347_spi_write_buffer', {
                index: deviceIndex,
                data: tileData,
                cs: csCode,
              })
            );
            sentBytes += tileData.length;
            reportProgress();
          }

          rowOffset += tileHeight;
        }
        if (!options.silent) {
          log(`RGB region pushed: ${w}×${h} @ (${x},${y}) (${rgbBytes.length}B)`);
        }
        return true;
      } catch (e) {
        log(`pushRgbRegion error: ${(e as Error).message}`, true);
        return false;
      } finally {
        try {
          await setCs(1, cfg.cs);
        } catch {
          /* ignore */
        }
        sharedDevice.resumePolling();
      }
    },
    [connected, deviceIndex, enqueue, ensureConfigured, setCs, setDc, writeBytes, log]
  );

  return {
    // 状态
    csLevel,
    // 命令式 API
    initSpi,
    markUnconfigured,
    setCs,
    setDc,
    setRst,
    setBl,
    hardReset,
    writeBytes,
    runCommandTable,
    pushFramebuffer,
    pushRgbRegion,
  };
}
