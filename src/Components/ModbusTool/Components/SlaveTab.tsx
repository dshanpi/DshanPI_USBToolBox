import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { invokeCommand, subscribeEvent } from '../../../Platform/IPC';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { crc16, formatRTUHex } from '../lib/ModbusProtocol';
import type { SlaveSimulator } from '../lib/SlaveSimulator';

interface SlaveTabProps {
  slaveSimRef: React.MutableRefObject<SlaveSimulator | null>;
  slaveEnabled: boolean;
  onSlaveEnabledChange: (v: boolean) => void;
}

interface LogEntry {
  time: string;
  message: string;
  isError: boolean;
}

function formatTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
}

const MAX_ADDR = 256;

export const SlaveTab: React.FC<SlaveTabProps> = ({
  slaveSimRef,
  slaveEnabled,
  onSlaveEnabledChange,
}) => {
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((n) => n + 1), []);
  const sim = slaveSimRef.current;

  // Display counts
  const [coilCount, setCoilCount] = useState(16);
  const [discreteCount, setDiscreteCount] = useState(16);
  const [holdingCount, setHoldingCount] = useState(16);
  const [inputRegCount, setInputRegCount] = useState(16);

  // Add amount inputs
  const [coilAddN, setCoilAddN] = useState('1');
  const [discreteAddN, setDiscreteAddN] = useState('1');
  const [holdingAddN, setHoldingAddN] = useState('1');
  const [inputRegAddN, setInputRegAddN] = useState('1');

  // Connection
  const [serialPort, setSerialPort] = useState('');
  const [baudRate, setBaudRate] = useState('115200');
  const [parity, setParity] = useState('none');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [ports, setPorts] = useState<Array<{ name: string; description: string }>>([]);
  const connIdRef = useRef('');

  // Slave ID
  const [slaveIdInput, setSlaveIdInput] = useState('1');
  useEffect(() => {
    if (sim) sim.slaveId = parseInt(slaveIdInput, 10) || 1;
  }, [slaveIdInput, sim]);

  // Log
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    {
      time: '--:--:--',
      message: 'Slave simulator ready. Connect to start responding.',
      isError: false,
    },
  ]);
  const logListRef = useRef<HTMLDivElement>(null);

  const isNearBottom = useCallback(() => {
    const el = logListRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  const addLog = useCallback(
    (message: string, isError = false) => {
      const shouldKeepLogAtBottom = isNearBottom();
      const entry: LogEntry = { time: formatTime(), message, isError };
      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > 500) next.shift();
        return next;
      });
      requestAnimationFrame(() => {
        if (shouldKeepLogAtBottom && logListRef.current) {
          logListRef.current.scrollTop = logListRef.current.scrollHeight;
        }
      });
    },
    [isNearBottom]
  );

  // ─── Serial port ─────────────────────────────────────

  const scanPorts = useCallback(async () => {
    try {
      const list = await invokeCommand('serial_list_ports');
      const mapped = list.map(
        (p: { name: string; description?: string; manufacturer?: string }) => ({
          name: p.name,
          description: p.description || p.manufacturer || p.name,
        })
      );
      setPorts(mapped);
      if (!serialPort) {
        const lp = localStorage.getItem('modbus-slave-last-port');
        if (lp && list.some((p: { name: string }) => p.name === lp)) setSerialPort(lp);
        else if (list.length > 0) setSerialPort(list[0].name);
      }
    } catch {
      /* */
    }
  }, [serialPort]);
  useEffect(() => {
    scanPorts();
  }, []);

  const handleConnect = useCallback(async () => {
    if (!serialPort) {
      addLog('No serial port selected', true);
      return;
    }
    setConnecting(true);
    try {
      await invokeCommand('serial_open', {
        port: serialPort,
        baudRate: parseInt(baudRate, 10),
        dataBits: 8,
        stopBits: 1,
        parity,
        flowControl: 'none',
      });
      localStorage.setItem('modbus-slave-last-port', serialPort);
      connIdRef.current = serialPort;
      setConnected(true);
      addLog(`Slave listening on ${serialPort} as ID #${sim?.slaveId ?? 1}`);
    } catch (e: unknown) {
      const raw = (e as Error).message || String(e);
      if (raw.includes('PORT_BUSY:') || raw.includes('already open'))
        addLog(`Port ${serialPort} is occupied.`, true);
      else if (raw.includes('PORT_GONE:')) addLog(`Port ${serialPort} not found.`, true);
      else addLog(`Connect failed: ${raw}`, true);
    }
    setConnecting(false);
  }, [serialPort, baudRate, parity, sim, addLog]);

  const handleDisconnect = useCallback(async () => {
    try {
      await invokeCommand('serial_close', { port: connIdRef.current });
    } catch {
      /* */
    }
    setConnected(false);
    addLog('Slave disconnected');
  }, [addLog]);

  // ─── Listen & respond ────────────────────────────────

  const rxBufRef = useRef<number[]>([]);
  const rxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    if (connected) {
      subscribeEvent('serial-data-received', (payload: { port: string; data: number[] }) => {
        if (!payload.data || payload.data.length === 0) {
          if (payload.port === connIdRef.current) {
            setConnected(false);
            addLog(`Port ${payload.port} disconnected`, true);
          }
          return;
        }
        if (payload.port !== connIdRef.current) return;
        rxBufRef.current.push(...payload.data);
        if (rxTimerRef.current) clearTimeout(rxTimerRef.current);
        rxTimerRef.current = setTimeout(() => {
          const buf = rxBufRef.current;
          rxBufRef.current = [];
          if (buf.length < 4) return;
          const frame = new Uint8Array(buf);
          const frameHex = formatRTUHex(frame);
          addLog(`RX: ${frameHex}`);
          const recvCrc = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
          const calcCrc = crc16(frame.slice(0, -2));
          if (recvCrc !== calcCrc) {
            addLog(`CRC mismatch`, true);
            return;
          }
          if (!sim || !slaveEnabled) return;
          const pdu = frame.slice(0, -2);
          const respPDU = sim.processPDU(pdu);
          if (respPDU) {
            const respFrame = new Uint8Array(respPDU);
            const crc = crc16(respFrame);
            const fullResp = new Uint8Array([...respPDU, crc & 0xff, (crc >> 8) & 0xff]);
            addLog(`TX: ${formatRTUHex(fullResp)}`);
            invokeCommand('serial_write', {
              port: connIdRef.current,
              data: Array.from(fullResp),
            }).catch(() => {});
            forceUpdate();
          }
        }, 50);
      }).then((fn) => {
        unlisten = fn;
      });
    }
    return () => {
      unlisten?.();
      if (rxTimerRef.current) clearTimeout(rxTimerRef.current);
    };
  }, [connected, sim, slaveEnabled, addLog, forceUpdate]);

  // ─── Data editing ────────────────────────────────────

  const toggleCoil = useCallback(
    (addr: number) => {
      if (sim) {
        sim.setCoil(addr, sim.getCoil(addr) ? 0 : 1);
        forceUpdate();
      }
    },
    [sim, forceUpdate]
  );
  const setHolding = useCallback(
    (addr: number, val: number) => {
      sim?.setHolding(addr, val);
      forceUpdate();
    },
    [sim, forceUpdate]
  );

  const maxCount = useMemo(
    () => Math.max(coilCount, discreteCount, holdingCount, inputRegCount),
    [coilCount, discreteCount, holdingCount, inputRegCount]
  );
  const resetDefaults = useCallback(() => {
    sim?.resetDefaults(maxCount);
    forceUpdate();
  }, [sim, forceUpdate, maxCount]);
  const injectTest = useCallback(() => {
    sim?.injectTestData(maxCount);
    forceUpdate();
  }, [sim, forceUpdate, maxCount]);

  // ─── Table helpers ───────────────────────────────────

  const renderCoilTable = (count: number) => (
    <div className="modbus-data-panel" style={{ minHeight: 0, maxHeight: 220 }}>
      <div className="modbus-data-table-wrap">
        <table className="modbus-data-table">
          <thead>
            <tr>
              <th>Addr</th>
              <th>Val</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: count }, (_, addr) => {
              const v = sim?.getCoil(addr) ?? 0;
              return (
                <tr key={addr}>
                  <td className="modbus-tbl-addr">
                    0x{addr.toString(16).padStart(2, '0').toUpperCase()}
                  </td>
                  <td
                    className="modbus-tbl-val"
                    onClick={() => toggleCoil(addr)}
                    style={{
                      color: v ? 'var(--color-success)' : 'var(--color-overlay0)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                    title="Click to toggle"
                  >
                    {v}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderRegisterTable = (count: number) => (
    <div className="modbus-data-panel" style={{ minHeight: 0, maxHeight: 220 }}>
      <div className="modbus-data-table-wrap">
        <table className="modbus-data-table">
          <thead>
            <tr>
              <th>Addr</th>
              <th>Dec</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: count }, (_, addr) => {
              const v = sim?.getHolding(addr) ?? 0;
              return (
                <tr key={addr}>
                  <td className="modbus-tbl-addr">
                    0x{addr.toString(16).padStart(2, '0').toUpperCase()}
                  </td>
                  <td>
                    <input
                      className="modbus-tbl-input"
                      type="number"
                      value={v}
                      onChange={(e) => setHolding(addr, parseInt(e.target.value, 10) || 0)}
                      min={0}
                      max={65535}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="modbus-master-layout">
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label className="modbus-check-label">
          <input
            type="checkbox"
            checked={slaveEnabled}
            onChange={(e) => onSlaveEnabledChange(e.target.checked)}
          />{' '}
          Slave Active
        </label>
        <div className="modbus-def-field" style={{ width: 120 }}>
          <label>Slave ID</label>
          <input
            className="modbus-def-input"
            type="number"
            value={slaveIdInput}
            onChange={(e) => setSlaveIdInput(e.target.value)}
            min={1}
            max={247}
          />
        </div>
        <span className={`status-led ${connected ? 'active' : ''}`} />
        <span style={{ fontSize: 11, color: 'var(--color-overlay1)' }}>
          {connected ? `Listening on ${serialPort}` : 'Not connected'}
        </span>
      </div>

      {/* 4 data panels — single row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div
            className="modbus-section-title"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>Coils (0x) — FC 01/05</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                className="modbus-add-input"
                type="number"
                value={coilAddN}
                onChange={(e) => setCoilAddN(e.target.value)}
                min={1}
                max={MAX_ADDR}
              />
              <button
                className="modbus-reg-btn"
                onClick={() => {
                  const n = parseInt(coilAddN, 10) || 1;
                  setCoilCount((c) => Math.min(c + n, MAX_ADDR));
                }}
                disabled={coilCount >= MAX_ADDR}
              >
                Add
              </button>
            </div>
          </div>
          {renderCoilTable(coilCount)}
          <div
            className="modbus-section-title"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>Discrete Inputs (1x) — FC 02</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                className="modbus-add-input"
                type="number"
                value={discreteAddN}
                onChange={(e) => setDiscreteAddN(e.target.value)}
                min={1}
                max={MAX_ADDR}
              />
              <button
                className="modbus-reg-btn"
                onClick={() => {
                  const n = parseInt(discreteAddN, 10) || 1;
                  setDiscreteCount((c) => Math.min(c + n, MAX_ADDR));
                }}
                disabled={discreteCount >= MAX_ADDR}
              >
                Add
              </button>
            </div>
          </div>
          {renderCoilTable(discreteCount)}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div
            className="modbus-section-title"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>Holding Regs (4x) — FC 03/06/16</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                className="modbus-add-input"
                type="number"
                value={holdingAddN}
                onChange={(e) => setHoldingAddN(e.target.value)}
                min={1}
                max={MAX_ADDR}
              />
              <button
                className="modbus-reg-btn"
                onClick={() => {
                  const n = parseInt(holdingAddN, 10) || 1;
                  setHoldingCount((c) => Math.min(c + n, MAX_ADDR));
                }}
                disabled={holdingCount >= MAX_ADDR}
              >
                Add
              </button>
            </div>
          </div>
          {renderRegisterTable(holdingCount)}
          <div
            className="modbus-section-title"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>Input Regs (3x) — FC 04</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                className="modbus-add-input"
                type="number"
                value={inputRegAddN}
                onChange={(e) => setInputRegAddN(e.target.value)}
                min={1}
                max={MAX_ADDR}
              />
              <button
                className="modbus-reg-btn"
                onClick={() => {
                  const n = parseInt(inputRegAddN, 10) || 1;
                  setInputRegCount((c) => Math.min(c + n, MAX_ADDR));
                }}
                disabled={inputRegCount >= MAX_ADDR}
              >
                Add
              </button>
            </div>
          </div>
          {renderRegisterTable(inputRegCount)}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="i2c-btn" onClick={resetDefaults}>
          Reset Defaults
        </button>
        <button className="i2c-btn" onClick={injectTest}>
          Inject Test Data
        </button>
      </div>

      {/* Connection + Log */}
      <div className="i2c-master-config">
        <div className="i2c-master-config-body">
          <div className="serial-config-row">
            <div className="config-group">
              <label className="config-label">Port</label>
              <div className="config-port-row">
                <span className={`status-led ${connected ? 'active' : ''}`} />
                <select
                  className="config-select"
                  value={serialPort}
                  onChange={(e) => setSerialPort(e.target.value)}
                  disabled={connected}
                >
                  <option value="">-- Select Port --</option>
                  {ports.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                      {p.description !== p.name ? ` (${p.description})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="config-btn-icon"
                  onClick={scanPorts}
                  disabled={connected}
                  title="Refresh"
                >
                  ↻
                </button>
              </div>
            </div>
            <div className="config-group">
              <label className="config-label">Baud</label>
              <select
                className="config-select"
                value={baudRate}
                onChange={(e) => setBaudRate(e.target.value)}
                disabled={connected}
              >
                {[
                  '300',
                  '1200',
                  '2400',
                  '4800',
                  '9600',
                  '19200',
                  '38400',
                  '57600',
                  '115200',
                  '230400',
                  '460800',
                  '921600',
                ].map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="config-group">
              <label className="config-label">Parity</label>
              <select
                className="config-select"
                value={parity}
                onChange={(e) => setParity(e.target.value)}
                disabled={connected}
              >
                <option value="none">8N1</option>
                <option value="even">8E1</option>
                <option value="odd">8O1</option>
              </select>
            </div>
            <div className="config-group config-connect">
              <label className="config-label">&nbsp;</label>
              {!connected ? (
                <button
                  className="config-btn-open"
                  onClick={handleConnect}
                  disabled={connecting || !serialPort}
                >
                  {connecting ? '...' : 'Connect'}
                </button>
              ) : (
                <button className="config-btn-close" onClick={handleDisconnect}>
                  Disconnect
                </button>
              )}
            </div>
          </div>
          <div className="i2c-log-area" style={{ height: 150, marginTop: 8 }}>
            <div className="i2c-log-title">
              <span className="status-led active" /> Slave Log
            </div>
            <div
              className="i2c-log-list i2c-log-interactive"
              ref={logListRef}
              style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
            >
              <pre className="i2c-log-pre">
                {logs.map((e) => `[${e.time}] ${e.message}`).join('\n') || 'Ready'}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
