import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invokeCommand } from '../../../Platform/IPC';
import type { SlaveEmulator } from '../lib/SlaveEmulator';
import { parseSpeedKhz } from '../lib/i2cUtils';
import { registerAssistantContributor } from '../../AIAssistant/assistantBridge';

interface AdvancedPanelProps {
  deviceOnline: boolean;
  deviceIndex: number;
  slaveAddrInput: string;
  regAddrType: string;
  i2cSpeed: string;
  sclStretch: boolean;
  delayMs: string;
  emulatorRef: React.MutableRefObject<SlaveEmulator | null>;
  slaveEnabled: boolean;
  slaveAddr: number;
  addLog: (message: string, isError?: boolean) => void;
  onToggleCollapsed: () => void;
  assistantRows?: I2cAssistantWorkflowRow[];
  onAssistantRowsApplied?: () => void;
}

export interface I2cAssistantWorkflowRow {
  type: 'W' | 'R' | 'WR' | 'G';
  writeBytes: string;
  readLen: string;
  gpioPin: string;
  gpioLevel: string;
}

/**
 * 命令行类型。
 *
 * 底层模型：每行 = 一个完整 I2C 事务（对应一次 CH347StreamI2C 调用），
 *           或一次 GPIO 电平设置（对应一次 CH347GPIOSet 调用）。
 * - `W`  纯写：写 writeBytes，不读。
 * - `R`  纯读：只发设备地址(读) 读 readLen 字节，不写命令字节（用于无需寄存器地址的设备）。
 * - `WR` 先写后读：写 writeBytes 命令序列后 repeated-start 读 readLen 字节。
 *        —— 这正是「读取得先发命令」的标准模式（如先写寄存器地址/命令字再读数据）。
 * - `G`  GPIO：设置 gpioPin 引脚为 gpioLevel（HIGH/LOW）。不属于 I2C 事务，
 *        仅在硬件在线时生效（GPIO 是 CH347 的独立数字 IO，与 I2C 从机模拟无关）。
 *
 * writeBytes 是任意字节序列：命令字 / 寄存器地址 / 参数自由组合，
 * 设备地址由顶部统一设置（底层自动拼 addr<<1）。
 */
type CmdType = 'W' | 'R' | 'WR' | 'G';

interface CommandRow {
  id: number;
  type: CmdType;
  /** 写阶段字节序列（十六进制，如 "00 1A FF"）。W/WR 有效；R/G 时忽略。 */
  writeBytes: string;
  /** 读取字节数。R/WR 有效；W/G 时忽略。 */
  readLen: string;
  /** GPIO 引脚号（0-7）。仅 G 有效；其余类型忽略。 */
  gpioPin: string;
  /** GPIO 电平：'H'=高 / 'L'=低。仅 G 有效；其余类型忽略。 */
  gpioLevel: string;
}

function parseHex(str: string, bits: number): number {
  let s = str.trim();
  if (s.toLowerCase().startsWith('0x')) s = s.slice(2);
  const val = parseInt(s, 16);
  if (isNaN(val)) throw new Error(`Invalid hex: ${str}`);
  return val & ((1 << bits) - 1);
}

/** 解析十六进制字节序列字符串为字节数组（支持空格/逗号分隔，可带 0x 前缀）。 */
function parseHexBytes(str: string): number[] {
  const parts = str
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  return parts.map((p) => parseHex(p, 8));
}

let nextRowId = 0;
function createRow(type: CmdType = 'WR'): CommandRow {
  // 默认 WR：写 0x00 寄存器地址读 16 字节 —— 兼容最常见的「读寄存器」用法。
  // GPIO 行默认 GPIO2=HIGH（与原底部快捷按钮的常用引脚一致）。
  return { id: ++nextRowId, type, writeBytes: '00', readLen: '16', gpioPin: '2', gpioLevel: 'H' };
}

