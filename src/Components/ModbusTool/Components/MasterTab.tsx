import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invokeCommand, subscribeEvent } from '../../../Platform/IPC';
import type { UnlistenFn } from '@tauri-apps/api/event';
import {
  buildRTUFrame,
  buildASCIIFrame,
  buildTCPFrame,
  parseRTUResponse,
  parseTCPResponse,
  buildPDUData,
  isReadFunc,
  isModbusError,
  formatRTUHex,
  responseToRegisters,
  responseToBits,
  getPLCAddressPrefix,
  FUNC_CODES,
  type ModbusResponse,
  type ModbusError,
} from '../lib/ModbusProtocol';
import type { SlaveSimulator } from '../lib/SlaveSimulator';
import {
  asRecord,
  optionalNumber,
  optionalString,
  registerAssistantContributor,
} from '../../AIAssistant/assistantBridge';

interface MasterTabProps {
  slaveSimRef: React.MutableRefObject<SlaveSimulator | null>;
  slaveEnabled: boolean;
}

interface LogEntry {
  time: string;
  message: string;
  isError: boolean;
}

interface PendingRequest {
  protocol: 'rtu' | 'tcp';
  transactionId?: number;
  slaveId: number;
  funcCode: number;
  quantity: number;
}

function responseTimeoutMs(
  protocol: 'rtu' | 'tcp',
  baudRate: number,
  funcCode: number,
  quantity: number
): number {
  if (protocol === 'tcp') return 3000;
  const responseBytes =
    funcCode === 1 || funcCode === 2
      ? Math.ceil(quantity / 8) + 5
      : funcCode === 3 || funcCode === 4
        ? quantity * 2 + 5
        : 8;
  const wireTimeMs = (responseBytes * 11 * 1000) / Math.max(300, baudRate);
  return Math.min(30000, Math.max(1000, Math.ceil(wireTimeMs * 2 + 300)));
}

function formatTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

