import React, {
  useState,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronDown,
  faChevronUp,
  faColumns,
  faEquals,
  faExpand,
  faPlus,
  faTableCells,
  faWindowMaximize,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { invokeCommand, subscribeEvent } from '../../Platform/IPC';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { SerialMonitor } from './Components/SerialMonitor';
import { SerialSettings } from './Components/SerialSettings';
import { SerialFeatureSettings } from './Components/SerialFeatureSettings';
import { SendPanel } from './Components/SendPanel';
import { MultiSendPanel } from './Components/MultiSendPanel';
import {
  applyChecksum,
  previewChecksum,
  DEFAULT_CHECKSUM_CONFIG,
  type ChecksumConfig,
} from './checksum';
import { createAnsiConverter, highlightKeywords } from './ansi';
import {
  DEFAULT_RECEIVE_OPTIONS,
  DEFAULT_SERIAL_CONFIG,
  decodeSerialBytes,
  findByteSequence,
  logTimeFilterDuration,
  parseHexBytes,
  type DisplayOptions,
  type LogDirectionFilter,
  type LogExportFormat,
  type LogTimeFilter,
  type ReceiveOptions,
  type SerialPortConfig,
  type SerialProfile,
  type SerialProfileSnapshot,
} from './serialFeatures';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import {
  asRecord,
  optionalBoolean,
  optionalNumber,
  optionalString,
  registerAssistantContributor,
} from '../AIAssistant/assistantBridge';
import './SerialTool.css';

export type { DisplayOptions, SerialPortConfig } from './serialFeatures';

interface SerialToolProps {
  isActive?: boolean;
}

type SerialLayoutMode = 'single' | 'split-columns' | 'split-rows' | 'grid';

interface SerialSessionDescriptor {
  id: string;
  index: number;
}

interface SerialSessionMeta {
  port: string;
  connected: boolean;
  connecting: boolean;
}

interface SerialSessionProps {
  sessionId: string;
  compact: boolean;
  active: boolean;
  multiSendHost: HTMLDivElement | null;
  settingsHost: HTMLDivElement | null;
  onMetaChange: (sessionId: string, meta: SerialSessionMeta) => void;
  onReceiveActivity: (sessionId: string) => void;
  isPortInUse: (port: string, sessionId: string) => boolean;
}

interface SerialSessionHandle {
  disconnect: () => Promise<void>;
}

/** Extract a human-readable message from any thrown value (Error, IpcError object, or string). */
function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Format current time as [HH:MM:SS.mmm] */
function formatTimestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `[${h}:${m}:${s}.${ms}]`;
}

/** Convert byte array to space-separated hex string */
function bytesToHex(data: number[]): string {
  return data.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/**
 * Serial ports are byte streams, so OS read boundaries are not protocol frame
 * boundaries. Coalesce short bursts for display, but force a flush by latency
 * or size so a continuous stream is never held indefinitely.
 */
const RX_MAX_BATCH_BYTES = 4096;

/** Keep a bounded log while retaining enough recent data for display-mode rebuilds. */
const MAX_HISTORY_BYTES = 2 * 1024 * 1024;
const RETAINED_HISTORY_BYTES = 1536 * 1024;
const ASSISTANT_BAUD_RATES = [
  300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400, 460800, 921600, 1000000,
  1500000, 2000000, 3000000,
];

interface RawChunk {
  data: number[];
  isSent: boolean;
  displayByDefault: boolean;
  timestamp: string; // captured at arrival time
  receivedAt: number;
}

interface PendingReceive {
  data: number[];
  timestamp: string;
  receivedAt: number;
}

const SERIAL_PROFILES_KEY = 'serial-config-profiles-v1';
const SERIAL_PROFILES_CHANGED_EVENT = 'serial-config-profiles-changed';

function loadSerialProfiles(): SerialProfile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SERIAL_PROFILES_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((profile): profile is SerialProfile =>
      Boolean(
        profile &&
        typeof profile.id === 'string' &&
        typeof profile.name === 'string' &&
        profile.snapshot
      )
    );
  } catch {
    return [];
  }
}

