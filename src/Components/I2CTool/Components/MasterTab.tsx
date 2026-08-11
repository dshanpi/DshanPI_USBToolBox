import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invokeCommand } from '../../../Platform/IPC';
import type { SlaveEmulator } from '../lib/SlaveEmulator';
import { parseSpeedKhz } from '../lib/i2cUtils';
import { AdvancedPanel, type I2cAssistantWorkflowRow } from './AdvancedPanel';
import {
  asRecord,
  optionalBoolean,
  optionalNumber,
  optionalString,
  registerAssistantContributor,
} from '../../AIAssistant/assistantBridge';

interface MasterTabProps {
  emulatorRef: React.MutableRefObject<SlaveEmulator | null>;
  slaveEnabled: boolean;
  slaveAddr: number;
  deviceOnline: boolean;
  deviceIndex: number;
}

interface LogEntry {
  time: string;
  message: string;
  isError: boolean;
}

function parseHex(str: string, bits: number): number {
  let s = str.trim();
  if (s.toLowerCase().startsWith('0x')) s = s.slice(2);
  const val = parseInt(s, 16);
  if (isNaN(val)) throw new Error(`Invalid hex: ${str}`);
  return val & ((1 << bits) - 1);
}

function parseWriteData(str: string): number[] {
  const cleaned = str.trim();
  if (!cleaned) return [];
  return cleaned.split(/[\s,]+/).map((part) => {
    let p = part.trim();
    if (p.toLowerCase().startsWith('0x')) p = p.slice(2);
    const val = parseInt(p, 16);
    if (isNaN(val)) throw new Error(`Invalid byte: ${part}`);
    return val & 0xff;
  });
}

function formatTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