export const MasterTab: React.FC<MasterTabProps> = (_props) => {
  const { t } = useTranslation();
  // Transport config
  const [protocol, setProtocol] = useState<'rtu' | 'tcp'>('rtu');
  const [serialPort, setSerialPort] = useState('');
  const [baudRate, setBaudRate] = useState('115200');
  const [_dataBits, _setDataBits] = useState('8');
  const [_stopBits, _setStopBits] = useState('1');
  const [parity, setParity] = useState('none');
  const [tcpHost, setTcpHost] = useState('127.0.0.1');
  const [tcpPort, setTcpPort] = useState('502');

  // Modbus read/write definition
  const [slaveId, setSlaveId] = useState('1');
  const [funcCode, setFuncCode] = useState('3');
  const [addrMode, setAddrMode] = useState<'dec' | 'hex'>('dec');
  const [startAddr, setStartAddr] = useState('0');
  const [quantity, setQuantity] = useState('10');
  const [writeDataHex, setWriteDataHex] = useState('');
  const [singleWriteVal, setSingleWriteVal] = useState('0');
  const [scanRate, setScanRate] = useState('1000');
  const [rwDisabled, setRwDisabled] = useState(false);
  const [disableOnError, setDisableOnError] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // View options
  const [rowCount, setRowCount] = useState<'10' | '20' | '50' | '100' | 'fit'>('fit');
  const [hideNameCol, setHideNameCol] = useState(false);
  const [plcAddressMode, setPlcAddressMode] = useState(true);

  // Response data
  const [respRegisters, setRespRegisters] = useState<number[]>([]);
  const [respBits, setRespBits] = useState<number[]>([]);
  const [rtuRespHex, setRtuRespHex] = useState('');

  // Connection state
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [ports, setPorts] = useState<Array<{ name: string; description: string }>>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const connIdRef = useRef<string>('');
  const requestInFlightRef = useRef(false);
  const pendingRequestRef = useRef<PendingRequest | null>(null);
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transactionIdRef = useRef(0);

  const clearPendingRequest = useCallback(() => {
    if (responseTimerRef.current) {
      clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
    pendingRequestRef.current = null;
    requestInFlightRef.current = false;
  }, []);

  // Log
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    {
      time: '--:--:--',
      message: 'Modbus Master ready.',
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
          // Scroll only the log container. scrollIntoView() also scrolls page
          // ancestors and unexpectedly drags the user down to the log section.
          logListRef.current.scrollTop = logListRef.current.scrollHeight;
        }
      });
    },
    [isNearBottom]
  );

  // Collapsible config
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [msgCollapsed, setMsgCollapsed] = useState(false);

  // ─── Serial port management ─────────────────────────

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
        const lastPort = localStorage.getItem('modbus-last-port');
        if (lastPort && list.some((p: { name: string }) => p.name === lastPort)) {
          setSerialPort(lastPort);
        } else if (list.length > 0) {
          setSerialPort(list[0].name);
        }
      }
    } catch {
      /* no ports */
    }
  }, [serialPort]);

  useEffect(() => {
    scanPorts();
  }, [scanPorts]);

  useEffect(() => {
    if (!autoRefresh || connected) return;
    const timer = setInterval(async () => {
      try {
        const list = await invokeCommand('serial_list_ports');
        const mapped = list.map(
          (p: { name: string; description?: string; manufacturer?: string }) => ({
            name: p.name,
            description: p.description || p.manufacturer || p.name,
          })
        );
        setPorts(mapped);
        const lastPort = localStorage.getItem('modbus-last-port');
        setSerialPort((prev) => {
          if (
            lastPort &&
            list.some((p: { name: string }) => p.name === lastPort) &&
            prev !== lastPort
          )
            return lastPort;
          if (list.length > 0 && !list.some((p: { name: string }) => p.name === prev))
            return list[0].name;
          return prev;
        });
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [autoRefresh, connected]);

  const handleConnect = useCallback(async () => {
    if (protocol === 'rtu' && !serialPort) {
      addLog('No serial port selected', true);
      return;
    }
    setConnecting(true);
    let tcpId: string | undefined;
    try {
      if (protocol === 'rtu') {
        await invokeCommand('serial_open', {
          port: serialPort,
          baudRate: parseInt(baudRate, 10),
          dataBits: parseInt(_dataBits, 10),
          stopBits: parseInt(_stopBits, 10),
          parity,
          flowControl: 'none',
        });
        localStorage.setItem('modbus-last-port', serialPort);
        connIdRef.current = serialPort;
      } else {
        tcpId = `modbus-tcp-${Date.now()}`;
        await invokeCommand('tcp_connect', {
          id: tcpId,
          host: tcpHost,
          port: parseInt(tcpPort, 10),
        });
        // Record the id before tcp_start_read so a failure there can still be cleaned up
        connIdRef.current = tcpId;
        await invokeCommand('tcp_start_read', { id: tcpId });
      }
      // Clear rx buffers so stale bytes from a previous session don't get parsed
      rxBufRef.current = [];
      tcpRxBufRef.current = [];
      clearPendingRequest();
      setConnected(true);
      addLog(
        `${protocol.toUpperCase()} connected — ${protocol === 'rtu' ? serialPort : `${tcpHost}:${tcpPort}`}`
      );
    } catch (e: unknown) {
      // Clean up a half-open TCP connection if tcp_start_read failed after tcp_connect
      if (protocol === 'tcp' && tcpId) {
        invokeCommand('tcp_close', { id: tcpId }).catch(() => {});
        if (connIdRef.current === tcpId) connIdRef.current = '';
      }
      const raw = (e as Error).message || String(e);
      if (raw.includes('PORT_BUSY:') || raw.includes('already open')) {
        addLog(
          `Port ${serialPort} is occupied by another tool or application. Close it first.`,
          true
        );
      } else if (raw.includes('PORT_GONE:') || raw.includes('not found')) {
        addLog(`Port ${serialPort} not found. Check device connection and refresh.`, true);
      } else {
        addLog(`Connect failed: ${raw}`, true);
      }
    }
    setConnecting(false);
  }, [
    protocol,
    serialPort,
    baudRate,
    _dataBits,
    _stopBits,
    parity,
    tcpHost,
    tcpPort,
    addLog,
    clearPendingRequest,
  ]);

  const handleDisconnect = useCallback(async () => {
    try {
      if (protocol === 'rtu') {
        await invokeCommand('serial_close', { port: connIdRef.current });
      } else {
        await invokeCommand('tcp_close', { id: connIdRef.current });
      }
    } catch {
      /* ignore */
    }
    setConnected(false);
    clearPendingRequest();
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    setScanning(false);
    addLog('Disconnected');
  }, [protocol, addLog, clearPendingRequest]);

  // ─── Receive buffer (accumulate fragmented Modbus RTU frames) ──

  const rxBufRef = useRef<number[]>([]);
  const rxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // TCP is a byte stream: a single read() can return a partial MBAP frame or
  // multiple frames glued together. Accumulate here and split by MBAP length.
  const tcpRxBufRef = useRef<number[]>([]);

  const handleParsedResponse = useCallback(
    (transport: 'rtu' | 'tcp', result: ModbusResponse | ModbusError, data: Uint8Array) => {
      const pending = pendingRequestRef.current;
      const rawHex = formatRTUHex(data);
      addLog(`RX: ${rawHex}`);
      setRtuRespHex(rawHex);

      if (!pending || pending.protocol !== transport) {
        addLog('RX ignored: no matching request is pending', true);
        return;
      }

      if (isModbusError(result)) {
        const sameSlave = result.slaveId === undefined || result.slaveId === pending.slaveId;
        const sameFunction =
          result.funcCode === undefined || (result.funcCode & 0x7f) === pending.funcCode;
        const sameTransaction =
          transport !== 'tcp' ||
          result.transId === undefined ||
          result.transId === pending.transactionId;
        if (!sameSlave || !sameFunction || !sameTransaction) {
          addLog('RX ignored: response does not match the pending request', true);
          return;
        }
        clearPendingRequest();
        addLog(`RX Error: ${result.error}`, true);
        if (disableOnError) setRwDisabled(true);
        return;
      }

      const resp = result as ModbusResponse;
      if (
        resp.slaveId !== pending.slaveId ||
        resp.funcCode !== pending.funcCode ||
        (transport === 'tcp' && resp.transId !== pending.transactionId)
      ) {
        addLog('RX ignored: slave, function, or transaction ID does not match', true);
        return;
      }

      clearPendingRequest();
      if (pending.funcCode === 1 || pending.funcCode === 2) {
        setRespBits(responseToBits(resp.data, pending.quantity));
        setRespRegisters([]);
      } else if (pending.funcCode === 3 || pending.funcCode === 4) {
        setRespRegisters(responseToRegisters(resp.data));
        setRespBits([]);
      }
    },
    [addLog, clearPendingRequest, disableOnError]
  );

  const processRxBuffer = useCallback(() => {
    const buf = rxBufRef.current;
    rxBufRef.current = [];
    if (buf.length < 4) return;
    const data = new Uint8Array(buf);
    handleParsedResponse('rtu', parseRTUResponse(data), data);
  }, [handleParsedResponse]);

  // ─── Event listeners ────────────────────────────────

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    let unlistenTcp: UnlistenFn | undefined;
    let unlistenTcpDisc: UnlistenFn | undefined;
    if (connected) {
      subscribeEvent('serial-data-received', (payload: { port: string; data: number[] }) => {
        if (!payload.data || payload.data.length === 0) {
          if (payload.port === connIdRef.current && protocol === 'rtu') {
            setConnected(false);
            clearPendingRequest();
            if (scanTimerRef.current) {
              clearInterval(scanTimerRef.current);
              scanTimerRef.current = null;
            }
            setScanning(false);
            addLog(`Port ${payload.port} disconnected`, true);
          }
          return;
        }
        if (payload.port !== connIdRef.current || protocol !== 'rtu') return;
        // Buffer incoming bytes, parse after 50ms silence (Modbus RTU 3.5-char gap)
        rxBufRef.current.push(...payload.data);
        if (rxTimerRef.current) clearTimeout(rxTimerRef.current);
        rxTimerRef.current = setTimeout(() => processRxBuffer(), 50);
      }).then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
      subscribeEvent('tcp-data-received', (payload: { id: string; data: number[] }) => {
        if (!payload.data || payload.data.length === 0) return;
        if (payload.id !== connIdRef.current || protocol !== 'tcp') return;
        // TCP is a stream: accumulate bytes and split into complete MBAP frames by
        // length. A single read() can return a partial frame or several frames at once.
        tcpRxBufRef.current.push(...payload.data);
        while (tcpRxBufRef.current.length >= 8) {
          const buf = tcpRxBufRef.current;
          const len = (buf[4] << 8) | buf[5]; // MBAP length = bytes following the 6-byte header
          if (len < 2 || len > 254) {
            tcpRxBufRef.current = [];
            clearPendingRequest();
            addLog(`RX Error: invalid Modbus TCP length ${len}`, true);
            break;
          }
          if (buf.length < 6 + len) break; // incomplete frame, wait for more bytes
          const frameBytes = buf.slice(0, 6 + len);
          tcpRxBufRef.current = buf.slice(6 + len);
          const data = new Uint8Array(frameBytes);
          handleParsedResponse('tcp', parseTCPResponse(data), data);
        }
      }).then((fn) => {
        if (disposed) fn();
        else unlistenTcp = fn;
      });
      // TCP connection lost — reflect in UI. (RTU detects this via empty serial-data-received above.)
      subscribeEvent('tcp-disconnected', (payload: string) => {
        if (payload !== connIdRef.current || protocol !== 'tcp') return;
        invokeCommand('tcp_close', { id: payload }).catch(() => {});
        setConnected(false);
        clearPendingRequest();
        if (scanTimerRef.current) {
          clearInterval(scanTimerRef.current);
          scanTimerRef.current = null;
        }
        setScanning(false);
        addLog('TCP connection closed by remote', true);
      }).then((fn) => {
        if (disposed) fn();
        else unlistenTcpDisc = fn;
      });
    }
    return () => {
      disposed = true;
      unlisten?.();
      unlistenTcp?.();
      unlistenTcpDisc?.();
      if (rxTimerRef.current) clearTimeout(rxTimerRef.current);
      tcpRxBufRef.current = [];
    };
  }, [protocol, connected, processRxBuffer, handleParsedResponse, addLog, clearPendingRequest]);

  // ─── Send/Receive ────────────────────────────────────

  const parseAddr = useCallback(
    (s: string): number => {
      const str = s.trim();
      if (addrMode === 'hex') {
        let h = str;
        if (h.toLowerCase().startsWith('0x')) h = h.slice(2);
        return parseInt(h, 16) || 0;
      }
      return parseInt(str, 10) || 0;
    },
    [addrMode]
  );

  // ─── Live preview: compute request frames from current params ──

  const previewFrames = useMemo(() => {
    const sid = parseInt(slaveId, 10) || 1;
    const fc = parseInt(funcCode, 10) || 3;
    const addr = parseAddr(startAddr);
    const qty = parseInt(quantity, 10) || 1;
    const read = isReadFunc(fc);
    let writeBytes: number[] = [];
    if (!read) {
      if (fc === 5 || fc === 6) {
        const val = parseInt(singleWriteVal, 10) || 0;
        writeBytes = [(val >> 8) & 0xff, val & 0xff];
      } else if (fc === 15 || fc === 16) {
        const hex = writeDataHex.replace(/\s/g, '');
        for (let i = 0; i < hex.length; i += 2) {
          const b = parseInt(hex.substring(i, i + 2), 16);
          if (!isNaN(b)) writeBytes.push(b);
        }
      }
    }
    const pduData = buildPDUData(fc, addr, qty, writeBytes);
    const rtuFrame = buildRTUFrame(sid, fc, pduData);
    const asciiFrame = buildASCIIFrame(sid, fc, pduData);
    const tcpFrame = buildTCPFrame(1, sid, fc, pduData);
    // Also compute hex bytes of the ASCII frame for display
    const asciiBytes = new TextEncoder().encode(asciiFrame);
    return {
      rtu: formatRTUHex(rtuFrame),
      ascii: formatRTUHex(asciiBytes),
      tcp: formatRTUHex(tcpFrame),
    };
  }, [slaveId, funcCode, startAddr, quantity, writeDataHex, singleWriteVal, parseAddr]);

  useEffect(() => {
    return registerAssistantContributor({
      id: 'modbus-master',
      tool: 'modbus-tool',
      getContext: () => ({
        connected,
        connecting,
        availablePorts: ports,
        transport: {
          protocol,
          serialPort,
          baudRate: Number(baudRate),
          dataBits: Number(_dataBits),
          stopBits: Number(_stopBits),
          parity,
          tcpHost,
          tcpPort: Number(tcpPort),
        },
        request: {
          slaveId: Number(slaveId),
          functionCode: Number(funcCode),
          addressMode: addrMode,
          startAddress: parseAddr(startAddr),
          quantity: Number(quantity),
          writeDataHex,
          singleWriteValue: Number(singleWriteVal),
          scanRateMs: Number(scanRate),
        },
        requestPreview: previewFrames,
        lastResponseHex: rtuRespHex,
        responseRegisters: respRegisters.slice(0, 128),
        responseBits: respBits.slice(0, 256),
        recentLogs: logs.slice(-50),
      }),
      supports: (action) => action.type === 'modbus.configure',
      apply: (action) => {
        if (connected || connecting) throw new Error('请先断开 Modbus 连接，再应用新的配置');
        const payload = asRecord(action.payload);
        const nextProtocol = optionalString(payload.protocol, 'protocol');
        const nextSerialPort = optionalString(payload.serialPort, 'serialPort');
        const nextBaudRate = optionalNumber(payload.baudRate, 'baudRate');
        const nextDataBits = optionalNumber(payload.dataBits, 'dataBits');
        const nextStopBits = optionalNumber(payload.stopBits, 'stopBits');
        const nextParity = optionalString(payload.parity, 'parity');
        const nextTcpHost = optionalString(payload.tcpHost, 'tcpHost');
        const nextTcpPort = optionalNumber(payload.tcpPort, 'tcpPort');
        const nextSlaveId = optionalNumber(payload.slaveId, 'slaveId');
        const nextFunctionCode = optionalNumber(payload.functionCode, 'functionCode');
        const nextAddressMode = optionalString(payload.addressMode, 'addressMode');
        const nextStartAddress = optionalNumber(payload.startAddress, 'startAddress');
        const nextQuantity = optionalNumber(payload.quantity, 'quantity');
        const nextWriteData = optionalString(payload.writeDataHex, 'writeDataHex');
        const nextSingleValue = optionalNumber(payload.singleWriteValue, 'singleWriteValue');
        const nextScanRate = optionalNumber(payload.scanRateMs, 'scanRateMs');

        if (nextProtocol !== undefined && !['rtu', 'tcp'].includes(nextProtocol)) {
          throw new Error('Modbus 协议必须是 rtu 或 tcp');
        }
        const baudRates = [
          300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
        ];
        if (nextBaudRate !== undefined && !baudRates.includes(nextBaudRate)) {
          throw new Error(`当前界面不支持波特率 ${nextBaudRate}`);
        }
        if (nextDataBits !== undefined && nextDataBits !== 8)
          throw new Error('Modbus RTU 数据位必须是 8');
        if (nextStopBits !== undefined && ![1, 2].includes(nextStopBits))
          throw new Error('停止位必须是 1 或 2');
        if (nextParity !== undefined && !['none', 'odd', 'even'].includes(nextParity))
          throw new Error('校验位无效');
        if (nextTcpHost !== undefined && (!nextTcpHost.trim() || nextTcpHost.length > 253))
          throw new Error('TCP 主机地址无效');
        if (
          nextTcpPort !== undefined &&
          (!Number.isInteger(nextTcpPort) || nextTcpPort < 1 || nextTcpPort > 65535)
        )
          throw new Error('TCP 端口必须在 1–65535 之间');
        if (
          nextSlaveId !== undefined &&
          (!Number.isInteger(nextSlaveId) || nextSlaveId < 1 || nextSlaveId > 247)
        )
          throw new Error('Modbus 站号必须在 1–247 之间');
        if (
          nextFunctionCode !== undefined &&
          ![1, 2, 3, 4, 5, 6, 15, 16].includes(nextFunctionCode)
        )
          throw new Error('不支持该 Modbus 功能码');
        if (nextAddressMode !== undefined && !['dec', 'hex'].includes(nextAddressMode))
          throw new Error('地址显示格式无效');
        if (
          nextStartAddress !== undefined &&
          (!Number.isInteger(nextStartAddress) || nextStartAddress < 0 || nextStartAddress > 0xffff)
        )
          throw new Error('起始地址必须在 0–65535 之间');
        if (
          nextQuantity !== undefined &&
          (!Number.isInteger(nextQuantity) || nextQuantity < 1 || nextQuantity > 125)
        )
          throw new Error('数量必须在 1–125 之间');
        if (
          nextWriteData !== undefined &&
          nextWriteData.trim() &&
          !/^(?:[0-9a-fA-F]{2})(?:[\s,]+[0-9a-fA-F]{2})*$/.test(nextWriteData.trim())
        )
          throw new Error('写入数据必须是空格或逗号分隔的十六进制字节');
        const targetFunction = Math.trunc(nextFunctionCode ?? Number(funcCode));
        if (nextSingleValue !== undefined) {
          const max = targetFunction === 5 ? 1 : 65535;
          if (!Number.isInteger(nextSingleValue) || nextSingleValue < 0 || nextSingleValue > max) {
            throw new Error(
              targetFunction === 5 ? '线圈值必须是 0 或 1' : '寄存器值必须在 0–65535 之间'
            );
          }
        }
        if (
          nextScanRate !== undefined &&
          (!Number.isInteger(nextScanRate) || nextScanRate < 100 || nextScanRate > 60_000)
        )
          throw new Error('轮询周期必须在 100–60000 ms 之间');

        if (nextProtocol !== undefined) setProtocol(nextProtocol as 'rtu' | 'tcp');
        if (nextSerialPort !== undefined) setSerialPort(nextSerialPort);
        if (nextBaudRate !== undefined) setBaudRate(String(Math.trunc(nextBaudRate)));
        if (nextDataBits !== undefined) _setDataBits(String(Math.trunc(nextDataBits)));
        if (nextStopBits !== undefined) _setStopBits(String(Math.trunc(nextStopBits)));
        if (nextParity !== undefined) setParity(nextParity);
        if (nextTcpHost !== undefined) setTcpHost(nextTcpHost.trim());
        if (nextTcpPort !== undefined) setTcpPort(String(Math.trunc(nextTcpPort)));
        if (nextSlaveId !== undefined) setSlaveId(String(Math.trunc(nextSlaveId)));
        if (nextFunctionCode !== undefined) setFuncCode(String(Math.trunc(nextFunctionCode)));
        if (nextAddressMode !== undefined) setAddrMode(nextAddressMode as 'dec' | 'hex');
        if (nextStartAddress !== undefined) {
          const mode = (nextAddressMode ?? addrMode) as 'dec' | 'hex';
          setStartAddr(
            mode === 'hex'
              ? `0x${Math.trunc(nextStartAddress).toString(16).padStart(4, '0').toUpperCase()}`
              : String(Math.trunc(nextStartAddress))
          );
        }
        if (nextQuantity !== undefined) setQuantity(String(Math.trunc(nextQuantity)));
        if (nextWriteData !== undefined) setWriteDataHex(nextWriteData.trim().toUpperCase());
        if (nextSingleValue !== undefined) setSingleWriteVal(String(Math.trunc(nextSingleValue)));
        if (nextScanRate !== undefined) setScanRate(String(Math.trunc(nextScanRate)));
        setConfigCollapsed(false);
        addLog('AI 助手已填入 Modbus 配置；请检查后手动连接或发送');
        return { message: 'Modbus 传输与读写参数' };
      },
    });
  }, [
    _dataBits,
    _stopBits,
    addLog,
    addrMode,
    baudRate,
    connected,
    connecting,
    funcCode,
    logs,
    parity,
    parseAddr,
    ports,
    previewFrames,
    protocol,
    quantity,
    respBits,
    respRegisters,
    rtuRespHex,
    scanRate,
    serialPort,
    singleWriteVal,
    slaveId,
    startAddr,
    tcpHost,
    tcpPort,
    writeDataHex,
  ]);

  const getDisplayRows = useCallback((): number => {
    if (rowCount === 'fit') return parseInt(quantity, 10) || 10;
    return parseInt(rowCount, 10);
  }, [rowCount, quantity]);

  const execReadWrite = useCallback(async () => {
    if (!connected || rwDisabled || requestInFlightRef.current) return;
    let pending: PendingRequest | null = null;
    try {
      const sid = parseInt(slaveId, 10);
      const fc = parseInt(funcCode, 10);
      const addr = parseAddr(startAddr);
      const qty = parseInt(quantity, 10);
      const read = isReadFunc(fc);
      const maxQuantity =
        fc === 1 || fc === 2
          ? 2000
          : fc === 3 || fc === 4
            ? 125
            : fc === 15
              ? 1968
              : fc === 16
                ? 123
                : 1;
      if (!Number.isInteger(sid) || sid < 1 || sid > 247) throw new Error('Slave ID must be 1-247');
      if (!FUNC_CODES[fc]) throw new Error('Unsupported Modbus function code');
      if (!Number.isInteger(addr) || addr < 0 || addr > 0xffff)
        throw new Error('Start address must be 0-65535');
      if (!Number.isInteger(qty) || qty < 1 || qty > maxQuantity)
        throw new Error(`Quantity must be 1-${maxQuantity} for function ${fc}`);
      if (addr + (fc === 5 || fc === 6 ? 1 : qty) > 0x10000)
        throw new Error('Requested address range exceeds 65535');

      // Build write bytes for write function codes
      let writeBytes: number[] = [];
      if (!read) {
        if (fc === 5 || fc === 6) {
          const val = parseInt(singleWriteVal, 10) || 0;
          writeBytes = [(val >> 8) & 0xff, val & 0xff];
        } else if (fc === 15 || fc === 16) {
          const hex = writeDataHex.replace(/\s/g, '');
          for (let i = 0; i < hex.length; i += 2) {
            const b = parseInt(hex.substring(i, i + 2), 16);
            if (!isNaN(b)) writeBytes.push(b);
          }
        }
      }

      const pduData = buildPDUData(fc, addr, qty, writeBytes);
      let transactionId: number | undefined;
      let frame: Uint8Array;
      if (protocol === 'rtu') {
        frame = buildRTUFrame(sid, fc, pduData);
      } else {
        transactionIdRef.current = (transactionIdRef.current + 1) & 0xffff;
        transactionId = transactionIdRef.current;
        frame = buildTCPFrame(transactionId, sid, fc, pduData);
      }

      pending = { protocol, transactionId, slaveId: sid, funcCode: fc, quantity: qty };
      pendingRequestRef.current = pending;
      requestInFlightRef.current = true;
      const timeoutMs = responseTimeoutMs(protocol, parseInt(baudRate, 10) || 115200, fc, qty);
      responseTimerRef.current = setTimeout(() => {
        if (pendingRequestRef.current !== pending) return;
        clearPendingRequest();
        addLog(`Response timeout after ${timeoutMs} ms`, true);
        if (disableOnError) setRwDisabled(true);
      }, timeoutMs);

      // Update message preview
      setRtuRespHex('');

      const frameHex = formatRTUHex(frame);
      addLog(`TX: ${frameHex}`);

      if (protocol === 'rtu') {
        await invokeCommand('serial_write', { port: connIdRef.current, data: Array.from(frame) });
      } else {
        await invokeCommand('tcp_send', { id: connIdRef.current, data: Array.from(frame) });
      }

      // Mirror the write into the local slave simulator so the Slave tab stays in sync.
      // processPDU applies the exact same decode a real slave would (0xFF00 coil value,
      // page-aligned multi-writes, address bounds checks) — reusing it avoids drift
      // between the frame we put on the wire and the sim's internal state.
      if (!read && _props.slaveSimRef.current && _props.slaveEnabled) {
        const sim = _props.slaveSimRef.current;
        if (sim.slaveId === sid) {
          sim.processPDU(new Uint8Array([sid, fc, ...pduData]));
        }
      }
    } catch (e: unknown) {
      if (!pending || pendingRequestRef.current === pending) clearPendingRequest();
      const msg = (e as Error).message || String(e);
      addLog(`TX Error: ${msg}`, true);
      if (disableOnError) setRwDisabled(true);
    }
  }, [
    connected,
    rwDisabled,
    slaveId,
    funcCode,
    startAddr,
    quantity,
    writeDataHex,
    singleWriteVal,
    protocol,
    baudRate,
    parseAddr,
    addLog,
    disableOnError,
    clearPendingRequest,
    _props,
  ]);

  // Keep a ref to the latest execReadWrite so the polling interval always invokes
  // the version with current parameter values (startAddr/quantity/writeData/...).
  // Without this, setInterval captures a stale closure and edits made mid-scan are
  // silently ignored until the scan is stopped and restarted.
  const execReadWriteRef = useRef(execReadWrite);
  useEffect(() => {
    execReadWriteRef.current = execReadWrite;
  }, [execReadWrite]);

  // ─── Scan / Polling ──────────────────────────────────

  const startScan = useCallback(() => {
    if (!connected || rwDisabled || scanTimerRef.current) return;
    setScanning(true);
    execReadWriteRef.current();
    scanTimerRef.current = setInterval(
      () => {
        execReadWriteRef.current();
      },
      Math.max(100, parseInt(scanRate, 10) || 1000)
    );
  }, [connected, rwDisabled, scanRate]);

  const stopScan = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
      clearPendingRequest();
    };
  }, [clearPendingRequest]);

  // ─── Data table edit ─────────────────────────────────

  const editRegister = useCallback((idx: number, val: number) => {
    setRespRegisters((prev) => {
      const next = [...prev];
      next[idx] = val & 0xffff;
      return next;
    });
  }, []);

  const editBit = useCallback((idx: number, val: number) => {
    setRespBits((prev) => {
      const next = [...prev];
      next[idx] = val ? 1 : 0;
      return next;
    });
  }, []);

  // ─── Log utilities ───────────────────────────────────

  const [clearedText, setClearedText] = useState('');
  const handleClearLog = useCallback(() => {
    const text = logs.map((e) => `[${e.time}] ${e.message}`).join('\n');
    if (text) setClearedText(text);
    setLogs([]);
  }, [logs]);

  const handleRestore = useCallback(() => {
    setLogs(
      clearedText.split('\n').map((line) => {
        const m = line.match(/^\[([^\]]+)\] (.*)/);
        return { time: m?.[1] ?? '--:--:--', message: m?.[2] ?? line, isError: false };
      })
    );
    setClearedText('');
  }, [clearedText]);

  // ─── Render helpers ──────────────────────────────────

  const fc = parseInt(funcCode, 10);
  const isRead = isReadFunc(fc);
  const plcPrefix = getPLCAddressPrefix(fc);
  const displayRows = getDisplayRows();
  const hasCoilData = fc === 1 || fc === 2;
  const hasRegisterData = fc === 3 || fc === 4;
  const addrVal = parseAddr(startAddr);

  const logText = logs.map((e) => `[${e.time}] ${e.message}`).join('\n');

  return (
    <div className="modbus-master-layout modbus-master-workspace">
      {/* Middle area: Definition (left) + Data Table (right) */}
      <div className="modbus-master-middle">
        {/* ─── Left: Read/Write Definition ─────────────── */}
        <div className="modbus-def-panel">
          <div className="modbus-section-title">{t('modbus.master.definition')}</div>

          <div className="modbus-def-grid">
            <div className="modbus-def-field">
              <label>{t('modbus.common.slaveId')}</label>
              <input
                className="modbus-def-input"
                type="number"
                value={slaveId}
                onChange={(e) => setSlaveId(e.target.value)}
                min={1}
                max={247}
                disabled={connected && scanning}
              />
            </div>
            <div className="modbus-def-field">
              <label>{t('modbus.master.functionCode')}</label>
              <select
                className="modbus-def-input"
                value={funcCode}
                onChange={(e) => setFuncCode(e.target.value)}
                disabled={connected && scanning}
              >
                {Object.entries(FUNC_CODES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(`modbus.functions.${k}`, { defaultValue: v })}
                  </option>
                ))}
              </select>
            </div>
            <div className="modbus-def-field">
              <label>{t('modbus.master.addressMode')}</label>
              <select
                className="modbus-def-input"
                value={addrMode}
                onChange={(e) => setAddrMode(e.target.value as 'dec' | 'hex')}
              >
                <option value="dec">{t('modbus.master.decimal')}</option>
                <option value="hex">{t('modbus.master.hexadecimal')}</option>
              </select>
            </div>
            <div className="modbus-def-field">
              <label>
                {t('modbus.master.startAddress', {
                  mode: addrMode === 'hex' ? 'Hex' : 'Dec',
                })}
              </label>
              <input
                className="modbus-def-input"
                type="text"
                value={startAddr}
                onChange={(e) => setStartAddr(e.target.value)}
                placeholder={addrMode === 'hex' ? '0x0000' : '0'}
              />
            </div>
            <div className="modbus-def-field">
              <label>{t('modbus.master.quantity')}</label>
              <input
                className="modbus-def-input"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min={1}
                max={125}
              />
            </div>
          </div>

          <div className="modbus-scan-row">
            <div className="modbus-def-field" style={{ flex: 1 }}>
              <label>{t('modbus.master.scanRate')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="modbus-def-input"
                  type="number"
                  value={scanRate}
                  onChange={(e) => setScanRate(e.target.value)}
                  min={100}
                  max={60000}
                  step={100}
                  style={{ flex: 1 }}
                  disabled={scanning}
                />
              </div>
            </div>
          </div>

          {/* Write data input — shown for write function codes */}
          {!isRead && (
            <div className="modbus-def-grid">
              {fc === 5 ? (
                <div className="modbus-def-field">
                  <label>{t('modbus.master.coilValue')}</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={`i2c-btn ${singleWriteVal === '1' ? 'primary' : ''}`}
                      onClick={() => setSingleWriteVal('1')}
                      style={{ flex: 1 }}
                    >
                      {t('modbus.master.onValue')}
                    </button>
                    <button
                      className={`i2c-btn ${singleWriteVal === '0' ? 'primary' : ''}`}
                      onClick={() => setSingleWriteVal('0')}
                      style={{ flex: 1 }}
                    >
                      {t('modbus.master.offValue')}
                    </button>
                  </div>
                </div>
              ) : fc === 6 ? (
                <div className="modbus-def-field">
                  <label>{t('modbus.master.registerValue')}</label>
                  <input
                    className="modbus-def-input"
                    type="number"
                    value={singleWriteVal}
                    onChange={(e) => setSingleWriteVal(e.target.value)}
                    min={0}
                    max={65535}
                  />
                </div>
              ) : (
                <div className="modbus-def-field">
                  <label>{t('modbus.master.writeData')}</label>
                  <textarea
                    className="modbus-def-input"
                    style={{
                      resize: 'vertical',
                      fontFamily: "'Cascadia Code','Fira Code',Consolas,monospace",
                    }}
                    rows={2}
                    value={writeDataHex}
                    onChange={(e) => setWriteDataHex(e.target.value)}
                    placeholder="FF 00 01 02"
                  />
                </div>
              )}
            </div>
          )}

          <div className="modbus-def-checks">
            <label className="modbus-check-label">
              <input
                type="checkbox"
                checked={rwDisabled}
                onChange={(e) => {
                  setRwDisabled(e.target.checked);
                  if (e.target.checked) stopScan();
                }}
              />
              {t('modbus.master.readWriteDisabled')}
            </label>
            <label className="modbus-check-label">
              <input
                type="checkbox"
                checked={disableOnError}
                onChange={(e) => setDisableOnError(e.target.checked)}
              />
              {t('modbus.master.disableOnError')}
            </label>
          </div>

          <div className="modbus-def-actions">
            {isRead ? (
              <button
                className="i2c-btn primary"
                onClick={execReadWrite}
                disabled={!connected || rwDisabled || scanning}
              >
                {t('modbus.common.read')}
              </button>
            ) : (
              <button
                className="i2c-btn primary"
                onClick={execReadWrite}
                disabled={!connected || rwDisabled || scanning}
              >
                {t('modbus.common.write')}
              </button>
            )}
            {!scanning ? (
              <button
                className="i2c-btn primary"
                onClick={startScan}
                disabled={!connected || rwDisabled}
              >
                {t('modbus.master.poll')}
              </button>
            ) : (
              <button className="i2c-btn danger" onClick={stopScan}>
                {t('modbus.common.stop')}
              </button>
            )}
          </div>
        </div>

        {/* ─── Right: Data Table ────────────────────────── */}
        <div className="modbus-data-panel modbus-master-data-panel">
          <div className="modbus-data-header">
            <div className="modbus-data-heading">
              <span className="modbus-section-title">{t('modbus.master.dataView')}</span>
              <span className="modbus-data-summary">
                {t('modbus.master.visibleRows', {
                  visible: displayRows,
                  total: Math.max(1, parseInt(quantity, 10) || 1),
                })}
              </span>
            </div>
            <div className="modbus-data-controls">
              <select
                className="modbus-view-select"
                value={rowCount}
                onChange={(e) => setRowCount(e.target.value as typeof rowCount)}
              >
                <option value="10">{t('modbus.master.rows', { count: 10 })}</option>
                <option value="20">{t('modbus.master.rows', { count: 20 })}</option>
                <option value="50">{t('modbus.master.rows', { count: 50 })}</option>
                <option value="100">{t('modbus.master.rows', { count: 100 })}</option>
                <option value="fit">{t('modbus.master.fitQuantity')}</option>
              </select>
              <label className="modbus-check-label">
                <input
                  type="checkbox"
                  checked={hideNameCol}
                  onChange={(e) => setHideNameCol(e.target.checked)}
                />
                {t('modbus.master.hideNames')}
              </label>
              <label className="modbus-check-label">
                <input
                  type="checkbox"
                  checked={plcAddressMode}
                  onChange={(e) => setPlcAddressMode(e.target.checked)}
                />
                {t('modbus.master.plcAddress')}
              </label>
            </div>
          </div>

          <div className="modbus-data-table-wrap">
            {hasRegisterData || hasCoilData ? (
              <table className="modbus-data-table">
                <thead>
                  <tr>
                    <th className="modbus-tbl-addr">{t('modbus.common.address')}</th>
                    {!hideNameCol && <th className="modbus-tbl-name">{t('modbus.common.name')}</th>}
                    {hasRegisterData ? (
                      <>
                        <th className="modbus-tbl-hex">HEX</th>
                        <th className="modbus-tbl-val">{t('modbus.common.dec')}</th>
                      </>
                    ) : (
                      <th className="modbus-tbl-val">{t('modbus.master.valueBit')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: displayRows }, (_, i) => {
                    const absAddr = addrVal + i;
                    const plcAddr = plcPrefix
                      ? `${plcPrefix}${String(absAddr + 1).padStart(4, '0')}`
                      : String(absAddr);
                    const regVal = respRegisters[i];
                    const bitVal = respBits[i];
                    return (
                      <tr key={i} className={scanning && i === 0 ? 'modbus-tbl-row-active' : ''}>
                        <td className="modbus-tbl-addr">
                          {plcAddressMode
                            ? plcAddr
                            : addrMode === 'hex'
                              ? `0x${absAddr.toString(16).toUpperCase().padStart(4, '0')}`
                              : String(absAddr)}
                        </td>
                        {!hideNameCol && (
                          <td className="modbus-tbl-name">
                            {hasRegisterData
                              ? t('modbus.master.holdingRegisterName', { address: absAddr })
                              : t('modbus.master.coilName', { address: absAddr })}
                          </td>
                        )}
                        {hasRegisterData ? (
                          <>
                            <td className="modbus-tbl-hex">
                              {i < respRegisters.length ? (
                                <span className="modbus-hex-value">
                                  0x{(regVal ?? 0).toString(16).toUpperCase().padStart(4, '0')}
                                </span>
                              ) : (
                                <span className="modbus-tbl-empty">—</span>
                              )}
                            </td>
                            <td className="modbus-tbl-val">
                              {i < respRegisters.length ? (
                                <input
                                  className="modbus-tbl-input"
                                  type="number"
                                  value={regVal ?? 0}
                                  onChange={(e) =>
                                    editRegister(i, parseInt(e.target.value, 10) || 0)
                                  }
                                  min={0}
                                  max={65535}
                                />
                              ) : (
                                <span className="modbus-tbl-empty">—</span>
                              )}
                            </td>
                          </>
                        ) : (
                          <td className="modbus-tbl-val">
                            {i < respBits.length ? (
                              <div className="modbus-bit-control">
                                <span
                                  className={`modbus-bit-indicator ${bitVal ? 'is-high' : 'is-low'}`}
                                  aria-hidden="true"
                                />
                                <select
                                  className="modbus-tbl-input modbus-bit-select"
                                  value={bitVal ?? 0}
                                  onChange={(e) => editBit(i, parseInt(e.target.value, 10))}
                                >
                                  <option value={0}>{t('modbus.master.lowValue')}</option>
                                  <option value={1}>{t('modbus.master.highValue')}</option>
                                </select>
                              </div>
                            ) : (
                              <span className="modbus-tbl-empty">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="modbus-data-empty">{t('modbus.master.selectReadHint')}</div>
            )}
          </div>

          {connected && scanning && (
            <div className="modbus-scan-status">
              <span className="status-led active" />
              {t('modbus.master.scanning', {
                rate: scanRate,
                action: isRead ? t('modbus.master.reading') : t('modbus.master.writing'),
                target:
                  fc === 1 || fc === 2 ? t('modbus.master.coils') : t('modbus.master.registers'),
              })}
            </div>
          )}
        </div>
      </div>

      <div className="modbus-bottom-dock">
        {/* ─── Message Preview (live-updating, selectable) ─── */}
        <div className={`modbus-msg-panel ${msgCollapsed ? 'collapsed' : ''}`}>
          <div
            className="modbus-msg-header"
            onClick={() => setMsgCollapsed(!msgCollapsed)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>
              {msgCollapsed ? '▶' : '▼'} {t('modbus.master.messages')}
            </span>
            {!msgCollapsed && (
              <button
                className="serial-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const lines = [
                    `RTU:  ${previewFrames.rtu}`,
                    `ASCII: ${previewFrames.ascii}`,
                    `TCP:  ${previewFrames.tcp}`,
                    `Resp: ${rtuRespHex || '—'}`,
                  ];
                  navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
                }}
              >
                {t('modbus.master.copyAll')}
              </button>
            )}
          </div>
          {!msgCollapsed && (
            <div className="modbus-msg-grid">
              <div className="modbus-msg-field">
                <span className="modbus-msg-label">{t('modbus.master.rtuRequest')}</span>
                <pre
                  className="modbus-msg-pre"
                  onMouseDown={() => {}} // Allow native text selection
                >
                  {previewFrames.rtu || '—'}
                </pre>
              </div>
              <div className="modbus-msg-field">
                <span className="modbus-msg-label">{t('modbus.master.asciiRequest')}</span>
                <pre className="modbus-msg-pre">{previewFrames.ascii || '—'}</pre>
              </div>
              <div className="modbus-msg-field">
                <span className="modbus-msg-label">{t('modbus.master.tcpRequest')}</span>
                <pre className="modbus-msg-pre">{previewFrames.tcp || '—'}</pre>
              </div>
              <div className="modbus-msg-field">
                <span className="modbus-msg-label">
                  {protocol === 'tcp'
                    ? t('modbus.master.tcpResponse')
                    : t('modbus.master.rtuResponse')}
                </span>
                <pre
                  className="modbus-msg-pre"
                  style={{ color: rtuRespHex ? 'var(--color-text)' : 'var(--color-overlay0)' }}
                >
                  {rtuRespHex || t('modbus.master.waitingResponse')}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* ─── Bottom: Log + Connection ─────────────────────── */}
        <div className={`i2c-master-config ${configCollapsed ? 'collapsed' : ''}`}>
          {configCollapsed ? (
            <button
              className="i2c-config-collapse-btn"
              onClick={() => setConfigCollapsed(false)}
              title={t('modbus.common.expand')}
            >
              &#9650;
            </button>
          ) : (
            <>
              <button
                className="i2c-config-collapse-btn"
                style={{ position: 'absolute', top: 4, right: 8, zIndex: 1 }}
                onClick={() => setConfigCollapsed(true)}
                title={t('modbus.common.collapse')}
              >
                &#9660;
              </button>
              <div className="i2c-master-config-body">
                {/* Connection bar */}
                <div className="serial-config-row">
                  <div className="config-group">
                    <label className="config-label">{t('modbus.common.protocol')}</label>
                    <select
                      className="config-select"
                      value={protocol}
                      onChange={(e) => setProtocol(e.target.value as 'rtu' | 'tcp')}
                      disabled={connected}
                    >
                      <option value="rtu">{t('modbus.master.rtuSerial')}</option>
                      <option value="tcp">Modbus TCP</option>
                    </select>
                  </div>
                  <div className="config-group">
                    <label className="config-label">{t('modbus.common.port')}</label>
                    <div className="config-port-row">
                      <span
                        className={`status-led ${connected ? 'active' : ''}`}
                        style={{ marginRight: 4 }}
                      />
                      {protocol === 'rtu' ? (
                        <>
                          <select
                            className="config-select"
                            value={serialPort}
                            onChange={(e) => setSerialPort(e.target.value)}
                            disabled={connected}
                          >
                            <option value="">{t('modbus.common.selectPort')}</option>
                            {ports.map((p) => (
                              <option key={p.name} value={p.name}>
                                {p.name}
                                {p.description && p.description !== p.name
                                  ? ` (${p.description})`
                                  : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            className="config-btn-icon"
                            onClick={scanPorts}
                            disabled={connected}
                            title={t('modbus.common.refresh')}
                          >
                            ↻
                          </button>
                          <button
                            className={`config-btn-icon ${autoRefresh ? 'active' : ''}`}
                            onClick={() => setAutoRefresh((v) => !v)}
                            disabled={connected}
                            title={t('modbus.common.auto')}
                          >
                            A
                          </button>
                        </>
                      ) : (
                        <>
                          <input
                            className="config-select"
                            type="text"
                            value={tcpHost}
                            onChange={(e) => setTcpHost(e.target.value)}
                            disabled={connected}
                            placeholder="Host"
                            style={{ width: 110 }}
                          />
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--color-overlay1)',
                              margin: '0 4px',
                            }}
                          >
                            :
                          </span>
                          <input
                            className="config-select"
                            type="number"
                            value={tcpPort}
                            onChange={(e) => setTcpPort(e.target.value)}
                            disabled={connected}
                            placeholder="502"
                            style={{ width: 65 }}
                            min={1}
                            max={65535}
                          />
                        </>
                      )}
                    </div>
                  </div>
                  {protocol === 'rtu' && (
                    <>
                      <div className="config-group">
                        <label className="config-label">{t('modbus.common.baud')}</label>
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
                        <label className="config-label">{t('modbus.common.parity')}</label>
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
                    </>
                  )}
                  <div className="config-group config-connect">
                    <label className="config-label">&nbsp;</label>
                    {!connected ? (
                      <button
                        className="config-btn-open"
                        onClick={handleConnect}
                        disabled={connecting || (protocol === 'rtu' && !serialPort)}
                      >
                        {connecting ? '...' : t('modbus.common.connect')}
                      </button>
                    ) : (
                      <button className="config-btn-close" onClick={handleDisconnect}>
                        {t('modbus.common.disconnect')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Log */}
                <div className="i2c-log-area">
                  <div className="i2c-log-title">
                    <span className="status-led active" />
                    {t('modbus.master.busLog')}
                    <div className="i2c-log-actions">
                      <button className="serial-action-btn" onClick={handleClearLog}>
                        {t('modbus.common.clear')}
                      </button>
                      {clearedText && (
                        <button className="serial-action-btn" onClick={handleRestore}>
                          {t('modbus.common.restore')}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="i2c-log-list i2c-log-interactive" ref={logListRef}>
                    <pre className="i2c-log-pre">{logText || t('modbus.common.ready')}</pre>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