function persistSerialProfiles(profiles: SerialProfile[]): void {
  localStorage.setItem(SERIAL_PROFILES_KEY, JSON.stringify(profiles));
  window.dispatchEvent(new CustomEvent(SERIAL_PROFILES_CHANGED_EVENT));
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const SerialSession = React.forwardRef<SerialSessionHandle, SerialSessionProps>(
  (
    {
      sessionId,
      compact,
      active,
      multiSendHost,
      settingsHost,
      onMetaChange,
      onReceiveActivity,
      isPortInUse,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [receivedText, setReceivedText] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [ports, setPorts] = useState<Array<{ name: string; description: string }>>([]);
    const [showTimestamp, setShowTimestamp] = useState(false);
    const [hexDisplay, setHexDisplay] = useState(false);
    const [ansiDisplay, setAnsiDisplay] = useState(false);
    const [checksumConfig, setChecksumConfig] = useState<ChecksumConfig>(DEFAULT_CHECKSUM_CONFIG);
    const [receiveOptions, setReceiveOptions] = useState<ReceiveOptions>(DEFAULT_RECEIVE_OPTIONS);
    const [sendText, setSendText] = useState('');
    const [sendHexMode, setSendHexMode] = useState(false);
    const [sendAppendNewline, setSendAppendNewline] = useState(true);
    const [settingsCollapsed, setSettingsCollapsed] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [canRestore, setCanRestore] = useState(false);
    const [displayPaused, setDisplayPaused] = useState(false);
    const [pausedBytes, setPausedBytes] = useState(0);
    const [lockToBottom, setLockToBottom] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [directionFilter, setDirectionFilter] = useState<LogDirectionFilter>('all');
    const [timeFilter, setTimeFilter] = useState<LogTimeFilter>('all');
    const [visibleEntryCount, setVisibleEntryCount] = useState(0);
    const [totalEntryCount, setTotalEntryCount] = useState(0);
    const [profiles, setProfiles] = useState<SerialProfile[]>(loadSerialProfiles);
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [profileName, setProfileName] = useState('');
    const unlistenRef = useRef<UnlistenFn | null>(null);
    const tRef = useRef(t);
    tRef.current = t;
    const refreshPortsRef = useRef<() => Promise<void>>(async () => {});
    const ansiConverterRef = useRef(createAnsiConverter());
    const txLineActiveRef = useRef(false);
    const rawChunksRef = useRef<RawChunk[]>([]);
    const clearedChunksRef = useRef<RawChunk[]>([]);
    const pendingReceiveRef = useRef<PendingReceive | null>(null);
    const receiveFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const receiveMaxLatencyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hexDisplayRef = useRef(hexDisplay);
    const ansiDisplayRef = useRef(ansiDisplay);
    const showTimestampRef = useRef(showTimestamp);
    const receiveOptionsRef = useRef(receiveOptions);
    const displayPausedRef = useRef(displayPaused);
    const searchQueryRef = useRef(deferredSearchQuery);
    const directionFilterRef = useRef(directionFilter);
    const timeFilterRef = useRef(timeFilter);
    const rawHistoryBytesRef = useRef(0);
    const openPortRef = useRef('');
    const disposedRef = useRef(false);
    const connectionAttemptRef = useRef(0);
    hexDisplayRef.current = hexDisplay;
    ansiDisplayRef.current = ansiDisplay;
    showTimestampRef.current = showTimestamp;
    receiveOptionsRef.current = receiveOptions;
    displayPausedRef.current = displayPaused;
    searchQueryRef.current = deferredSearchQuery;
    directionFilterRef.current = directionFilter;
    timeFilterRef.current = timeFilter;

    const [config, setConfig] = useState<SerialPortConfig>(DEFAULT_SERIAL_CONFIG);

    useEffect(() => {
      if (!active) return;
      return registerAssistantContributor({
        id: 'serial-active-session',
        tool: 'serial-tool',
        getContext: () => ({
          sessionId,
          connected,
          connecting,
          availablePorts: ports,
          config,
          send: {
            hexMode: sendHexMode,
            appendNewline: sendAppendNewline,
          },
          receive: receiveOptions,
          recentTraffic: rawChunksRef.current.slice(-32).map((chunk) => ({
            direction: chunk.isSent ? 'TX' : 'RX',
            timestamp: chunk.timestamp,
            byteCount: chunk.data.length,
            hex: bytesToHex(chunk.data.slice(0, 160)),
            text: decodeSerialBytes(chunk.data.slice(0, 160), receiveOptions.encoding, true),
            truncated: chunk.data.length > 160,
          })),
        }),
        supports: (action) => action.type === 'serial.configure',
        apply: (action) => {
          if (connected || connecting) throw new Error('请先断开串口，再应用新的串口配置');
          const payload = asRecord(action.payload);
          const port = optionalString(payload.port, 'port');
          const baudRate = optionalNumber(payload.baudRate, 'baudRate');
          const dataBits = optionalNumber(payload.dataBits, 'dataBits');
          const stopBits = optionalNumber(payload.stopBits, 'stopBits');
          const parity = optionalString(payload.parity, 'parity');
          const flowControl = optionalString(payload.flowControl, 'flowControl');
          const nextHexMode = optionalBoolean(payload.sendHexMode, 'sendHexMode');
          const appendNewline = optionalBoolean(payload.appendNewline, 'appendNewline');

          if (port !== undefined && port.length > 256) throw new Error('串口名称过长');
          if (baudRate !== undefined && !ASSISTANT_BAUD_RATES.includes(baudRate)) {
            throw new Error(`当前界面不支持波特率 ${baudRate}`);
          }
          if (dataBits !== undefined && ![5, 6, 7, 8].includes(dataBits)) {
            throw new Error('数据位必须是 5、6、7 或 8');
          }
          if (stopBits !== undefined && ![1, 2].includes(stopBits)) {
            throw new Error('停止位必须是 1 或 2');
          }
          if (parity !== undefined && !['none', 'odd', 'even'].includes(parity)) {
            throw new Error('校验位必须是 none、odd 或 even');
          }
          if (flowControl !== undefined && !['none', 'rts_cts', 'xon_xoff'].includes(flowControl)) {
            throw new Error('流控参数无效');
          }

          setConfig((current) => ({
            port: port ?? current.port,
            baudRate: Math.trunc(baudRate ?? current.baudRate),
            dataBits: Math.trunc(dataBits ?? current.dataBits),
            stopBits: Math.trunc(stopBits ?? current.stopBits),
            parity: parity ?? current.parity,
            flowControl: flowControl ?? current.flowControl,
          }));
          if (nextHexMode !== undefined) setSendHexMode(nextHexMode);
          if (appendNewline !== undefined) setSendAppendNewline(appendNewline);
          setSettingsCollapsed(false);
          return { message: '串口参数与发送格式' };
        },
      });
    }, [
      active,
      config,
      connected,
      connecting,
      ports,
      receiveOptions,
      sendAppendNewline,
      sendHexMode,
      sessionId,
    ]);

    const displayOptions: DisplayOptions = { showTimestamp, hexDisplay, ansiDisplay };

    useEffect(() => {
      onMetaChange(sessionId, {
        port: config.port,
        connected,
        connecting,
      });
    }, [config.port, connected, connecting, onMetaChange, sessionId]);

    // Compute checksum preview from current send text
    const checksumPreview = (() => {
      if (!checksumConfig.enabled || !sendText) return '';
      let text = sendText;
      if (!sendHexMode && sendAppendNewline) text += '\n';
      const bytes: number[] = sendHexMode
        ? (text
            .replace(/\s/g, '')
            .match(/.{1,2}/g)
            ?.map((s) => parseInt(s, 16))
            .filter((b) => !isNaN(b)) ?? [])
        : Array.from(new TextEncoder().encode(text));
      if (bytes.length === 0) return '';
      return previewChecksum(bytes, checksumConfig);
    })();

    /**
     * Convert a single raw chunk to display text using current options.
     *
     * Sent data (isSent=true) with timestamp: displayed immediately so the
     * user sees characters as they type. Only the first char after a newline
     * gets the prefix; subsequent chars append raw until Enter flushes.
     *
     * Received chunks are merged by a short idle gap before reaching this
     * formatter. HEX and ANSI processing are explicit user choices; plain text
     * mode escapes HTML only and never interprets received bytes as controls.
     */
    const formatChunk = useCallback(
      (
        chunk: RawChunk,
        ansiConv: ReturnType<typeof createAnsiConverter>,
        buffers: { txActive: { current: boolean } }
      ): string => {
        const { data, isSent, timestamp } = chunk;

        // Display mode is an explicit user choice; never guess binary data and
        // silently override text mode.
        const useHex = hexDisplayRef.current;

        if (useHex) {
          const hex = bytesToHex(data);
          if (showTimestampRef.current) {
            const prefix = isSent ? `${timestamp}发→◇ ` : `${timestamp}收←◆ `;
            return prefix + hex + '\n';
          }
          return hex + ' ';
        }

        // Decode only with the user-selected encoding. Control bytes remain
        // visible when requested, while ANSI ESC stays intact for the parser.
        const currentReceiveOptions = receiveOptionsRef.current;
        const raw = decodeSerialBytes(
          data,
          currentReceiveOptions.encoding,
          currentReceiveOptions.showInvisible,
          !isSent && ansiDisplayRef.current
        );
        if (!raw) return '';
        const renderReceivedText = (text: string) =>
          ansiDisplayRef.current ? highlightKeywords(ansiConv(text)) : escapeHtml(text);

        if (showTimestampRef.current) {
          if (isSent) {
            // Sent data: display immediately, no ANSI codes in user input
            let result = '';
            for (const ch of raw) {
              if (ch === '\n') {
                buffers.txActive.current = false;
                result += '\n';
              } else if (!buffers.txActive.current) {
                buffers.txActive.current = true;
                result += `${timestamp}发→◇${escapeHtml(ch)}`;
              } else {
                result += escapeHtml(ch);
              }
            }
            return result;
          }

          // Received data has already been grouped by the idle-gap collector.
          // Prefix every embedded text line and always terminate the record, so
          // devices that do not send a trailing newline are still visible.
          const prefix = `${timestamp}收←◆`;
          const textWithoutTrailingNewline = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
          return textWithoutTrailingNewline
            .split('\n')
            .map((line) => prefix + renderReceivedText(line) + '\n')
            .join('');
        }

        return renderReceivedText(raw);
      },
      []
    );

    const chunkMatchesFilters = useCallback(
      (chunk: RawChunk, includeHiddenSent = false): boolean => {
        const direction = directionFilterRef.current;
        if (direction === 'received' && chunk.isSent) return false;
        if (direction === 'sent' && !chunk.isSent) return false;
        if (!includeHiddenSent && chunk.isSent && !chunk.displayByDefault && direction !== 'sent') {
          return false;
        }

        const duration = logTimeFilterDuration(timeFilterRef.current);
        if (duration !== null && Date.now() - chunk.receivedAt > duration) return false;

        const query = searchQueryRef.current.trim().toLocaleLowerCase();
        if (!query) return true;
        const decoded = decodeSerialBytes(
          chunk.data,
          receiveOptionsRef.current.encoding,
          false
        ).toLocaleLowerCase();
        const hex = bytesToHex(chunk.data).toLocaleLowerCase();
        return decoded.includes(query) || hex.includes(query);
      },
      []
    );

    /**
     * Rebuild the entire display from all raw chunks.
     * Called when display mode (HEX/timestamp) changes.
     */
    const rebuildDisplay = useCallback(() => {
      const ansiConverter = createAnsiConverter();
      const buffers = { txActive: { current: false } };
      let result = '';
      let visibleCount = 0;
      for (const chunk of rawChunksRef.current) {
        if (!chunkMatchesFilters(chunk)) continue;
        result += formatChunk(chunk, ansiConverter, buffers);
        visibleCount += 1;
      }
      ansiConverterRef.current = ansiConverter;
      txLineActiveRef.current = buffers.txActive.current;
      setReceivedText(result);
      setVisibleEntryCount(visibleCount);
      setTotalEntryCount(rawChunksRef.current.length);
    }, [chunkMatchesFilters, formatChunk]);

    // Toggle handlers — rebuild display on change
    const handleToggleTimestamp = useCallback(() => {
      setShowTimestamp((v) => !v);
    }, []);

    const handleToggleHex = useCallback(() => {
      setHexDisplay((v) => !v);
    }, []);

    const handleToggleAnsi = useCallback(() => {
      setAnsiDisplay((v) => !v);
    }, []);

    // Rebuild when byte rendering or log filters change. Timestamp intentionally
    // affects future records only, matching terminal-style logging behavior.
    useEffect(() => {
      if (!displayPausedRef.current && rawChunksRef.current.length > 0) {
        rebuildDisplay();
      }
    }, [
      ansiDisplay,
      deferredSearchQuery,
      directionFilter,
      hexDisplay,
      rebuildDisplay,
      receiveOptions.encoding,
      receiveOptions.showInvisible,
      timeFilter,
    ]);

    useEffect(() => {
      if (timeFilter === 'all' || displayPaused) return;
      const timer = window.setInterval(rebuildDisplay, 5000);
      return () => window.clearInterval(timer);
    }, [displayPaused, rebuildDisplay, timeFilter]);

    useEffect(() => {
      const syncProfiles = () => setProfiles(loadSerialProfiles());
      window.addEventListener(SERIAL_PROFILES_CHANGED_EVENT, syncProfiles);
      return () => window.removeEventListener(SERIAL_PROFILES_CHANGED_EVENT, syncProfiles);
    }, []);

    /**
     * Process incoming byte data: store raw chunk + append formatted text.
     */
    const processReceived = useCallback(
      (
        data: number[],
        isSent: boolean,
        timestamp = formatTimestamp(),
        receivedAt = Date.now(),
        displayByDefault = true
      ) => {
        const chunk: RawChunk = {
          data,
          isSent,
          displayByDefault,
          timestamp,
          receivedAt,
        };
        rawChunksRef.current.push(chunk);
        rawHistoryBytesRef.current += data.length;
        setTotalEntryCount(rawChunksRef.current.length);

        // Keep recent raw history bounded. Trim with hysteresis so a busy port
        // does not trigger a full display rebuild for every incoming batch.
        if (rawHistoryBytesRef.current > MAX_HISTORY_BYTES) {
          let removeCount = 0;
          while (
            removeCount < rawChunksRef.current.length - 1 &&
            rawHistoryBytesRef.current > RETAINED_HISTORY_BYTES
          ) {
            rawHistoryBytesRef.current -= rawChunksRef.current[removeCount].data.length;
            removeCount += 1;
          }
          if (removeCount > 0) {
            rawChunksRef.current.splice(0, removeCount);
            setTotalEntryCount(rawChunksRef.current.length);
            if (!displayPausedRef.current) {
              rebuildDisplay();
              return;
            }
          }
        }

        if (displayPausedRef.current) {
          setPausedBytes((previous) => previous + data.length);
          return;
        }

        if (!chunkMatchesFilters(chunk)) return;

        const buffers = { txActive: txLineActiveRef };
        const text = formatChunk(chunk, ansiConverterRef.current, buffers);
        if (text) {
          setReceivedText((prev) => prev + text);
          setVisibleEntryCount((previous) => previous + 1);
        }
      },
      [chunkMatchesFilters, formatChunk, rebuildDisplay]
    );

    /** Flush one idle-delimited receive record into the display pipeline. */
    const flushPendingReceive = useCallback(() => {
      if (receiveFlushTimerRef.current) {
        clearTimeout(receiveFlushTimerRef.current);
        receiveFlushTimerRef.current = null;
      }
      if (receiveMaxLatencyTimerRef.current) {
        clearTimeout(receiveMaxLatencyTimerRef.current);
        receiveMaxLatencyTimerRef.current = null;
      }
      const pending = pendingReceiveRef.current;
      pendingReceiveRef.current = null;
      if (pending && pending.data.length > 0) {
        processReceived(pending.data, false, pending.timestamp, pending.receivedAt);
      }
    }, [processReceived]);

    /** Apply the selected framing rule to raw OS/Tauri read chunks. */
    const queueReceived = useCallback(
      (data: number[]) => {
        const options = receiveOptionsRef.current;
        if (options.frameMode === 'raw') {
          flushPendingReceive();
          processReceived(data, false);
          return;
        }

        if (options.frameMode === 'delimiter' && parseHexBytes(options.delimiterHex).length === 0) {
          // Invalid custom delimiters must never make received data disappear.
          flushPendingReceive();
          processReceived(data, false);
          return;
        }

        if (pendingReceiveRef.current) {
          pendingReceiveRef.current.data.push(...data);
        } else {
          const receivedAt = Date.now();
          pendingReceiveRef.current = {
            data: [...data],
            timestamp: formatTimestamp(),
            receivedAt,
          };
        }

        if (options.frameMode === 'idle') {
          if (!receiveMaxLatencyTimerRef.current) {
            const maxLatency = Math.min(Math.max(options.idleGapMs * 4, 250), 5000);
            receiveMaxLatencyTimerRef.current = setTimeout(flushPendingReceive, maxLatency);
          }
          if ((pendingReceiveRef.current?.data.length ?? 0) >= RX_MAX_BATCH_BYTES) {
            flushPendingReceive();
            return;
          }
          if (receiveFlushTimerRef.current) clearTimeout(receiveFlushTimerRef.current);
          receiveFlushTimerRef.current = setTimeout(flushPendingReceive, options.idleGapMs);
          return;
        }

        if (options.frameMode === 'fixed') {
          const frameLength = Math.max(1, Math.min(65535, options.fixedLength));
          while ((pendingReceiveRef.current?.data.length ?? 0) >= frameLength) {
            const pending = pendingReceiveRef.current;
            if (!pending) break;
            const frame = pending.data.splice(0, frameLength);
            processReceived(frame, false, pending.timestamp, pending.receivedAt);
            if (pending.data.length === 0) {
              pendingReceiveRef.current = null;
            } else {
              pending.timestamp = formatTimestamp();
              pending.receivedAt = Date.now();
            }
          }
          return;
        }

        const delimiter =
          options.frameMode === 'newline' ? [0x0a] : parseHexBytes(options.delimiterHex);
        let delimiterIndex = findByteSequence(pendingReceiveRef.current?.data ?? [], delimiter);
        while (pendingReceiveRef.current && delimiterIndex >= 0) {
          const pending = pendingReceiveRef.current;
          const frameLength = delimiterIndex + delimiter.length;
          const frame = pending.data.splice(0, frameLength);
          processReceived(frame, false, pending.timestamp, pending.receivedAt);
          if (pending.data.length === 0) {
            pendingReceiveRef.current = null;
            break;
          }
          pending.timestamp = formatTimestamp();
          pending.receivedAt = Date.now();
          delimiterIndex = findByteSequence(pending.data, delimiter);
        }

        if ((pendingReceiveRef.current?.data.length ?? 0) >= RX_MAX_BATCH_BYTES) {
          flushPendingReceive();
        }
      },
      [flushPendingReceive, processReceived]
    );

    const cancelPendingReceive = useCallback(() => {
      if (receiveFlushTimerRef.current) {
        clearTimeout(receiveFlushTimerRef.current);
        receiveFlushTimerRef.current = null;
      }
      if (receiveMaxLatencyTimerRef.current) {
        clearTimeout(receiveMaxLatencyTimerRef.current);
        receiveMaxLatencyTimerRef.current = null;
      }
      pendingReceiveRef.current = null;
    }, []);

    const handleReceiveOptionsChange = useCallback(
      (options: ReceiveOptions) => {
        flushPendingReceive();
        setReceiveOptions({
          ...options,
          idleGapMs: Math.max(1, Math.min(5000, options.idleGapMs || 1)),
          fixedLength: Math.max(1, Math.min(65535, options.fixedLength || 1)),
        });
      },
      [flushPendingReceive]
    );

    const stopListening = useCallback(() => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }, []);

    // Subscribe to serial data events
    const startListening = useCallback(async () => {
      if (unlistenRef.current) return;
      try {
        const unlisten = await subscribeEvent('serial-data-received', (payload) => {
          // SerialState can hold multiple ports (for example through the Python
          // HTTP API). Never mix another port's bytes into this terminal.
          if (payload.port !== config.port) return;
          // Empty data signals disconnection
          if (!payload.data || payload.data.length === 0) {
            flushPendingReceive();
            const portName = config.port;
            openPortRef.current = '';
            // Clean up Rust-side port state so it can be reopened
            invokeCommand('serial_close', { port: portName }).catch(() => {});
            setConnected(false);
            // Refresh port list first, then set error after it completes
            refreshPortsRef.current().finally(() => {
              setErrorMsg(tRef.current('serialTool.error.portDisconnected', { port: portName }));
            });
            stopListening();
            return;
          }
          onReceiveActivity(sessionId);
          queueReceived(payload.data);
        });
        unlistenRef.current = unlisten;
      } catch (e) {
        console.error('[SerialTool] Failed to subscribe to serial events:', e);
        throw e;
      }
    }, [
      config.port,
      flushPendingReceive,
      onReceiveActivity,
      queueReceived,
      sessionId,
      stopListening,
    ]);

    useEffect(() => {
      disposedRef.current = false;
      return () => {
        disposedRef.current = true;
        connectionAttemptRef.current += 1;
        cancelPendingReceive();
        stopListening();
        const port = openPortRef.current;
        openPortRef.current = '';
        if (port) {
          void invokeCommand('serial_close', { port }).catch(() => {});
        }
      };
    }, [cancelPendingReceive, stopListening]);

    const refreshPorts = useCallback(async () => {
      try {
        const list = await invokeCommand('serial_list_ports');
        setPorts(
          list.map((p) => ({
            name: p.name,
            description: p.description || p.manufacturer || p.name,
          }))
        );
        setConfig((prev) => {
          const lastPort = localStorage.getItem('serial-last-port');
          if (
            lastPort &&
            list.some((p) => p.name === lastPort) &&
            !isPortInUse(lastPort, sessionId)
          ) {
            return { ...prev, port: lastPort };
          }
          return prev;
        });
        if (list.length === 0) {
          setErrorMsg('No serial ports detected. Check device connection.');
        } else {
          setErrorMsg('');
        }
      } catch (e) {
        console.error('Failed to list ports:', e);
        setErrorMsg('Failed to enumerate serial ports.');
      }
    }, [isPortInUse, sessionId]);
    refreshPortsRef.current = refreshPorts;

    useEffect(() => {
      refreshPorts();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-refresh: poll for new serial devices every 2s when enabled and not connected
    useEffect(() => {
      if (!autoRefresh || connected) return;
      let prevPorts: string[] = [];
      const timer = setInterval(async () => {
        try {
          const list = await invokeCommand('serial_list_ports');
          const currentPorts = list.map((p) => p.name);
          const newPorts = currentPorts.filter((p) => !prevPorts.includes(p));
          const lastPort = localStorage.getItem('serial-last-port');
          // Auto-select only: last-used port (if reappeared) or a brand-new port
          setConfig((prev) => {
            if (
              lastPort &&
              currentPorts.includes(lastPort) &&
              prev.port !== lastPort &&
              !isPortInUse(lastPort, sessionId)
            ) {
              return { ...prev, port: lastPort };
            }
            const availableNewPort = newPorts.find((port) => !isPortInUse(port, sessionId));
            if (availableNewPort) {
              return { ...prev, port: availableNewPort };
            }
            // If current port disappeared, clear it
            if (!currentPorts.includes(prev.port)) {
              return { ...prev, port: '' };
            }
            return prev;
          });
          prevPorts = currentPorts;
          setPorts(
            list.map((p) => ({
              name: p.name,
              description: p.description || p.manufacturer || p.name,
            }))
          );
        } catch {
          /* ignore */
        }
      }, 2000);
      return () => clearInterval(timer);
    }, [autoRefresh, connected, isPortInUse, sessionId]);

    const handleOpen = useCallback(async () => {
      if (!config.port) return;
      if (isPortInUse(config.port, sessionId)) {
        setErrorMsg(t('serialTool.sessions.portInUse', { port: config.port }));
        return;
      }
      const attempt = connectionAttemptRef.current + 1;
      connectionAttemptRef.current = attempt;
      setErrorMsg('');
      setConnecting(true);
      try {
        // Subscribe before opening: some devices transmit immediately when the
        // port opens, so listening only after setConnected() can lose the first frame.
        await startListening();
        await invokeCommand('serial_open', {
          port: config.port,
          baudRate: config.baudRate,
          dataBits: config.dataBits,
          stopBits: config.stopBits,
          parity: config.parity,
          flowControl: config.flowControl,
        });
        if (disposedRef.current || connectionAttemptRef.current !== attempt) {
          await invokeCommand('serial_close', { port: config.port }).catch(() => {});
          return;
        }
        openPortRef.current = config.port;
        setConnected(true);
        localStorage.setItem('serial-last-port', config.port);
        txLineActiveRef.current = false;
        ansiConverterRef.current = createAnsiConverter();
      } catch (e: unknown) {
        stopListening();
        const raw = getErrorMessage(e);
        console.error('Failed to open port:', raw);
        const port = config.port;
        let friendlyMsg: string;
        if (raw.startsWith('PORT_BUSY:')) {
          friendlyMsg = t('serialTool.error.portBusy', { port });
        } else if (raw.startsWith('PORT_GONE:')) {
          friendlyMsg = t('serialTool.error.portGone', { port });
        } else if (raw.startsWith('PORT_ERROR:')) {
          const detail = raw.substring(raw.indexOf(':', 11) + 1);
          friendlyMsg = t('serialTool.error.portError', {
            port,
            detail: detail || t('serialTool.error.unknown'),
          });
        } else {
          friendlyMsg = t('serialTool.error.portGeneric', { port, message: raw });
        }
        if (!disposedRef.current && connectionAttemptRef.current === attempt) {
          setErrorMsg(friendlyMsg);
          setConnected(false);
        }
      } finally {
        if (!disposedRef.current && connectionAttemptRef.current === attempt) {
          setConnecting(false);
        }
      }
    }, [config, isPortInUse, sessionId, startListening, stopListening, t]);

    const handleClose = useCallback(async () => {
      connectionAttemptRef.current += 1;
      const port = openPortRef.current;
      openPortRef.current = '';
      try {
        if (port) {
          await invokeCommand('serial_close', { port });
        }
      } catch {
        // Ignore close errors
      }
      flushPendingReceive();
      stopListening();
      setConnected(false);
      setConnecting(false);
      setErrorMsg('');
    }, [flushPendingReceive, stopListening]);

    useImperativeHandle(ref, () => ({ disconnect: handleClose }), [handleClose]);

    const handleSend = useCallback(
      async (data: number[], skipEcho?: boolean, requestLocalEcho?: boolean) => {
        if (!connected || !config.port) return;
        try {
          // Apply checksum if enabled
          const finalData = applyChecksum(data, checksumConfig);
          await invokeCommand('serial_write', { port: config.port, data: finalData });
          // Always retain TX bytes for filtering/export. Keep the previous
          // terminal behavior by showing them only for timestamp/local echo.
          const displaySentData =
            !skipEcho && (showTimestampRef.current || Boolean(requestLocalEcho));
          processReceived(finalData, true, formatTimestamp(), Date.now(), displaySentData);
        } catch (e: unknown) {
          const msg = getErrorMessage(e);
          console.error('Send failed:', msg);
          setErrorMsg(`Send failed: ${msg}`);
        }
      },
      [connected, config.port, processReceived, checksumConfig]
    );

    const handleClear = useCallback(() => {
      if (rawChunksRef.current.length > 0) {
        clearedChunksRef.current = rawChunksRef.current.map((chunk) => ({
          ...chunk,
          data: [...chunk.data],
        }));
        setCanRestore(true);
      }
      setReceivedText('');
      cancelPendingReceive();
      rawChunksRef.current = [];
      rawHistoryBytesRef.current = 0;
      txLineActiveRef.current = false;
      setPausedBytes(0);
      setVisibleEntryCount(0);
      setTotalEntryCount(0);
    }, [cancelPendingReceive]);

    const handleRestore = useCallback(() => {
      rawChunksRef.current = clearedChunksRef.current.map((chunk) => ({
        ...chunk,
        data: [...chunk.data],
      }));
      rawHistoryBytesRef.current = rawChunksRef.current.reduce(
        (total, chunk) => total + chunk.data.length,
        0
      );
      displayPausedRef.current = false;
      setDisplayPaused(false);
      setPausedBytes(0);
      setCanRestore(false);
      rebuildDisplay();
    }, [rebuildDisplay]);

    const handleTogglePause = useCallback(() => {
      if (displayPausedRef.current) {
        displayPausedRef.current = false;
        setDisplayPaused(false);
        setPausedBytes(0);
        rebuildDisplay();
      } else {
        displayPausedRef.current = true;
        setDisplayPaused(true);
      }
    }, [rebuildDisplay]);

    /** Remove the last displayed character (for Backspace visual feedback) */
    const handleDeleteLastChar = useCallback(() => {
      setReceivedText((prev) => {
        if (prev.length === 0) return prev;
        if (prev.endsWith('\n')) return prev.slice(0, -1);
        return prev.slice(0, -1);
      });
    }, []);

    const handleExportLog = useCallback(
      async (format: LogExportFormat) => {
        const chunks = rawChunksRef.current.filter((chunk) => chunkMatchesFilters(chunk, true));
        if (chunks.length === 0) {
          setErrorMsg(t('serialTool.monitor.noLogData'));
          return;
        }

        const directionLabel = (chunk: RawChunk) =>
          chunk.isSent ? t('serialTool.monitor.sent') : t('serialTool.monitor.received');
        const decodeChunk = (chunk: RawChunk) =>
          decodeSerialBytes(
            chunk.data,
            receiveOptionsRef.current.encoding,
            receiveOptionsRef.current.showInvisible
          );

        let content: string;
        if (format === 'csv') {
          const rows = [
            ['timestamp', 'direction', 'length', 'hex', 'text'].join(','),
            ...chunks.map((chunk) =>
              [
                csvCell(chunk.timestamp.slice(1, -1)),
                csvCell(directionLabel(chunk)),
                csvCell(chunk.data.length),
                csvCell(bytesToHex(chunk.data)),
                csvCell(decodeChunk(chunk)),
              ].join(',')
            ),
          ];
          content = `\uFEFF${rows.join('\r\n')}`;
        } else if (format === 'hex') {
          content = chunks
            .map((chunk) => `${chunk.timestamp} ${directionLabel(chunk)} ${bytesToHex(chunk.data)}`)
            .join('\r\n');
        } else {
          content = chunks
            .map((chunk) => `${chunk.timestamp} ${directionLabel(chunk)} ${decodeChunk(chunk)}`)
            .join('\n');
        }

        const now = new Date();
        const pad = (value: number) => String(value).padStart(2, '0');
        const defaultName =
          `USBToolBox_serial_${now.getFullYear()}${pad(now.getMonth() + 1)}` +
          `${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}` +
          `${pad(now.getSeconds())}.${format}`;
        try {
          const path = await save({
            defaultPath: defaultName,
            filters: [
              {
                name: format.toUpperCase(),
                extensions: [format],
              },
            ],
          });
          if (path) {
            await writeTextFile(path, content);
            setErrorMsg('');
          }
        } catch (error) {
          console.error('Export serial log failed:', error);
          setErrorMsg(t('serialTool.monitor.exportFailed', { error: getErrorMessage(error) }));
        }
      },
      [chunkMatchesFilters, t]
    );

    const handleSelectProfile = useCallback(
      (profileId: string) => {
        setSelectedProfileId(profileId);
        const profile = profiles.find((item) => item.id === profileId);
        if (profile) setProfileName(profile.name);
      },
      [profiles]
    );

    const handleSaveProfile = useCallback(() => {
      const name = profileName.trim();
      if (!name) return;
      const snapshot: SerialProfileSnapshot = {
        config: { ...config },
        displayOptions: { showTimestamp, hexDisplay, ansiDisplay },
        receiveOptions: { ...receiveOptions },
        checksumConfig: { ...checksumConfig },
        sendText,
        sendHexMode,
        sendAppendNewline,
        autoRefresh,
        lockToBottom,
      };
      const existingId = selectedProfileId || `serial-profile-${Date.now()}`;
      const profile: SerialProfile = {
        id: existingId,
        name,
        updatedAt: Date.now(),
        snapshot,
      };
      const nextProfiles = profiles.some((item) => item.id === existingId)
        ? profiles.map((item) => (item.id === existingId ? profile : item))
        : [...profiles, profile];
      setProfiles(nextProfiles);
      setSelectedProfileId(existingId);
      persistSerialProfiles(nextProfiles);
    }, [
      ansiDisplay,
      autoRefresh,
      checksumConfig,
      config,
      hexDisplay,
      lockToBottom,
      profileName,
      profiles,
      receiveOptions,
      selectedProfileId,
      sendAppendNewline,
      sendHexMode,
      sendText,
      showTimestamp,
    ]);

    const handleLoadProfile = useCallback(() => {
      if (connected) return;
      const profile = profiles.find((item) => item.id === selectedProfileId);
      if (!profile) return;
      const snapshot = profile.snapshot;
      flushPendingReceive();
      setConfig({ ...DEFAULT_SERIAL_CONFIG, ...snapshot.config });
      setShowTimestamp(Boolean(snapshot.displayOptions?.showTimestamp));
      setHexDisplay(Boolean(snapshot.displayOptions?.hexDisplay));
      setAnsiDisplay(Boolean(snapshot.displayOptions?.ansiDisplay));
      setReceiveOptions({ ...DEFAULT_RECEIVE_OPTIONS, ...snapshot.receiveOptions });
      setChecksumConfig({ ...DEFAULT_CHECKSUM_CONFIG, ...snapshot.checksumConfig });
      setSendText(snapshot.sendText || '');
      setSendHexMode(Boolean(snapshot.sendHexMode));
      setSendAppendNewline(snapshot.sendAppendNewline !== false);
      setAutoRefresh(Boolean(snapshot.autoRefresh));
      setLockToBottom(snapshot.lockToBottom !== false);
      setProfileName(profile.name);
    }, [connected, flushPendingReceive, profiles, selectedProfileId]);

    const handleDeleteProfile = useCallback(() => {
      if (!selectedProfileId) return;
      const nextProfiles = profiles.filter((item) => item.id !== selectedProfileId);
      setProfiles(nextProfiles);
      setSelectedProfileId('');
      setProfileName('');
      persistSerialProfiles(nextProfiles);
    }, [profiles, selectedProfileId]);

    const multiSendControls = (
      <div className={`serial-session-multi-controls ${active ? 'active' : ''}`}>
        <MultiSendPanel onSend={handleSend} connected={connected} />
      </div>
    );

    const settingsControls = (
      <div className={`serial-session-settings-controls ${active ? 'active' : ''}`}>
        <div className={`serial-settings-section ${settingsCollapsed ? 'collapsed' : ''}`}>
          {settingsCollapsed ? (
            <button
              className="settings-collapse-btn"
              onClick={() => setSettingsCollapsed(false)}
              title="展开功能区"
            >
              <FontAwesomeIcon icon={faChevronUp} />
            </button>
          ) : (
            <>
              <button
                className="settings-collapse-btn"
                onClick={() => setSettingsCollapsed(true)}
                title="折叠功能区"
              >
                <FontAwesomeIcon icon={faChevronDown} />
              </button>
              <SerialSettings
                config={config}
                ports={ports}
                connected={connected}
                connecting={connecting}
                displayOptions={displayOptions}
                onConfigChange={setConfig}
                onOpen={handleOpen}
                onClose={handleClose}
                onRefresh={refreshPorts}
                autoRefresh={autoRefresh}
                onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
                onToggleTimestamp={handleToggleTimestamp}
                onToggleHex={handleToggleHex}
                onToggleAnsi={handleToggleAnsi}
                checksumConfig={checksumConfig}
                onChecksumChange={setChecksumConfig}
                onChecksumPreview={checksumPreview}
                sendText={sendText}
                sendHexMode={sendHexMode}
                sendAppendNewline={sendAppendNewline}
              />
              <SerialFeatureSettings
                receiveOptions={receiveOptions}
                onReceiveOptionsChange={handleReceiveOptionsChange}
                profiles={profiles}
                profileName={profileName}
                selectedProfileId={selectedProfileId}
                connected={connected}
                onProfileNameChange={setProfileName}
                onSelectProfile={handleSelectProfile}
                onSaveProfile={handleSaveProfile}
                onLoadProfile={handleLoadProfile}
                onDeleteProfile={handleDeleteProfile}
              />
              <SendPanel
                onSend={handleSend}
                connected={connected}
                sendText={sendText}
                sendHexMode={sendHexMode}
                sendAppendNewline={sendAppendNewline}
                onSendTextChange={setSendText}
                onSendHexModeChange={setSendHexMode}
                onSendAppendNewlineChange={setSendAppendNewline}
              />
            </>
          )}
        </div>
      </div>
    );

    return (
      <>
        <div className={`serial-tool serial-session ${compact ? 'serial-session--compact' : ''}`}>
          <div className="serial-main-row">
            <div className="serial-monitor-section">
              <SerialMonitor
                text={receivedText}
                errorMsg={errorMsg}
                onSend={handleSend}
                onClear={handleClear}
                onExportLog={handleExportLog}
                canRestore={canRestore}
                onRestore={handleRestore}
                onDeleteLastChar={handleDeleteLastChar}
                connected={connected}
                connecting={connecting}
                showTimestamp={showTimestamp}
                paused={displayPaused}
                pausedBytes={pausedBytes}
                onTogglePause={handleTogglePause}
                lockToBottom={lockToBottom}
                onToggleLockToBottom={() => setLockToBottom((value) => !value)}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                directionFilter={directionFilter}
                onDirectionFilterChange={setDirectionFilter}
                timeFilter={timeFilter}
                onTimeFilterChange={setTimeFilter}
                visibleEntryCount={visibleEntryCount}
                totalEntryCount={totalEntryCount}
              />
            </div>
          </div>
        </div>
        {multiSendHost && createPortal(multiSendControls, multiSendHost)}
        {settingsHost && createPortal(settingsControls, settingsHost)}
      </>
    );
  }
);

SerialSession.displayName = 'SerialSession';

function getPaneCount(mode: SerialLayoutMode): number {
  if (mode === 'grid') return 4;
  if (mode === 'single') return 1;
  return 2;
}

function buildPaneIds(
  mode: SerialLayoutMode,
  sessions: SerialSessionDescriptor[],
  activeId: string | null,
  preferredIds: Array<string | null> = []
): Array<string | null> {
  const availableIds = new Set(sessions.map((session) => session.id));
  const ordered = [activeId, ...preferredIds, ...sessions.map((session) => session.id)].filter(
    (id, index, values): id is string =>
      Boolean(id) && availableIds.has(id as string) && values.indexOf(id) === index
  );
  const result: Array<string | null> = ordered.slice(0, getPaneCount(mode));
  while (result.length < getPaneCount(mode)) result.push(null);
  return result;
}

export const SerialTool: React.FC<SerialToolProps> = ({ isActive = true }) => {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SerialSessionDescriptor[]>([
    { id: 'serial-session-1', index: 1 },
  ]);
  const [sessionMeta, setSessionMeta] = useState<Record<string, SerialSessionMeta>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>('serial-session-1');
  const [unreadSessionIds, setUnreadSessionIds] = useState<Set<string>>(() => new Set());
  const [layoutMode, setLayoutMode] = useState<SerialLayoutMode>('single');
  const [paneIds, setPaneIds] = useState<Array<string | null>>(['serial-session-1']);
  const nextSessionIndexRef = useRef(2);
  const sessionHandlesRef = useRef<Record<string, SerialSessionHandle | null>>({});
  const sessionMetaRef = useRef(sessionMeta);
  const activeSessionIdRef = useRef(activeSessionId);
  const [multiSendHost, setMultiSendHost] = useState<HTMLDivElement | null>(null);
  const [settingsHost, setSettingsHost] = useState<HTMLDivElement | null>(null);
  sessionMetaRef.current = sessionMeta;
  activeSessionIdRef.current = activeSessionId;

  const clearUnread = useCallback((sessionId: string) => {
    setUnreadSessionIds((previous) => {
      if (!previous.has(sessionId)) return previous;
      const next = new Set(previous);
      next.delete(sessionId);
      return next;
    });
  }, []);

  const handleReceiveActivity = useCallback((sessionId: string) => {
    if (activeSessionIdRef.current === sessionId) return;
    setUnreadSessionIds((previous) => {
      if (previous.has(sessionId)) return previous;
      const next = new Set(previous);
      next.add(sessionId);
      return next;
    });
  }, []);

  const handleMetaChange = useCallback((sessionId: string, meta: SerialSessionMeta) => {
    setSessionMeta((previous) => {
      const current = previous[sessionId];
      if (
        current?.port === meta.port &&
        current.connected === meta.connected &&
        current.connecting === meta.connecting
      ) {
        return previous;
      }
      return { ...previous, [sessionId]: meta };
    });
  }, []);

  const isPortInUse = useCallback((port: string, ownerSessionId: string) => {
    if (!port) return false;
    return Object.entries(sessionMetaRef.current).some(
      ([sessionId, meta]) =>
        sessionId !== ownerSessionId && meta.port === port && (meta.connected || meta.connecting)
    );
  }, []);

  const getSessionName = useCallback(
    (session: SerialSessionDescriptor) =>
      sessionMeta[session.id]?.port || t('serialTool.sessions.untitled', { index: session.index }),
    [sessionMeta, t]
  );

  const handleAddSession = useCallback(() => {
    const index = nextSessionIndexRef.current;
    nextSessionIndexRef.current += 1;
    const session = { id: `serial-session-${index}`, index };
    setSessions((previous) => [...previous, session]);
    activeSessionIdRef.current = session.id;
    setActiveSessionId(session.id);
    setLayoutMode('single');
    setPaneIds([session.id]);
  }, []);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      activeSessionIdRef.current = sessionId;
      clearUnread(sessionId);
      if (layoutMode === 'single') {
        setPaneIds([sessionId]);
      } else {
        setPaneIds((previous) => {
          if (previous.includes(sessionId)) return previous;
          const next = [...previous];
          let replaceIndex = activeSessionId ? next.indexOf(activeSessionId) : -1;
          if (replaceIndex < 0) replaceIndex = next.findIndex((id) => id === null);
          if (replaceIndex < 0) replaceIndex = 0;
          next[replaceIndex] = sessionId;
          return next;
        });
      }
      setActiveSessionId(sessionId);
    },
    [activeSessionId, clearUnread, layoutMode]
  );

  const handleLayoutChange = useCallback(
    (mode: SerialLayoutMode) => {
      setLayoutMode(mode);
      setPaneIds(buildPaneIds(mode, sessions, activeSessionId, paneIds));
    },
    [activeSessionId, paneIds, sessions]
  );

  const handleExpandSession = useCallback(
    (sessionId: string) => {
      activeSessionIdRef.current = sessionId;
      clearUnread(sessionId);
      setActiveSessionId(sessionId);
      setLayoutMode('single');
      setPaneIds([sessionId]);
    },
    [clearUnread]
  );

  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      await sessionHandlesRef.current[sessionId]?.disconnect();
      delete sessionHandlesRef.current[sessionId];

      const remaining = sessions.filter((session) => session.id !== sessionId);
      const nextActiveId =
        activeSessionId === sessionId
          ? (remaining.find((session) => paneIds.includes(session.id))?.id ??
            remaining[0]?.id ??
            null)
          : activeSessionId;

      setSessions(remaining);
      setSessionMeta((previous) => {
        const next = { ...previous };
        delete next[sessionId];
        return next;
      });
      setUnreadSessionIds((previous) => {
        if (!previous.has(sessionId)) return previous;
        const next = new Set(previous);
        next.delete(sessionId);
        return next;
      });
      activeSessionIdRef.current = nextActiveId;
      setActiveSessionId(nextActiveId);
      setPaneIds(
        buildPaneIds(
          layoutMode,
          remaining,
          nextActiveId,
          paneIds.filter((id) => id !== sessionId)
        )
      );
    },
    [activeSessionId, layoutMode, paneIds, sessions]
  );

  const compact = layoutMode !== 'single';
  const layoutActions: Array<{
    mode: SerialLayoutMode;
    icon: typeof faWindowMaximize;
    label: string;
  }> = [
    {
      mode: 'single',
      icon: faWindowMaximize,
      label: t('serialTool.sessions.single'),
    },
    {
      mode: 'split-columns',
      icon: faColumns,
      label: t('serialTool.sessions.splitColumns'),
    },
    {
      mode: 'split-rows',
      icon: faEquals,
      label: t('serialTool.sessions.splitRows'),
    },
    {
      mode: 'grid',
      icon: faTableCells,
      label: t('serialTool.sessions.grid'),
    },
  ];

  return (
    <div className={`serial-workbench ${isActive ? 'is-active' : ''}`}>
      <div className="serial-workbench-main-row">
        <div className="serial-monitor-workbench">
          <div className="serial-session-bar">
            <div className="serial-tabs" role="tablist">
              {sessions.map((session) => {
                const meta = sessionMeta[session.id];
                const name = getSessionName(session);
                const hasUnreadData = unreadSessionIds.has(session.id);
                return (
                  <button
                    key={session.id}
                    className={`serial-tab ${activeSessionId === session.id ? 'active' : ''} ${hasUnreadData ? 'unread' : ''}`}
                    onClick={() => handleSelectSession(session.id)}
                    role="tab"
                    aria-selected={activeSessionId === session.id}
                    title={hasUnreadData ? t('serialTool.sessions.dataReceived', { name }) : name}
                  >
                    <span
                      className={`serial-tab-led ${meta?.connected ? 'connected' : ''} ${meta?.connecting ? 'connecting' : ''}`}
                    />
                    <span className="serial-tab-name">{name}</span>
                    {hasUnreadData && (
                      <span
                        className="serial-tab-activity"
                        title={t('serialTool.sessions.dataReceived', { name })}
                      />
                    )}
                    <span
                      className="serial-tab-close"
                      role="button"
                      aria-label={t('serialTool.sessions.close', { name })}
                      title={t('serialTool.sessions.close', { name })}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCloseSession(session.id);
                      }}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </span>
                  </button>
                );
              })}
              <button
                className="serial-new-tab"
                onClick={handleAddSession}
                title={t('serialTool.sessions.new')}
                aria-label={t('serialTool.sessions.new')}
              >
                <FontAwesomeIcon icon={faPlus} />
              </button>
            </div>
            <div className="serial-layout-actions">
              {layoutActions.map((action) => (
                <button
                  key={action.mode}
                  className={`serial-layout-btn ${layoutMode === action.mode ? 'active' : ''}`}
                  onClick={() => handleLayoutChange(action.mode)}
                  title={action.label}
                  aria-label={action.label}
                >
                  <FontAwesomeIcon icon={action.icon} />
                </button>
              ))}
            </div>
          </div>

          <div className={`serial-workspace serial-workspace--${layoutMode}`}>
            {sessions.map((session) => {
              const paneIndex = paneIds.indexOf(session.id);
              const visible = paneIndex >= 0;
              const meta = sessionMeta[session.id];
              const name = getSessionName(session);
              return (
                <div
                  key={session.id}
                  className={`serial-pane ${visible ? '' : 'serial-pane--hidden'} ${activeSessionId === session.id ? 'active' : ''}`}
                  style={visible ? { order: paneIndex } : undefined}
                  onMouseDown={() => {
                    activeSessionIdRef.current = session.id;
                    clearUnread(session.id);
                    setActiveSessionId(session.id);
                  }}
                >
                  {compact && (
                    <div
                      className="serial-pane-header"
                      onDoubleClick={() => handleExpandSession(session.id)}
                    >
                      <span
                        className={`serial-tab-led ${meta?.connected ? 'connected' : ''} ${meta?.connecting ? 'connecting' : ''}`}
                      />
                      <span className="serial-pane-title">{name}</span>
                      <button
                        className="serial-pane-expand"
                        onClick={() => handleExpandSession(session.id)}
                        title={t('serialTool.sessions.expand')}
                        aria-label={t('serialTool.sessions.expand')}
                      >
                        <FontAwesomeIcon icon={faExpand} />
                      </button>
                    </div>
                  )}
                  <SerialSession
                    ref={(handle) => {
                      sessionHandlesRef.current[session.id] = handle;
                    }}
                    sessionId={session.id}
                    compact={compact}
                    active={activeSessionId === session.id}
                    multiSendHost={multiSendHost}
                    settingsHost={settingsHost}
                    onMetaChange={handleMetaChange}
                    onReceiveActivity={handleReceiveActivity}
                    isPortInUse={isPortInUse}
                  />
                </div>
              );
            })}
            {paneIds.map((sessionId, index) =>
              sessionId ? null : (
                <button
                  key={`empty-pane-${index}`}
                  className="serial-empty-pane"
                  style={{ order: index }}
                  onClick={handleAddSession}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  <span>{t('serialTool.sessions.emptyPane')}</span>
                </button>
              )
            )}
          </div>
        </div>
        <div className="serial-multi-send-host" ref={setMultiSendHost} />
      </div>
      <div className="serial-settings-host" ref={setSettingsHost} />
    </div>
  );
};