export const MasterTab: React.FC<MasterTabProps> = ({
  emulatorRef,
  slaveEnabled,
  slaveAddr,
  deviceOnline,
  deviceIndex,
}) => {
  const { t } = useTranslation();
  const [i2cSpeed, setI2cSpeed] = useState('400 kHz');
  const [slaveAddrInput, setSlaveAddrInput] = useState('0x3C');
  const [regAddrType, setRegAddrType] = useState('8');
  const [regAddrInput, setRegAddrInput] = useState('0x00');
  const [readLen, setReadLen] = useState('16');
  const [writeData, setWriteData] = useState('48 65 6C 6C 6F');
  const [sclStretch, setSclStretch] = useState(false);
  const [delayMs, setDelayMs] = useState('0');
  const [advancedCollapsed, setAdvancedCollapsed] = useState(true);
  const [assistantWorkflowRows, setAssistantWorkflowRows] = useState<I2cAssistantWorkflowRow[]>();
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [readDataText, setReadDataText] = useState('');
  const [updateAfterRead, setUpdateAfterRead] = useState(false);
  const [writeThenRead, setWriteThenRead] = useState(false);
  // EEPROM 页写支持：填了页大小后，写操作自动按页边界拆分、每次小写后等待 writeDelayMs（tWR），
  // 避免一次写超过页大小导致地址回绕覆盖（24Cxx 系列典型页大小 8/16/32/64）。
  const [pageSize, setPageSize] = useState('1'); // 默认 1 = 逐字节写（最安全，防 EEPROM 页回绕；写传感器多字节寄存器可选「不分页」）
  const [pageSizePreset, setPageSizePreset] = useState('custom'); // 常用 EEPROM 型号速查下拉的当前值（默认 custom=逐字节）
  const [writeDelayMs, setWriteDelayMs] = useState('5'); // 默认 5ms，即 EEPROM tWR

  const [logs, setLogs] = useState<LogEntry[]>(() => [
    {
      time: '--:--:--',
      message: t('serialTool.i2c.master.ready'),
      isError: false,
    },
  ]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((message: string, isError = false) => {
    const entry: LogEntry = { time: formatTime(), message, isError };
    setLogs((prev) => {
      const next = [...prev, entry];
      if (next.length > 200) next.shift();
      return next;
    });
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 10);
  }, []);

  useEffect(() => {
    return registerAssistantContributor({
      id: 'i2c-master-config',
      tool: 'i2c-tool',
      getContext: () => ({
        deviceOnline,
        deviceIndex,
        config: {
          speed: i2cSpeed,
          slaveAddress: slaveAddrInput,
          registerAddressType: Number(regAddrType),
          registerAddress: regAddrInput,
          readLength: Number(readLen),
          writeData,
          sclStretch,
          delayMs: Number(delayMs),
          pageSize: Number(pageSize),
          writeDelayMs: Number(writeDelayMs),
          writeThenRead,
        },
        recentLogs: logs.slice(-35),
      }),
      supports: (action) =>
        action.type === 'i2c.configure' || action.type === 'i2c.workflow.replace',
      apply: (action) => {
        const payload = asRecord(action.payload);
        if (action.type === 'i2c.workflow.replace') {
          if (
            !Array.isArray(payload.rows) ||
            payload.rows.length < 1 ||
            payload.rows.length > 1000
          ) {
            throw new Error('I2C 工作流必须包含 1–1000 行');
          }
          const rows: I2cAssistantWorkflowRow[] = payload.rows.map((raw, index) => {
            const row = asRecord(raw, `rows[${index}]`);
            const type = optionalString(row.type, `rows[${index}].type`);
            if (!type || !['W', 'R', 'WR', 'G'].includes(type)) {
              throw new Error(`第 ${index + 1} 行的类型无效`);
            }
            const writeBytes = optionalString(row.writeBytes, `rows[${index}].writeBytes`) ?? '';
            const rowReadLen = optionalNumber(row.readLen, `rows[${index}].readLen`);
            const gpioPin = optionalNumber(row.gpioPin, `rows[${index}].gpioPin`);
            const gpioLevel = optionalString(row.gpioLevel, `rows[${index}].gpioLevel`);
            if ((type === 'W' || type === 'WR') && !writeBytes.trim()) {
              throw new Error(`第 ${index + 1} 行缺少写入字节`);
            }
            if (
              writeBytes &&
              !/^(?:(?:0x)?[0-9a-fA-F]{1,2})(?:[\s,]+(?:0x)?[0-9a-fA-F]{1,2})*$/.test(
                writeBytes.trim()
              )
            ) {
              throw new Error(`第 ${index + 1} 行的写入字节格式无效`);
            }
            if (
              (type === 'R' || type === 'WR') &&
              (rowReadLen === undefined ||
                !Number.isInteger(rowReadLen) ||
                rowReadLen < 1 ||
                rowReadLen > 256)
            ) {
              throw new Error(`第 ${index + 1} 行的读取长度必须在 1–256 之间`);
            }
            if (
              type === 'G' &&
              (gpioPin === undefined || !Number.isInteger(gpioPin) || gpioPin < 0 || gpioPin > 7)
            ) {
              throw new Error(`第 ${index + 1} 行的 GPIO 必须在 0–7 之间`);
            }
            if (type === 'G' && gpioLevel !== 'H' && gpioLevel !== 'L') {
              throw new Error(`第 ${index + 1} 行的 GPIO 电平必须是 H 或 L`);
            }
            return {
              type: type as I2cAssistantWorkflowRow['type'],
              writeBytes: writeBytes.trim().toUpperCase(),
              readLen: String(Math.trunc(rowReadLen ?? 1)),
              gpioPin: String(Math.trunc(gpioPin ?? 0)),
              gpioLevel: gpioLevel ?? 'L',
            };
          });
          setAssistantWorkflowRows(rows);
          setAdvancedCollapsed(false);
          addLog(`AI 助手已填入 ${rows.length} 条 I2C 工作流；尚未执行`);
          return { message: `${rows.length} 条 I2C 工作流` };
        }
        const speed = optionalString(payload.speed, 'speed');
        const address = optionalString(payload.slaveAddress, 'slaveAddress');
        const addressType = optionalNumber(payload.registerAddressType, 'registerAddressType');
        const registerAddress = optionalString(payload.registerAddress, 'registerAddress');
        const nextReadLength = optionalNumber(payload.readLength, 'readLength');
        const nextWriteData = optionalString(payload.writeData, 'writeData');
        const stretch = optionalBoolean(payload.sclStretch, 'sclStretch');
        const nextDelay = optionalNumber(payload.delayMs, 'delayMs');
        const nextPageSize = optionalNumber(payload.pageSize, 'pageSize');
        const nextWriteDelay = optionalNumber(payload.writeDelayMs, 'writeDelayMs');
        const speeds = ['20 kHz', '50 kHz', '100 kHz', '200 kHz', '400 kHz', '750 kHz', '1 MHz'];
        if (speed !== undefined && !speeds.includes(speed))
          throw new Error(`不支持的 I2C 速度：${speed}`);
        if (address !== undefined) {
          const normalized = address.trim().replace(/^0x/i, '');
          if (!/^[0-9a-fA-F]{1,2}$/.test(normalized)) throw new Error('I2C 地址格式无效');
          const value = Number.parseInt(normalized, 16);
          if (value < 0 || value > 0x7f) throw new Error('I2C 地址必须是 7 位地址');
        }
        if (addressType !== undefined && ![8, 16].includes(addressType))
          throw new Error('寄存器地址宽度必须是 8 或 16');
        if (
          nextReadLength !== undefined &&
          (!Number.isInteger(nextReadLength) || nextReadLength < 1 || nextReadLength > 4096)
        )
          throw new Error('读取长度必须在 1–4096 之间');
        if (
          nextDelay !== undefined &&
          (!Number.isInteger(nextDelay) || nextDelay < 0 || nextDelay > 60_000)
        )
          throw new Error('事务延时超出范围');
        if (
          nextPageSize !== undefined &&
          (!Number.isInteger(nextPageSize) || nextPageSize < 0 || nextPageSize > 4096)
        )
          throw new Error('页大小超出范围');
        if (
          nextWriteDelay !== undefined &&
          (!Number.isInteger(nextWriteDelay) || nextWriteDelay < 0 || nextWriteDelay > 60_000)
        )
          throw new Error('页写延时超出范围');
        if (registerAddress !== undefined) {
          const normalized = registerAddress.trim().replace(/^0x/i, '');
          const width = addressType ?? Number(regAddrType);
          const maxDigits = width === 16 ? 4 : 2;
          if (!new RegExp(`^[0-9a-fA-F]{1,${maxDigits}}$`).test(normalized)) {
            throw new Error(`寄存器地址必须是 ${width} 位十六进制地址`);
          }
        }
        if (
          nextWriteData !== undefined &&
          nextWriteData.trim() &&
          !/^(?:(?:0x)?[0-9a-fA-F]{1,2})(?:[\s,]+(?:0x)?[0-9a-fA-F]{1,2})*$/.test(
            nextWriteData.trim()
          )
        ) {
          throw new Error('写入数据必须是空格或逗号分隔的十六进制字节');
        }

        if (speed !== undefined) setI2cSpeed(speed);
        if (address !== undefined) {
          const value = Number.parseInt(address.trim().replace(/^0x/i, ''), 16);
          setSlaveAddrInput(`0x${value.toString(16).padStart(2, '0').toUpperCase()}`);
        }
        if (addressType !== undefined) setRegAddrType(String(Math.trunc(addressType)));
        if (registerAddress !== undefined) setRegAddrInput(registerAddress);
        if (nextReadLength !== undefined) setReadLen(String(Math.trunc(nextReadLength)));
        if (nextWriteData !== undefined) setWriteData(nextWriteData.trim().toUpperCase());
        if (stretch !== undefined) setSclStretch(stretch);
        if (nextDelay !== undefined) setDelayMs(String(Math.trunc(nextDelay)));
        if (nextPageSize !== undefined) {
          setPageSize(String(Math.trunc(nextPageSize)));
          setPageSizePreset('custom');
        }
        if (nextWriteDelay !== undefined) setWriteDelayMs(String(Math.trunc(nextWriteDelay)));
        setConfigCollapsed(false);
        addLog('AI 助手已填入 I2C 配置；请检查后手动读写');
        return { message: 'I2C 地址、频率与读写参数' };
      },
    });
  }, [
    addLog,
    delayMs,
    deviceIndex,
    deviceOnline,
    i2cSpeed,
    logs,
    pageSize,
    readLen,
    regAddrInput,
    regAddrType,
    sclStretch,
    slaveAddrInput,
    writeData,
    writeDelayMs,
    writeThenRead,
  ]);

  // GPIO 控制已移至 AdvancedPanel（高级功能面板，行类型 G）。
  // 原 setGpio 逻辑（ch347_gpio_set 调用）迁入 AdvancedPanel.executeRow 的 'G' 分支。

  const handleRead = useCallback(async () => {
    try {
      const addr = parseHex(slaveAddrInput, 7);
      const regAddr = parseHex(regAddrInput, regAddrType === '16' ? 16 : 8);
      const len = parseInt(readLen, 10);
      if (isNaN(len) || len < 1) throw new Error(t('serialTool.i2c.master.invalidReadLen'));

      addLog(
        t('serialTool.i2c.master.logRead', {
          addr: addr.toString(16),
          reg: regAddr.toString(16),
          bits: regAddrType,
          len,
        })
      );

      let rxData: number[] | null = null;

      // Use real hardware if connected
      if (deviceOnline) {
        // Build I2C write buffer: [slaveAddr<<1, regAddr(hi), regAddr(lo), ...]
        const writeBuf: number[] = [addr << 1];
        if (regAddrType === '16') {
          writeBuf.push((regAddr >> 8) & 0xff);
        } // high byte first
        writeBuf.push(regAddr & 0xff); // low byte
        const speedKhz = parseSpeedKhz(i2cSpeed);
        try {
          rxData = await invokeCommand('ch347_i2c_transfer', {
            index: deviceIndex,
            writeData: writeBuf,
            readLen: len,
            speedKhz,
            sclStretch: sclStretch,
            delayMs: Number(delayMs) || undefined,
          });
          addLog(t('serialTool.i2c.master.hwRead', { n: rxData.length }));
        } catch (err: unknown) {
          addLog(`${t('serialTool.i2c.master.hwError')}: ${(err as Error).message}`, true);
          return;
        }
      } else if (slaveEnabled && emulatorRef.current && slaveAddr === addr) {
        rxData = emulatorRef.current.read(regAddr, len, regAddrType === '16');
        addLog(
          t('serialTool.i2c.master.logSlaveResponse', {
            addr: slaveAddr.toString(16),
            n: rxData.length,
          })
        );
      } else {
        if (slaveEnabled)
          addLog(t('serialTool.i2c.master.logNoSlave', { addr: addr.toString(16) }), true);
        else addLog(t('serialTool.i2c.master.logSlaveDisabled'), true);
        rxData = [];
        for (let i = 0; i < len; i++) rxData.push((regAddr + i) & 0xff);
        addLog(t('serialTool.i2c.master.logPlaceholder'), true);
      }

      if (rxData?.length) {
        const hex = rxData
          .map((b) => '0x' + b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');
        setReadDataText(hex);
        // 读后更新：把读回的数据填入写入区，支持「读-改-写」流程（如 EEPROM 读出后改某字节再写回）。
        if (updateAfterRead) setWriteData(hex);
        addLog(`${t('serialTool.i2c.master.readResult')}: ${hex} (${rxData.length}B)`);
      }
    } catch (e: unknown) {
      addLog(`${t('serialTool.i2c.master.readError')}: ${(e as Error).message}`, true);
    }
  }, [
    slaveAddrInput,
    regAddrInput,
    regAddrType,
    readLen,
    i2cSpeed,
    sclStretch,
    delayMs,
    slaveEnabled,
    slaveAddr,
    emulatorRef,
    addLog,
    deviceOnline,
    deviceIndex,
    t,
    updateAfterRead,
  ]);

  const handleWrite = useCallback(async () => {
    try {
      const addr = parseHex(slaveAddrInput, 7);
      const regAddr = parseHex(regAddrInput, regAddrType === '16' ? 16 : 8);
      const bytes = parseWriteData(writeData);
      if (!bytes.length) throw new Error(t('serialTool.i2c.master.emptyWriteData'));

      addLog(
        t('serialTool.i2c.master.logWrite', {
          addr: addr.toString(16),
          reg: regAddr.toString(16),
          data: bytes.map((b) => '0x' + b.toString(16)).join(','),
        })
      );

      // Hardware path
      if (deviceOnline) {
        const speedKhz = parseSpeedKhz(i2cSpeed);
        const delayMsi2c = Number(delayMs) || undefined;

        // 页大小未填 → 单次整块写（传感器、GPIO 扩展等无页概念器件，保持原行为）
        const ps = parseInt(pageSize, 10);
        if (!pageSize || isNaN(ps) || ps <= 0) {
          const writeBuf: number[] = [addr << 1]; // slave address + write bit
          if (regAddrType === '16') {
            writeBuf.push((regAddr >> 8) & 0xff);
          }
          writeBuf.push(regAddr & 0xff);
          writeBuf.push(...bytes);
          await invokeCommand('ch347_i2c_transfer', {
            index: deviceIndex,
            writeData: writeBuf,
            readLen: 0,
            speedKhz,
            sclStretch: sclStretch,
            delayMs: delayMsi2c,
          });
          addLog(t('serialTool.i2c.master.hwWrite'));
          if (writeThenRead) {
            setTimeout(() => handleRead(), 100);
          }
          return;
        }

        // 页大小已填 → 按【页边界】拆分多次小写，每次后等 tWR，避免页写回绕覆盖。
        // CH347 单次事务缓冲上限（与 backend 一致，留余量）
        const regBytes = regAddrType === '16' ? 2 : 1;
        const MAX_BUF = 60;
        const chunk = Math.min(ps, MAX_BUF - regBytes);
        const wDelay = Math.max(0, Number(writeDelayMs) || 0);
        let off = 0;
        let chunkIdx = 0;
        while (off < bytes.length) {
          // 本块不能跨越页边界：从 reg+off 到下一个页边界为止
          const curReg = regAddr + off;
          const pageBoundary = (Math.floor(curReg / ps) + 1) * ps;
          const maxByPage = pageBoundary - curReg;
          const take = Math.min(chunk, maxByPage, bytes.length - off);
          const writeBuf: number[] = [addr << 1];
          if (regAddrType === '16') {
            writeBuf.push((curReg >> 8) & 0xff);
            writeBuf.push(curReg & 0xff);
          } else {
            writeBuf.push(curReg & 0xff);
          }
          writeBuf.push(...bytes.slice(off, off + take));
          await invokeCommand('ch347_i2c_transfer', {
            index: deviceIndex,
            writeData: writeBuf,
            readLen: 0,
            speedKhz,
            sclStretch: sclStretch,
            delayMs: delayMsi2c,
          });
          chunkIdx++;
          off += take;
          if (off < bytes.length) {
            await new Promise((r) => setTimeout(r, wDelay)); // tWR：等待芯片内部写完成
          }
        }
        addLog(
          `${t('serialTool.i2c.master.hwWrite')}${t('serialTool.i2c.master.logPageWrite', { ps, chunks: chunkIdx, delay: wDelay })}`
        );
        if (writeThenRead) {
          setTimeout(() => handleRead(), 100);
        }
        return;
      }

      // Software emulator fallback
      if (slaveEnabled && emulatorRef.current && slaveAddr === addr) {
        emulatorRef.current.write(regAddr, bytes, regAddrType === '16');
        addLog(t('serialTool.i2c.master.logSlaveReceived', { addr: slaveAddr.toString(16) }));
      } else {
        addLog(t('serialTool.i2c.master.writeDiscard'), true);
      }
    } catch (e: unknown) {
      addLog(`${t('serialTool.i2c.master.writeError')}: ${(e as Error).message}`, true);
    }
  }, [
    slaveAddrInput,
    regAddrInput,
    regAddrType,
    writeData,
    i2cSpeed,
    sclStretch,
    delayMs,
    slaveEnabled,
    slaveAddr,
    emulatorRef,
    addLog,
    deviceOnline,
    deviceIndex,
    t,
    writeThenRead,
    handleRead,
    pageSize,
    writeDelayMs,
  ]);

  const handleScan = useCallback(async () => {
    if (!deviceOnline) {
      addLog(t('serialTool.i2c.master.pleaseConnect'), true);
      return;
    }
    addLog(t('serialTool.i2c.master.scanSearching'));
    try {
      const found = await invokeCommand('ch347_i2c_scan', {
        index: deviceIndex,
        sclStretch: sclStretch,
        delayMs: Number(delayMs) || undefined,
      });
      if (found.length > 0) {
        addLog(
          t('serialTool.i2c.master.logScanFoundList', {
            count: found.length,
            addrs: found.map((a) => '0x' + a.toString(16).toUpperCase()).join(', '),
          })
        );
        // 自动把第一个扫到的地址填入从机地址输入框
        setSlaveAddrInput('0x' + found[0].toString(16).toUpperCase());
      } else {
        addLog(t('serialTool.i2c.master.scanNone'), true);
      }
    } catch (err: unknown) {
      addLog(`${t('serialTool.i2c.master.scanError')}: ${(err as Error).message}`, true);
    }
  }, [deviceOnline, deviceIndex, sclStretch, delayMs, addLog, setSlaveAddrInput, t]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [logFontSize, setLogFontSize] = useState(12);
  const savedSelectionRef = useRef('');

  // 暂存被清空的日志条目（保留 isError 标志）；还原时前置于当前日志，避免覆盖清屏后新产生的日志。
  const [clearedLogs, setClearedLogs] = useState<LogEntry[]>([]);

  const handleClear = useCallback(() => {
    setClearedLogs(logs);
    setLogs([]);
    addLog(t('serialTool.i2c.master.logCleared'));
  }, [addLog, logs, t]);

  const handleRestore = useCallback(() => {
    setLogs((prev) => [...clearedLogs, ...prev]);
    setClearedLogs([]);
  }, [clearedLogs]);

  const handleSaveLog = useCallback(async () => {
    const text = logs.map((e) => `[${e.time}] ${e.message}`).join('\n');
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `I2C_Log_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.txt`;
      const path = await save({
        defaultPath: name,
        filters: [{ name: 'Text', extensions: ['txt', 'log'] }],
      });
      if (path) await writeTextFile(path, text);
    } catch {
      /* dialog cancelled */
    }
  }, [logs]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    savedSelectionRef.current = sel?.toString() || '';
    setContextMenu({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  }, []);

  const handleLogCopy = useCallback(async () => {
    setContextMenu(null);
    const text = savedSelectionRef.current || window.getSelection()?.toString() || '';
    if (text) await navigator.clipboard.writeText(text);
  }, []);

  const handleLogPaste = useCallback(async () => {
    setContextMenu(null);
    try {
      const text = await navigator.clipboard.readText();
      if (text) addLog(t('serialTool.i2c.master.logPasted', { text }));
    } catch {
      /* clipboard denied */
    }
  }, [addLog, t]);

  const changeLogFont = useCallback((delta: number) => {
    setLogFontSize((prev) => Math.max(8, Math.min(24, prev + delta)));
  }, []);

  const handleLogWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        changeLogFont(e.deltaY < 0 ? 1 : -1);
      }
    },
    [changeLogFont]
  );

  const logText = logs.map((e) => `[${e.time}] ${e.message}`).join('\n');

  return (
    <div className="i2c-master-layout">
      {/* Middle section: Transmission Log (left) + Advanced Panel (right) */}
      <div className="i2c-master-middle">
        <div className={`i2c-master-log-section${advancedCollapsed ? ' i2c-log-full' : ''}`}>
          <div className="i2c-log-area">
            <div className="i2c-log-title">
              <span className="status-led active" />
              {t('serialTool.i2c.master.log')}
              <div className="i2c-log-actions">
                <button
                  className="serial-action-btn"
                  onClick={handleSaveLog}
                  title={t('serialTool.contextMenu.saveLog')}
                >
                  {t('serialTool.contextMenu.saveLog')}
                </button>
                <button className="serial-action-btn" onClick={handleClear}>
                  {t('serialTool.monitor.clear')}
                </button>
                {clearedLogs.length > 0 && (
                  <button
                    className="serial-action-btn"
                    onClick={handleRestore}
                    title={t('serialTool.monitor.restore')}
                  >
                    {t('serialTool.monitor.restore')}
                  </button>
                )}
              </div>
            </div>
            <div
              className="i2c-log-list i2c-log-interactive"
              onContextMenu={handleContextMenu}
              onWheel={handleLogWheel}
              onClick={() => setContextMenu(null)}
            >
              <pre className="i2c-log-pre" style={{ fontSize: logFontSize }}>
                {logText || t('serialTool.i2c.master.ready')}
              </pre>
              <div ref={logEndRef} />
              {contextMenu && (
                <div
                  className="serial-context-menu"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                  <button className="context-menu-item" onClick={handleLogCopy}>
                    {t('serialTool.i2c.master.copy')}
                  </button>
                  <button className="context-menu-item" onClick={handleLogPaste}>
                    {t('serialTool.i2c.master.paste')}
                  </button>
                  <div className="context-menu-sep" />
                  <button
                    className="context-menu-item"
                    onClick={() => {
                      setContextMenu(null);
                      changeLogFont(1);
                    }}
                  >
                    {t('serialTool.i2c.master.fontIncrease')}
                  </button>
                  <button
                    className="context-menu-item"
                    onClick={() => {
                      setContextMenu(null);
                      changeLogFont(-1);
                    }}
                  >
                    {t('serialTool.i2c.master.fontDecrease')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {advancedCollapsed ? (
          <div
            className="i2c-master-advanced-collapsed"
            onClick={() => setAdvancedCollapsed(false)}
            title={t('serialTool.i2c.advanced.title')}
          >
            <span
              className="i2c-advanced-arrow"
              style={{ display: 'block', textAlign: 'center', fontSize: 14, marginBottom: 4 }}
            >
              &#9654;
            </span>
            <span className="i2c-advanced-toggle">{t('serialTool.i2c.advanced.title')}</span>
          </div>
        ) : (
          <div className="i2c-master-advanced-section">
            <AdvancedPanel
              deviceOnline={deviceOnline}
              deviceIndex={deviceIndex}
              slaveAddrInput={slaveAddrInput}
              regAddrType={regAddrType}
              i2cSpeed={i2cSpeed}
              sclStretch={sclStretch}
              delayMs={delayMs}
              emulatorRef={emulatorRef}
              slaveEnabled={slaveEnabled}
              slaveAddr={slaveAddr}
              addLog={addLog}
              onToggleCollapsed={() => setAdvancedCollapsed(true)}
              assistantRows={assistantWorkflowRows}
              onAssistantRowsApplied={() => setAssistantWorkflowRows(undefined)}
            />
          </div>
        )}
      </div>

      {/* Bottom: Master controller configuration (collapsible) */}
      <div className={`i2c-master-config ${configCollapsed ? 'collapsed' : ''}`}>
        {configCollapsed ? (
          <button
            className="i2c-config-collapse-btn"
            onClick={() => setConfigCollapsed(false)}
            title={t('serialTool.i2c.master.expandConfig')}
          >
            &#9650;
          </button>
        ) : (
          <>
            <div className="i2c-master-config-header">
              <span>{t('serialTool.i2c.master.title')}</span>
              <button
                className="i2c-config-collapse-btn"
                onClick={() => setConfigCollapsed(true)}
                title={t('serialTool.i2c.master.collapseConfig')}
              >
                &#9660;
              </button>
            </div>
            <div className="i2c-master-config-body">
              <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                {/* Left: Register */}
                <div
                  style={{
                    width: 140,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '8px 10px',
                    border: '1px solid var(--color-surface0)',
                    borderRadius: 8,
                  }}
                >
                  <label className="config-label" style={{ marginBottom: -4 }}>
                    {t('serialTool.i2c.master.register')}
                  </label>
                  <div className="config-group">
                    <label className="config-label">{t('serialTool.i2c.master.slaveAddr')}</label>
                    <input
                      className="config-select"
                      type="text"
                      value={slaveAddrInput}
                      onChange={(e) => setSlaveAddrInput(e.target.value)}
                      placeholder="0x3C"
                    />
                  </div>
                  <div className="config-group">
                    <label className="config-label">{t('serialTool.i2c.master.regAddrType')}</label>
                    <select
                      className="config-select"
                      value={regAddrType}
                      onChange={(e) => setRegAddrType(e.target.value)}
                    >
                      <option value="8">{t('serialTool.i2c.master.bit8')}</option>
                      <option value="16">{t('serialTool.i2c.master.bit16')}</option>
                    </select>
                  </div>
                  <div className="config-group">
                    <label className="config-label">{t('serialTool.i2c.master.regAddr')}</label>
                    <input
                      className="config-select"
                      type="text"
                      value={regAddrInput}
                      onChange={(e) => setRegAddrInput(e.target.value)}
                      placeholder="0x00"
                    />
                  </div>
                </div>

                {/* Center: Config (top) + Data (bottom) */}
                <div
                  style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {/* Config */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: '8px 10px',
                      border: '1px solid var(--color-surface0)',
                      borderRadius: 8,
                    }}
                  >
                    <label className="config-label" style={{ marginBottom: 0 }}>
                      {t('serialTool.i2c.master.config')}
                    </label>
                    <div
                      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
                    >
                      <div className="config-group">
                        <label className="config-label">
                          {t('serialTool.i2c.master.i2cSpeed')}
                        </label>
                        <select
                          className="config-select"
                          value={i2cSpeed}
                          onChange={(e) => setI2cSpeed(e.target.value)}
                        >
                          <option value="20 kHz">20 kHz</option>
                          <option value="50 kHz">50 kHz</option>
                          <option value="100 kHz">100 kHz</option>
                          <option value="200 kHz">200 kHz</option>
                          <option value="400 kHz">400 kHz</option>
                          <option value="750 kHz">750 kHz</option>
                          <option value="1 MHz">1 MHz</option>
                        </select>
                      </div>
                      <div className="config-group">
                        <label className="config-label">
                          {t('serialTool.i2c.master.sclStretch')}
                        </label>
                        <select
                          className="config-select"
                          value={sclStretch ? '1' : '0'}
                          onChange={(e) => setSclStretch(e.target.value === '1')}
                        >
                          <option value="0">{t('serialTool.i2c.master.disable')}</option>
                          <option value="1">{t('serialTool.i2c.master.enable')}</option>
                        </select>
                      </div>
                      <div className="config-group">
                        <label className="config-label">{t('serialTool.i2c.master.delay')}</label>
                        <input
                          className="config-select"
                          type="number"
                          value={delayMs}
                          onChange={(e) => setDelayMs(e.target.value)}
                          min={0}
                          max={1000}
                          style={{ width: 70 }}
                        />
                      </div>
                      <div className="config-group config-connect">
                        <label className="config-label">&nbsp;</label>
                        <button className="i2c-btn" onClick={handleScan} disabled={!deviceOnline}>
                          {t('serialTool.i2c.master.scan')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Data */}
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: '8px 10px',
                      border: '1px solid var(--color-surface0)',
                      borderRadius: 8,
                    }}
                  >
                    <label className="config-label">
                      {readDataText
                        ? t('serialTool.i2c.master.readDataResult')
                        : t('serialTool.i2c.master.writeDataHex')}
                    </label>
                    <textarea
                      className="i2c-textarea"
                      rows={3}
                      value={readDataText || writeData}
                      onChange={(e) => {
                        setWriteData(e.target.value);
                        setReadDataText('');
                      }}
                      placeholder="01 A5 3C FF"
                      style={{ flex: 1 }}
                    />
                    {/* EEPROM 页写选项：填页大小后，写操作自动按页边界拆分 + 每次 tWR 延时，避免页回绕覆盖 */}
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        fontSize: 11,
                      }}
                    >
                      <div className="config-group" style={{ margin: 0 }}>
                        <label className="config-label">
                          {t('serialTool.i2c.master.pageSize')}
                        </label>
                        <input
                          className="config-select"
                          type="number"
                          value={pageSize}
                          onChange={(e) => setPageSize(e.target.value)}
                          min={1}
                          max={256}
                          placeholder={t('serialTool.i2c.master.pageSizePlaceholder')}
                          style={{ width: 140 }}
                          title={t('serialTool.i2c.master.pageSizeTitle')}
                        />
                      </div>
                      <div className="config-group" style={{ margin: 0 }}>
                        <label className="config-label">
                          {t('serialTool.i2c.master.chipPreset')}
                        </label>
                        <select
                          className="config-select"
                          value={pageSizePreset}
                          style={{ width: 150 }}
                          onChange={(e) => {
                            setPageSizePreset(e.target.value);
                            // 选「自定义」保留当前值；选「不分页」清空；其余自动填入页大小
                            if (e.target.value === 'custom' || e.target.value === '') return;
                            if (e.target.value === 'none') {
                              setPageSize('');
                              return;
                            }
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v)) setPageSize(String(v));
                          }}
                          title={t('serialTool.i2c.master.chipPresetTitle')}
                        >
                          <option value="">
                            {t('serialTool.i2c.master.chipSelectPlaceholder')}
                          </option>
                          <option value="none">{t('serialTool.i2c.master.chipNone')}</option>
                          <option value="8">24C02 / 24C04 (8B)</option>
                          <option value="16">24C16 / 24C32 / 24C64 (16B)</option>
                          <option value="32">24C128 / 24C256 (32B)</option>
                          <option value="64">24C512 / 24C1024 (64B)</option>
                          <option value="custom">{t('serialTool.i2c.master.chipCustom')}</option>
                        </select>
                      </div>
                      <div className="config-group" style={{ margin: 0 }}>
                        <label className="config-label">
                          {t('serialTool.i2c.master.writeDelay')}
                        </label>
                        <input
                          className="config-select"
                          type="number"
                          value={writeDelayMs}
                          onChange={(e) => setWriteDelayMs(e.target.value)}
                          min={0}
                          max={50}
                          style={{ width: 60 }}
                          title={t('serialTool.i2c.master.writeDelayTitle')}
                        />
                      </div>
                      {/* 分页状态说明见上方「页大小」输入框的 title 提示（hover 查看） */}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div
                  style={{
                    width: 160,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '8px 10px',
                    border: '1px solid var(--color-surface0)',
                    borderRadius: 8,
                  }}
                >
                  <label className="config-label" style={{ marginBottom: -4 }}>
                    {t('serialTool.i2c.master.actions')}
                  </label>
                  <div className="config-group">
                    <label className="config-label">{t('serialTool.i2c.master.readLen')}</label>
                    <input
                      className="config-select"
                      type="number"
                      value={readLen}
                      onChange={(e) => setReadLen(e.target.value)}
                      min={1}
                      max={256}
                      style={{ width: 80 }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label className="modbus-check-label">
                      <input
                        type="checkbox"
                        checked={updateAfterRead}
                        onChange={(e) => setUpdateAfterRead(e.target.checked)}
                      />
                      {t('serialTool.i2c.master.updateAfterRead')}
                    </label>
                    <label className="modbus-check-label">
                      <input
                        type="checkbox"
                        checked={writeThenRead}
                        onChange={(e) => setWriteThenRead(e.target.checked)}
                      />
                      {t('serialTool.i2c.master.writeThenRead')}
                    </label>
                  </div>
                  <div style={{ marginTop: 'auto' }}>
                    <div className="i2c-btn-group">
                      <button className="i2c-btn primary" onClick={handleRead}>
                        {t('serialTool.i2c.master.read')}
                      </button>
                      <button className="i2c-btn primary" onClick={handleWrite}>
                        {t('serialTool.i2c.master.write')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* GPIO 控制已移至「高级功能」面板：添加行后点类型按钮切到 G，即可设置引脚高低电平 */}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