export const AdvancedPanel: React.FC<AdvancedPanelProps> = ({
  deviceOnline,
  deviceIndex,
  slaveAddrInput,
  regAddrType,
  i2cSpeed,
  sclStretch,
  delayMs,
  emulatorRef,
  slaveEnabled,
  slaveAddr,
  addLog,
  onToggleCollapsed,
  assistantRows,
  onAssistantRowsApplied,
}) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<CommandRow[]>([createRow('R')]);
  const [selectedSet, setSelectedSet] = useState<Set<number>>(new Set());
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopInterval, setLoopInterval] = useState(500);
  const [loopMaxIter, setLoopMaxIter] = useState(0);
  const [currentLoopIdx, setCurrentLoopIdx] = useState(-1);
  const [loopIterCount, setLoopIterCount] = useState(0);
  /** 当前正在执行的行 id，用于高亮（用 id 而非索引，避免与 selected 子集索引错位）。 */
  const [activeRowId, setActiveRowId] = useState<number | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopIdxRef = useRef(0);
  const runningRef = useRef(false);
  // 循环的可变状态用 ref 跟踪，避免 setInterval 闭包捕获到过期的 state：
  //   - loopIterRef：迭代次数。用 state 的话闭包里永远是旧值，会导致计数卡住、maxIter 永不触发。
  //   - activeRowIdRef：当前执行行 id，与上面的 state 同步供渲染高亮。
  const loopIterRef = useRef(0);
  const activeRowIdRef = useRef<number | null>(null);
  // 镜像最新的回调/取值函数，让循环每次 tick 都用当前的行内容/选中集/参数，
  // 这样循环中编辑行或改从机地址能在下一拍生效（否则 startLoop 捕获的快照会一直用过期值）。
  const executeRowRef = useRef<(row: CommandRow) => Promise<void>>(async () => {});
  const getSelectedRowsRef = useRef<() => CommandRow[]>(() => []);
  const loopMaxIterRef = useRef(loopMaxIter);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (loopTimerRef.current) clearInterval(loopTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return registerAssistantContributor({
      id: 'i2c-advanced-workflow',
      tool: 'i2c-tool',
      getContext: () => ({
        rows: rows.map(({ type, writeBytes, readLen, gpioPin, gpioLevel }) => ({
          type,
          writeBytes,
          readLen: Number(readLen),
          gpioPin: Number(gpioPin),
          gpioLevel,
        })),
        selectedRows: rows.filter((row) => selectedSet.has(row.id)).map((row) => row.id),
        loop: {
          enabled: loopEnabled,
          intervalMs: loopInterval,
          maxIterations: loopMaxIter,
        },
      }),
      supports: () => false,
      apply: () => ({ message: '' }),
    });
  }, [loopEnabled, loopInterval, loopMaxIter, rows, selectedSet]);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, createRow('R')]);
  }, []);

  const deleteRow = useCallback((id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelectedSet((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const deleteSelected = useCallback(() => {
    setRows((prev) => prev.filter((r) => !selectedSet.has(r.id)));
    setSelectedSet(new Set());
  }, [selectedSet]);

  const updateRow = useCallback(
    (id: number, field: 'writeBytes' | 'readLen' | 'gpioPin' | 'gpioLevel', value: string) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    },
    []
  );

  const toggleRowType = useCallback((id: number) => {
    // 循环切换：W → R → WR → G → W ...
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const order: CmdType[] = ['W', 'R', 'WR', 'G'];
        const nextType = order[(order.indexOf(r.type) + 1) % order.length];
        return { ...r, type: nextType };
      })
    );
  }, []);

  const executeRow = useCallback(
    async (row: CommandRow): Promise<void> => {
      try {
        // GPIO 行：独立于 I2C 事务，只需设备在线即可设置引脚电平（GPIO 是 CH347 数字 IO）。
        if (row.type === 'G') {
          if (!deviceOnline) {
            addLog(t('serialTool.i2c.advanced.logDeviceNotConnected'), true);
            return;
          }
          const pin = parseInt(row.gpioPin, 10);
          if (isNaN(pin) || pin < 0 || pin > 7) {
            addLog(t('serialTool.i2c.advanced.logInvalidGpioPin', { pin: row.gpioPin }), true);
            return;
          }
          const level = row.gpioLevel === 'L' ? 0 : 1; // 默认 HIGH
          const mask = 1 << pin;
          await invokeCommand('ch347_gpio_set', {
            index: deviceIndex,
            enable: mask,
            dirOut: mask,
            dataOut: level ? mask : 0,
          });
          addLog(t('serialTool.i2c.advanced.logGpioSet', { pin, level: level ? 'HIGH' : 'LOW' }));
          return;
        }

        const addr = parseHex(slaveAddrInput, 7);
        const speedKhz = parseSpeedKhz(i2cSpeed);
        const delay = Number(delayMs) || undefined;

        // 解析写阶段字节（W/WR 有效）。底层 CH347StreamI2C 的 writeData 已含设备地址(写)，
        // 这里拼成 [(addr<<1), ...writeBytes]。
        const wantsWrite = row.type === 'W' || row.type === 'WR';
        const writeBytes = wantsWrite ? parseHexBytes(row.writeBytes) : [];
        if (wantsWrite && writeBytes.length === 0) {
          addLog(t('serialTool.i2c.advanced.logNoWriteBytes'), true);
          return;
        }
        // 解析读长度（R/WR 有效）。
        const wantsRead = row.type === 'R' || row.type === 'WR';
        const readLen = wantsRead ? parseInt(row.readLen, 10) : 0;
        if (wantsRead && (isNaN(readLen) || readLen < 1 || readLen > 256)) {
          addLog(t('serialTool.i2c.advanced.logInvalidReadLen', { len: row.readLen }), true);
          return;
        }

        // 日志：直观展示本次事务的写阶段与读阶段。
        const writeHex = writeBytes
          .map((b) => '0x' + b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');
        const logParts = [`slave=0x${addr.toString(16).padStart(2, '0')}`];
        if (wantsWrite) logParts.push(`W=[${writeHex}]`);
        if (wantsRead) logParts.push(`R=${readLen}B`);
        addLog(
          t('serialTool.i2c.advanced.logTransaction', {
            type: row.type,
            detail: logParts.join(' | '),
          })
        );

        let rxData: number[] | null = null;

        if (deviceOnline) {
          // 硬件：一次 ch347_i2c_transfer 即一个完整事务。
          // writeData = [addr<<1, ...writeBytes]；readLen>0 时底层 repeated-start 读。
          const writeData: number[] = [(addr << 1) & 0xff, ...writeBytes];
          rxData = await invokeCommand('ch347_i2c_transfer', {
            index: deviceIndex,
            writeData,
            readLen,
            speedKhz,
            sclStretch,
            delayMs: delay,
          });
          if (wantsRead) {
            const hex = (rxData ?? [])
              .map((b) => '0x' + b.toString(16).padStart(2, '0').toUpperCase())
              .join(' ');
            addLog(t('serialTool.i2c.advanced.logReadResult', { hex, len: rxData?.length ?? 0 }));
          } else {
            addLog(t('serialTool.i2c.advanced.logHwWrite'));
          }
        } else if (slaveEnabled && emulatorRef.current && slaveAddr === addr) {
          // 模拟从机：writeBytes 首字节视作寄存器起始地址（兼容模拟器 read/write 签名）。
          const regStart = writeBytes.length > 0 ? writeBytes[0] : 0;
          const is16 = regAddrType === '16';
          if (wantsRead) {
            rxData = emulatorRef.current.read(regStart, readLen, is16);
            const hex = (rxData ?? [])
              .map((b) => '0x' + b.toString(16).padStart(2, '0').toUpperCase())
              .join(' ');
            addLog(t('serialTool.i2c.advanced.logSlaveRead', { hex, len: rxData.length }));
          } else {
            // 写：首字节为寄存器地址，其余为数据。
            const dataBytes = writeBytes.slice(1);
            if (dataBytes.length > 0) {
              emulatorRef.current.write(regStart, dataBytes, is16);
              addLog(
                t('serialTool.i2c.advanced.logSlaveWrote', {
                  n: dataBytes.length,
                  addr: slaveAddr.toString(16),
                })
              );
            }
          }
        } else if (wantsRead) {
          // 无设备无模拟：回显伪数据，便于离线预览。
          rxData = [];
          for (let i = 0; i < readLen; i++) rxData.push(i & 0xff);
          const hex = rxData
            .map((b) => '0x' + b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
          addLog(t('serialTool.i2c.advanced.logSimRead', { hex }));
        } else {
          addLog(t('serialTool.i2c.advanced.logWriteDiscarded'), true);
        }
      } catch (e: unknown) {
        addLog(t('serialTool.i2c.advanced.logError', { msg: (e as Error).message }), true);
      }
    },
    [
      slaveAddrInput,
      regAddrType,
      i2cSpeed,
      sclStretch,
      delayMs,
      deviceOnline,
      deviceIndex,
      slaveEnabled,
      slaveAddr,
      emulatorRef,
      addLog,
      t,
    ]
  );

  const getSelectedRows = useCallback((): CommandRow[] => {
    return rows.filter((r) => selectedSet.has(r.id));
  }, [rows, selectedSet]);

  // 把最新的 executeRow / getSelectedRows / loopMaxIter 同步到 ref，供循环 interval 使用。
  useEffect(() => {
    executeRowRef.current = executeRow;
  }, [executeRow]);
  useEffect(() => {
    getSelectedRowsRef.current = getSelectedRows;
  }, [getSelectedRows]);
  useEffect(() => {
    loopMaxIterRef.current = loopMaxIter;
  }, [loopMaxIter]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedSet(new Set(rows.map((r) => r.id)));
  }, [rows]);

  const deselectAll = useCallback(() => {
    setSelectedSet(new Set());
  }, []);

  const executeSelected = useCallback(async () => {
    const selected = getSelectedRows();
    if (selected.length === 0) {
      addLog(t('serialTool.i2c.advanced.logNoRowsSelected'), true);
      return;
    }
    for (const row of selected) {
      await executeRow(row);
    }
  }, [getSelectedRows, executeRow, addLog, t]);

  const executeAll = useCallback(async () => {
    if (rows.length === 0) {
      addLog(t('serialTool.i2c.advanced.logNoRowsToExec'), true);
      return;
    }
    for (const row of rows) {
      await executeRow(row);
    }
  }, [rows, executeRow, addLog, t]);

  const stopLoop = useCallback(() => {
    if (loopTimerRef.current) {
      clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    runningRef.current = false;
    loopIterRef.current = 0;
    activeRowIdRef.current = null;
    setLoopEnabled(false);
    setCurrentLoopIdx(-1);
    setLoopIterCount(0);
    setActiveRowId(null);
  }, []);

  useEffect(() => {
    if (!assistantRows) return;
    stopLoop();
    setRows(assistantRows.map((row) => ({ ...row, id: ++nextRowId })));
    setSelectedSet(new Set());
    onAssistantRowsApplied?.();
  }, [assistantRows, onAssistantRowsApplied, stopLoop]);

  const startLoop = useCallback(() => {
    const selected = getSelectedRows();
    if (selected.length === 0) {
      addLog(t('serialTool.i2c.advanced.logNoRowsForLoop'), true);
      return;
    }

    setLoopEnabled(true);
    runningRef.current = true;
    loopIdxRef.current = 0;
    loopIterRef.current = 1;
    activeRowIdRef.current = selected[0].id;
    setCurrentLoopIdx(0);
    setLoopIterCount(1);
    setActiveRowId(selected[0].id);
    executeRowRef.current(selected[0]);

    loopTimerRef.current = setInterval(
      () => {
        if (!runningRef.current) return;
        // 每拍重新读取当前选中集与参数，循环中增删行/改选中/改从机地址都能在下一拍生效。
        const curSelected = getSelectedRowsRef.current();
        if (curSelected.length === 0) {
          stopLoop();
          return;
        }
        let nextIdx = loopIdxRef.current + 1;
        if (nextIdx >= curSelected.length) {
          // 完成一轮 → 进入下一轮迭代。迭代次数用 ref，避免 state 闭包过期导致计数卡住、maxIter 永不触发。
          loopIterRef.current += 1;
          const max = loopMaxIterRef.current;
          if (max > 0 && loopIterRef.current > max) {
            stopLoop();
            addLog(t('serialTool.i2c.advanced.logLoopCompleted', { n: max }));
            return;
          }
          setLoopIterCount(loopIterRef.current);
          nextIdx = 0;
        }
        loopIdxRef.current = nextIdx;
        setCurrentLoopIdx(nextIdx);
        const row = curSelected[nextIdx];
        activeRowIdRef.current = row.id;
        setActiveRowId(row.id);
        executeRowRef.current(row);
      },
      Math.max(50, loopInterval)
    );
  }, [getSelectedRows, loopInterval, stopLoop, addLog, t]);

  const selectedCount = selectedSet.size;

  return (
    <div className="i2c-advanced-panel">
      <div className="i2c-advanced-header">
        <button className="i2c-advanced-toggle" onClick={onToggleCollapsed}>
          <span className="i2c-advanced-arrow">&#9660;</span>
          {t('serialTool.i2c.advanced.title')}
        </button>
        <span className="i2c-advanced-count">
          {rows.length} {t('serialTool.i2c.advanced.commands')} | {selectedCount}{' '}
          {t('serialTool.i2c.advanced.selected')}
        </span>
      </div>

      <div className="i2c-advanced-body">
        {/* Toolbar */}
        <div className="i2c-advanced-toolbar">
          <div className="i2c-advanced-select-bar">
            <button className="i2c-advanced-select-btn" onClick={selectAll}>
              {t('serialTool.i2c.advanced.selectAll')}
            </button>
            <button className="i2c-advanced-select-btn" onClick={deselectAll}>
              {t('serialTool.i2c.advanced.deselectAll')}
            </button>
          </div>
          <div className="i2c-advanced-select-bar">
            <button
              className="i2c-advanced-select-btn"
              onClick={addRow}
              title={t('serialTool.i2c.advanced.addRowTitle')}
            >
              + {t('serialTool.i2c.advanced.addRow')}
            </button>
            {selectedCount > 0 && (
              <button
                className="i2c-advanced-select-btn"
                onClick={deleteSelected}
                title={t('serialTool.i2c.advanced.deleteSelectedTitle')}
              >
                {t('serialTool.i2c.advanced.deleteSelected')}
              </button>
            )}
          </div>
        </div>

        {/* Row list */}
        <div className="i2c-advanced-cmd-list">
          {rows.map((row, idx) => {
            const isSelected = selectedSet.has(row.id);
            const isActive = row.id === activeRowId && loopEnabled;
            return (
              <div
                key={row.id}
                className={`i2c-advanced-cmd-row ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  className="i2c-advanced-checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(row.id)}
                />

                {/* Row index */}
                <span className="i2c-advanced-row-idx">{idx + 1}</span>

                {/* 事务类型按钮：点击循环切换 W → R → WR */}
                <button
                  className={`i2c-advanced-type-btn type-${row.type.toLowerCase()}`}
                  onClick={() => toggleRowType(row.id)}
                  title={t('serialTool.i2c.advanced.typeHint')}
                >
                  {row.type}
                </button>

                {/* 写阶段字节序列：W / WR 时显示 */}
                {(row.type === 'W' || row.type === 'WR') && (
                  <div className="i2c-advanced-field i2c-advanced-field-reg">
                    <span className="i2c-advanced-field-label">
                      {t('serialTool.i2c.advanced.writeBytes')}
                    </span>
                    <input
                      className="i2c-advanced-field-input"
                      type="text"
                      value={row.writeBytes}
                      onChange={(e) => updateRow(row.id, 'writeBytes', e.target.value)}
                      placeholder="00 1A FF"
                      spellCheck={false}
                    />
                  </div>
                )}

                {/* 读长度：R / WR 时显示 */}
                {(row.type === 'R' || row.type === 'WR') && (
                  <div className="i2c-advanced-field i2c-advanced-field-data">
                    <span className="i2c-advanced-field-label">
                      {t('serialTool.i2c.advanced.readLen')}
                    </span>
                    <input
                      className="i2c-advanced-field-input"
                      type="number"
                      value={row.readLen}
                      onChange={(e) => updateRow(row.id, 'readLen', e.target.value)}
                      min={1}
                      max={256}
                      placeholder="16"
                    />
                    <span className="i2c-advanced-field-unit">B</span>
                  </div>
                )}

                {/* GPIO 引脚与电平：G 时显示 */}
                {row.type === 'G' && (
                  <div className="i2c-advanced-field i2c-advanced-field-gpio">
                    <span className="i2c-advanced-field-label">
                      {t('serialTool.i2c.advanced.gpioPin')}
                    </span>
                    <input
                      className="i2c-advanced-field-input"
                      type="number"
                      value={row.gpioPin}
                      onChange={(e) => updateRow(row.id, 'gpioPin', e.target.value)}
                      min={0}
                      max={7}
                      style={{ width: 48 }}
                    />
                    <button
                      className={`i2c-advanced-level-btn high${row.gpioLevel === 'H' ? ' active' : ''}`}
                      onClick={() => updateRow(row.id, 'gpioLevel', 'H')}
                    >
                      {t('serialTool.i2c.advanced.gpioHigh')}
                    </button>
                    <button
                      className={`i2c-advanced-level-btn low${row.gpioLevel === 'L' ? ' active' : ''}`}
                      onClick={() => updateRow(row.id, 'gpioLevel', 'L')}
                    >
                      {t('serialTool.i2c.advanced.gpioLow')}
                    </button>
                  </div>
                )}

                {/* Delete button */}
                <button
                  className="i2c-advanced-row-delete"
                  onClick={() => deleteRow(row.id)}
                  title={t('serialTool.i2c.advanced.deleteRowTitle')}
                >
                  &#10005;
                </button>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="i2c-advanced-empty">{t('serialTool.i2c.advanced.noRows')}</div>
          )}
        </div>

        {/* Loop controls */}
        <div className="i2c-advanced-controls">
          <div className="i2c-advanced-loop-config">
            <label className="i2c-advanced-label">
              {t('serialTool.i2c.advanced.interval')}
              <input
                type="number"
                className="i2c-input"
                value={loopInterval}
                onChange={(e) => setLoopInterval(Math.max(50, Number(e.target.value)))}
                min={50}
                max={60000}
                step={50}
                style={{ width: 70 }}
                disabled={loopEnabled}
              />
              <span className="i2c-advanced-unit">ms</span>
            </label>
            <label className="i2c-advanced-label">
              {t('serialTool.i2c.advanced.maxIter')}
              <input
                type="number"
                className="i2c-input"
                value={loopMaxIter}
                onChange={(e) => setLoopMaxIter(Math.max(0, Number(e.target.value)))}
                min={0}
                max={99999}
                style={{ width: 70 }}
                disabled={loopEnabled}
              />
              <span className="i2c-advanced-unit">{loopMaxIter === 0 ? '∞' : ''}</span>
            </label>
          </div>
        </div>

        {/* Action buttons */}
        <div className="i2c-advanced-actions">
          <button
            className="i2c-btn primary"
            onClick={executeSelected}
            disabled={selectedCount === 0}
          >
            {t('serialTool.i2c.advanced.executeSelected')}
          </button>
          <button className="i2c-btn" onClick={executeAll} disabled={rows.length === 0}>
            {t('serialTool.i2c.advanced.executeAll')}
          </button>
          {!loopEnabled ? (
            <button className="i2c-btn primary" onClick={startLoop} disabled={selectedCount === 0}>
              {t('serialTool.i2c.advanced.startLoop')}
            </button>
          ) : (
            <button className="i2c-btn danger" onClick={stopLoop}>
              {t('serialTool.i2c.advanced.stopLoop')} ({loopIterCount})
            </button>
          )}
        </div>

        {loopEnabled && (
          <div className="i2c-advanced-loop-status">
            <span className="status-led active" />
            {t('serialTool.i2c.advanced.loopRunning', {
              current: currentLoopIdx + 1,
              total: getSelectedRows().length,
              iter: loopIterCount,
            })}
          </div>
        )}
      </div>
    </div>
  );
};
