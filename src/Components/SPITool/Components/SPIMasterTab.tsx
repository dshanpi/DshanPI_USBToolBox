import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invokeCommand } from '../../../Platform/IPC';
import { loadOledFont, renderTextToSSD1306Bytes, bytesToHex } from '../../../Library/SSD1306';
import {
  asRecord,
  optionalNumber,
  optionalString,
  registerAssistantContributor,
} from '../../AIAssistant/assistantBridge';

interface SPIMasterTabProps {
  connected: boolean;
  deviceIndex: number;
  /**
   * 预设按钮变体：
   *   'general' (默认) — 通用 SPI 调试场景，显示 TLC5615 DAC 等通用预设；
   *   'display' — SPI 点屏工具场景，显示 OLED/TFT 屏幕初始化预设（SSD1306, ST7796S 等）。
   * 不同变体使用同一个 SPI 引擎（连接、波形、单次传输、Loop 等都共享），
   * 仅切换工作流预设按钮的可见性，避免功能堆积让界面混乱。
   */
  presetVariant?: 'general' | 'display';
}

interface LogEntry {
  time: string;
  message: string;
  isError: boolean;
}

interface WorkflowStep {
  id: number;
  type:
    | 'cs_low'
    | 'cs_high'
    | 'dc_low'
    | 'dc_high'
    | 'send'
    | 'duplex'
    | 'delay'
    | 'reset_low'
    | 'reset_high';
  data: string; // hex data for send/duplex, delay µs for delay
  readLen: string; // for duplex
}

const SPEED_OPTIONS = [
  { label: '468.75 KHz', value: '0.46875', frequencyHz: 468_750 },
  { label: '937.5 KHz', value: '0.9375', frequencyHz: 937_500 },
  { label: '1.875 MHz', value: '1.875', frequencyHz: 1_875_000 },
  { label: '3.75 MHz', value: '3.75', frequencyHz: 3_750_000 },
  { label: '7.5 MHz', value: '7.5', frequencyHz: 7_500_000 },
  { label: '15 MHz', value: '15', frequencyHz: 15_000_000 },
  { label: '30 MHz', value: '30', frequencyHz: 30_000_000 },
  { label: '60 MHz', value: '60', frequencyHz: 60_000_000 },
];

const SPI_CS0_TRANSFER_CODE = 0x80;
const SPI_CS0_ENABLE_MASK = 0x0001;

function formatTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
}

function formatHex(bytes: number[]): string {
  return bytes.map((b) => '0x' + b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function parseHex(str: string): number[] {
  return str
    .trim()
    .split(/[\s,]+/)
    .map((s) => parseInt(s, 16))
    .filter((v) => !isNaN(v) && v >= 0);
}

/** Auto-format hex input: uppercase, strip non-hex chars, insert space every 2 chars. */
function formatHexInput(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  const parts = hex.match(/.{1,2}/g);
  return parts ? parts.join(' ') : '';
}

let nextStepId = 1;

// 历史上有一个 createTLC5615Workflow 把单帧 DAC 值打包成 send 步骤，
// 配合"直接 hex 输入 + Apply/MAX/MIN"按钮使用。按用户要求精简，
// 现在只保留呼吸灯（createTLC5615BreathingWorkflow），单帧写入用户可以直接
// "+ Send"+输入 hex 实现，不需要单独的预设。

/** Convert a 10-bit DAC value (0–1023) to TLC5615 hex string. */
function dacToHex(val: number): string {
  const shifted = (val & 0x3ff) << 2;
  const hi = (shifted >> 8) & 0xff;
  const lo = shifted & 0xff;
  return (
    hi.toString(16).padStart(2, '0').toUpperCase() +
    ' ' +
    lo.toString(16).padStart(2, '0').toUpperCase()
  );
}

/** Create breathing light workflow: ramp DAC up then down with delays.
 *  Each send step is followed by a delay so the eye can see the transition.
 *  Cycle: fade-in → hold bright → fade-out → hold dark → (loop with Loop button).
 *  @param stepsPerPhase  Number of brightness steps per fade direction.
 *  @param delayUs        Delay in microseconds between each step (default 15ms). */
function createTLC5615BreathingWorkflow(
  stepsPerPhase: number = 25,
  delayUs: number = 15000
): WorkflowStep[] {
  const wf: WorkflowStep[] = [];
  const maxVal = 1023;
  const minVal = 0;

  const addStep = (val: number) => {
    wf.push({ id: ++nextStepId, type: 'send', data: dacToHex(val), readLen: '' });
    wf.push({ id: ++nextStepId, type: 'delay', data: String(delayUs), readLen: '' });
  };

  // Fade in: min → max (sine ease-in)
  for (let i = 0; i <= stepsPerPhase; i++) {
    const t = i / stepsPerPhase;
    const eased = Math.sin((t * Math.PI) / 2);
    const val = Math.round(minVal + (maxVal - minVal) * eased);
    addStep(val);
  }

  // Hold bright
  for (let i = 0; i < 5; i++) addStep(maxVal);

  // Fade out: max → min (sine ease-out)
  for (let i = 0; i <= stepsPerPhase; i++) {
    const t = i / stepsPerPhase;
    const eased = Math.sin((t * Math.PI) / 2);
    const val = Math.round(maxVal - (maxVal - minVal) * eased);
    addStep(val);
  }

  // Hold dark
  for (let i = 0; i < 5; i++) addStep(minVal);

  return wf;
}

/** localStorage 中保存用户自定义预设的 key。general 变体专用，避免和 display 变体串味 */
const PRESET_STORAGE_KEY = 'spi-master-presets-general';

/** 用户预设的存储结构：name → 一组工作流 step（不含 id，加载时重新分配 id 避免冲突） */
interface SavedPreset {
  name: string;
  /** step 数组，不持久化 id，加载时由 nextStepId 现场分配 */
  steps: Array<Omit<WorkflowStep, 'id'>>;
}

/**
 * 内置预设清单。key 是下拉框的 value，nameKey 是 i18n 翻译键（用户可见标签经 t() 解析）。
 * builder() 返回包含 id 的完整 WorkflowStep[]，调用时 nextStepId 会被递增 —— 与原代码一致。
 */
const BUILTIN_PRESETS: Array<{ key: string; nameKey: string; builder: () => WorkflowStep[] }> = [
  {
    key: '__builtin:tlc5615-breathing',
    nameKey: 'serialTool.spi.master.presetTlc5615Breathing',
    builder: () => createTLC5615BreathingWorkflow(),
  },
];

/** 从 localStorage 读取用户预设列表，损坏时返回空。 */
function loadUserPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 简单字段校验，过滤掉脏数据
    return parsed.filter(
      (p): p is SavedPreset => p && typeof p.name === 'string' && Array.isArray(p.steps)
    );
  } catch {
    return [];
  }
}

/** 持久化用户预设列表。 */
function saveUserPresets(list: SavedPreset[]): void {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota or disabled */
  }
}

export const SPIMasterTab: React.FC<SPIMasterTabProps> = ({
  connected,
  deviceIndex,
  presetVariant = 'general',
}) => {
  const { t } = useTranslation();
  // SPI Config
  const [spiMode, setSpiMode] = useState('0');
  const [spiSpeed, setSpiSpeed] = useState('0.46875');
  const [spiBits, setSpiBits] = useState('8');
  const [spiBitOrder, setSpiBitOrder] = useState('1'); // 0=LSB, 1=MSB (default, matching CH347Demo)

  // Single-shot mode
  const [txData, setTxData] = useState('AA 55 12 34');
  const [readLen, setReadLen] = useState('8');
  const [outDefaultData, setOutDefaultData] = useState('FF');

  // TLC5615 DAC 直接写值已移除，只保留呼吸灯演示（见下方按钮的 createTLC5615BreathingWorkflow 调用）

  // Direct CS control state (like CH347Demo CS Active/Deactive)
  // null = unknown, false = Active/LOW, true = Deactive/HIGH
  const [csLevel, setCsLevel] = useState<boolean | null>(null);

  // Track whether SPI has been initialized (matches CH347Demo SpiIsCfg flag).
  // Once inited, Write/Read/Duplex do NOT re-init — just like CH347Demo where
  // CH347SpiStream directly calls CH347SPI_Write without re-initializing SPI.
  const spiConfiguredRef = useRef(false);

  // 设备断开（含自动连接场景下的热插拔断开）时复位 SPI 配置标志，
  // 这样重新连接后下一次操作会重新 ch347_spi_init，避免用到已失效的旧配置。
  // CH347 设备关闭/重开会导致 SPI 配置丢失，必须重新初始化。
  useEffect(() => {
    if (!connected) {
      spiConfiguredRef.current = false;
    }
  }, [connected]);

  // Workflow steps
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [selectedSteps, setSelectedSteps] = useState<Set<number>>(new Set());
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopCount, setLoopCount] = useState('1');
  const [loopCurrent, setLoopCurrent] = useState(0);

  // SSD1306 OLED 文字渲染输入：黄色区一行 + 蓝色区一行（中文/英文均可）
  const [oledYellowText, setOledYellowText] = useState('百问网 OLED');
  const [oledBlueText, setOledBlueText] = useState('SPI 测试 OK');
  const [oledFontSize, setOledFontSize] = useState('14');

  // 工作流预设系统：内置 + 用户保存。仅 'general' 变体使用，不影响显示屏预设。
  // 用户预设持久化到 localStorage（key=PRESET_STORAGE_KEY）
  const [userPresets, setUserPresets] = useState<SavedPreset[]>(() => loadUserPresets());
  // 下拉框当前选中的预设 key：内置以 '__builtin:' 开头，用户预设以 'user:<name>' 表示
  const [selectedPreset, setSelectedPreset] = useState<string>(BUILTIN_PRESETS[0]?.key ?? '');

  // 自定义弹窗状态 —— 替代 window.prompt/confirm，避免浏览器原生弹窗显示 "localhost:3030" 标题。
  // mode='prompt' 显示输入框；mode='confirm' 仅显示确认/取消按钮
  // resolve 在用户点击 OK/Cancel 时被调用，把结果返回给等待方（async/await 风格）
  interface ModalState {
    open: boolean;
    mode: 'prompt' | 'confirm';
    title: string;
    message?: string;
    defaultValue?: string;
    okText?: string;
    okDanger?: boolean;
    resolve?: (val: string | null) => void;
  }
  const [modal, setModal] = useState<ModalState>({ open: false, mode: 'prompt', title: '' });
  const [modalInput, setModalInput] = useState('');

  /**
   * 弹出输入框，返回 Promise<string|null>：
   *   - 用户输入并点 OK → resolve 输入字符串
   *   - 用户取消 / 点击空白 / ESC → resolve null
   */
  const showPrompt = useCallback(
    (title: string, defaultValue = '', message?: string): Promise<string | null> => {
      return new Promise((resolve) => {
        setModalInput(defaultValue);
        setModal({ open: true, mode: 'prompt', title, message, defaultValue, resolve });
      });
    },
    []
  );

  /** 弹出确认框，返回 Promise<boolean>。 */
  const showConfirm = useCallback(
    (
      title: string,
      message?: string,
      opts?: { okText?: string; okDanger?: boolean }
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        setModal({
          open: true,
          mode: 'confirm',
          title,
          message,
          okText: opts?.okText,
          okDanger: opts?.okDanger,
          resolve: (val) => resolve(val !== null),
        });
      });
    },
    []
  );

  /** 关闭弹窗并 resolve 结果。 */
  const closeModal = useCallback(
    (result: string | null) => {
      modal.resolve?.(result);
      setModal((m) => ({ ...m, open: false, resolve: undefined }));
    },
    [modal]
  );
  // Log
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: '--:--:--', message: t('serialTool.spi.master.logInit'), isError: false },
  ]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [logFontSize] = useState(12);

  const addLog = useCallback((msg: string, isErr = false) => {
    setLogs((prev) => {
      const next = [...prev, { time: formatTime(), message: msg, isError: isErr }];
      if (next.length > 200) next.shift();
      return next;
    });
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 10);
  }, []);

  useEffect(() => {
    return registerAssistantContributor({
      id: 'spi-master',
      tool: 'spi-tool',
      getContext: () => ({
        connected,
        deviceIndex,
        config: {
          mode: Number(spiMode),
          speed: spiSpeed,
          cs: 0,
          bits: Number(spiBits),
          bitOrder: spiBitOrder === '1' ? 'MSB' : 'LSB',
          txData,
          readLen: Number(readLen),
        },
        workflow: steps.map(({ type, data, readLen: stepReadLen }) => ({
          type,
          data,
          readLen: stepReadLen,
        })),
        recentLogs: logs.slice(-30),
      }),
      supports: (action) =>
        action.type === 'spi.configure' || action.type === 'spi.workflow.replace',
      apply: (action) => {
        const payload = asRecord(action.payload);
        if (action.type === 'spi.configure') {
          const mode = optionalNumber(payload.mode, 'mode');
          const speed = optionalString(payload.speed, 'speed');
          const cs = optionalNumber(payload.cs, 'cs');
          const bits = optionalNumber(payload.bits, 'bits');
          const bitOrder = optionalString(payload.bitOrder, 'bitOrder');
          const nextTxData = optionalString(payload.txData, 'txData');
          const nextReadLen = optionalNumber(payload.readLen, 'readLen');
          if (mode !== undefined && ![0, 1, 2, 3].includes(mode))
            throw new Error('SPI Mode 必须是 0–3');
          if (speed !== undefined && !SPEED_OPTIONS.some((item) => item.value === speed)) {
            throw new Error(`不支持的 SPI 速度：${speed}`);
          }
          if (cs !== undefined && cs !== 0) throw new Error('当前硬件仅支持 CS0');
          if (bits !== undefined && ![8, 16].includes(bits))
            throw new Error('数据位必须是 8 或 16');
          if (bitOrder !== undefined && !['MSB', 'LSB'].includes(bitOrder)) {
            throw new Error('位序必须是 MSB 或 LSB');
          }
          if (
            nextReadLen !== undefined &&
            (!Number.isInteger(nextReadLen) || nextReadLen < 1 || nextReadLen > 4096)
          ) {
            throw new Error('读取长度必须在 1–4096 之间');
          }
          if (
            nextTxData !== undefined &&
            nextTxData.trim() &&
            !/^(?:[0-9a-fA-F]{2})(?:[\s,]+[0-9a-fA-F]{2})*$/.test(nextTxData.trim())
          ) {
            throw new Error('发送数据必须是空格或逗号分隔的两位十六进制字节');
          }
          if (mode !== undefined) setSpiMode(String(mode));
          if (speed !== undefined) setSpiSpeed(speed);
          if (bits !== undefined) setSpiBits(String(bits));
          if (bitOrder !== undefined) setSpiBitOrder(bitOrder === 'MSB' ? '1' : '0');
          if (nextTxData !== undefined) setTxData(formatHexInput(nextTxData));
          if (nextReadLen !== undefined) setReadLen(String(Math.trunc(nextReadLen)));
          spiConfiguredRef.current = false;
          addLog('AI 助手已填入 SPI 配置；请检查后手动应用');
          return { message: 'SPI 配置' };
        }

        if (
          !Array.isArray(payload.steps) ||
          payload.steps.length < 1 ||
          payload.steps.length > 1000
        ) {
          throw new Error('SPI 工作流必须包含 1–1000 行');
        }
        const allowedTypes: WorkflowStep['type'][] = [
          'cs_low',
          'cs_high',
          'dc_low',
          'dc_high',
          'reset_low',
          'reset_high',
          'send',
          'duplex',
          'delay',
        ];
        const nextSteps: WorkflowStep[] = payload.steps.map((raw, index) => {
          const row = asRecord(raw, `steps[${index}]`);
          const type = optionalString(row.type, `steps[${index}].type`) as
            | WorkflowStep['type']
            | undefined;
          if (!type || !allowedTypes.includes(type))
            throw new Error(`第 ${index + 1} 行 SPI 类型无效`);
          const data = optionalString(row.data, `steps[${index}].data`) ?? '';
          const rowReadLen = optionalNumber(row.readLen, `steps[${index}].readLen`);
          if (
            (type === 'send' || type === 'duplex') &&
            !/^(?:[0-9a-fA-F]{2})(?:[\s,]+[0-9a-fA-F]{2})*$/.test(data.trim())
          ) {
            throw new Error(`第 ${index + 1} 行缺少有效的两位十六进制字节`);
          }
          if ((type === 'send' || type === 'duplex') && parseHex(data).length > 65_536) {
            throw new Error(`第 ${index + 1} 行发送数据超过 65536 字节`);
          }
          if (type === 'delay' && (!/^\d+$/.test(data.trim()) || Number(data) > 600_000_000)) {
            throw new Error(`第 ${index + 1} 行延时必须是 0–600000000 微秒的整数`);
          }
          if (
            rowReadLen !== undefined &&
            (!Number.isInteger(rowReadLen) || rowReadLen < 1 || rowReadLen > 4096)
          ) {
            throw new Error(`第 ${index + 1} 行读取长度必须在 1–4096 之间`);
          }
          return {
            id: nextStepId++,
            type,
            data: type === 'send' || type === 'duplex' ? formatHexInput(data) : data,
            readLen: rowReadLen === undefined ? '' : String(Math.trunc(rowReadLen)),
          };
        });
        setSteps(nextSteps);
        setSelectedSteps(new Set());
        addLog(`AI 助手已填入 ${nextSteps.length} 条 SPI 工作流；尚未执行`);
        return { message: `${nextSteps.length} 条 SPI 工作流` };
      },
    });
  }, [
    addLog,
    connected,
    deviceIndex,
    logs,
    readLen,
    spiBitOrder,
    spiBits,
    spiMode,
    spiSpeed,
    steps,
    txData,
  ]);

  const getTransferParams = useCallback(() => {
    const mode = parseInt(spiMode, 10);
    const speedOption = SPEED_OPTIONS.find((option) => option.value === spiSpeed);
    const frequencyHz = speedOption?.frequencyHz ?? 468_750;
    const speedMhz = Math.max(1, Math.round(frequencyHz / 1_000_000));
    const cs = SPI_CS0_TRANSFER_CODE;
    const dataBits = parseInt(spiBits, 10) as 8 | 16;
    const byteOrder = parseInt(spiBitOrder, 10);
    return { mode, speedMhz, frequencyHz, cs, dataBits, byteOrder };
  }, [spiMode, spiSpeed, spiBits, spiBitOrder]);

  // ─── SPI Init (reference: CH347Demo CH347InitSpi) ─────
  // Called ONCE after device open. Subsequent Write/Read/Duplex do NOT re-init
  // — exactly matching CH347Demo behavior where CH347SpiStream() directly calls
  // CH347SPI_Write without calling CH347SPI_Init again.

  const handleInitSpi = useCallback(async () => {
    if (!connected) {
      addLog(t('serialTool.spi.master.notConnected'), true);
      return;
    }
    try {
      const { mode, speedMhz, frequencyHz, cs, dataBits, byteOrder } = getTransferParams();
      // isAutoDeactiveCs: 0 = keep CS asserted across all bytes in multi-byte transfers.
      // This matches CH347Demo default (AutoDeactiveCS unchecked) and is required
      // for devices like TLC5615 DAC that need continuous 16-bit SPI frames.
      await invokeCommand('ch347_spi_init', {
        index: deviceIndex,
        mode,
        speedMhz,
        frequencyHz,
        cs,
        dataBits,
        byteOrder,
        outDefaultData: 0xff,
        isAutoDeactiveCs: 0,
      });
      // After init, set CS to idle HIGH. The user or workflow then controls CS manually.
      // This matches CH347Demo: Init → CS starts HIGH → user clicks CS Active to go LOW.
      await invokeCommand('ch347_spi_set_chip_select', {
        index: deviceIndex,
        enableSelect: SPI_CS0_ENABLE_MASK,
        chipSelect: SPI_CS0_ENABLE_MASK,
        isAutoDeactiveCs: 0,
        activeDelay: 0,
        delayDeactive: 0,
      });
      spiConfiguredRef.current = true;
      setCsLevel(true); // CS starts HIGH after init
      addLog(
        t('serialTool.spi.master.logSpiInit', {
          mode,
          freq: frequencyHz,
          cs: 0,
          bits: dataBits,
        })
      );
    } catch (e) {
      addLog(t('serialTool.spi.master.logSpiInitError', { error: (e as Error).message }), true);
    }
  }, [connected, deviceIndex, getTransferParams, addLog, t]);

  /// Ensure SPI is configured (auto-init once if not yet). Returns true if ready.
  const ensureSpiConfigured = useCallback(async (): Promise<boolean> => {
    if (!connected) {
      addLog(t('serialTool.spi.master.notConnected'), true);
      return false;
    }
    if (!spiConfiguredRef.current) {
      addLog(t('serialTool.spi.master.logAutoInit'));
      await handleInitSpi();
    }
    return spiConfiguredRef.current;
  }, [connected, handleInitSpi, addLog, t]);

  // ─── Direct CS Control (like CH347Demo "SPI片选控制") ────
  // Provides immediate CS Active (LOW) / Deactive (HIGH) without workflow steps.
  // CH347Demo reference: CH347SpiCsCtrl() in SpiIicDebug.cpp

  const handleCsActive = useCallback(async () => {
    if (!connected) {
      addLog(t('serialTool.spi.master.notConnected'), true);
      return;
    }
    try {
      if (!(await ensureSpiConfigured())) return;
      // chipSelect=0 → CS Active (LOW). Enable CS, no auto-deactive.
      await invokeCommand('ch347_spi_set_chip_select', {
        index: deviceIndex,
        enableSelect: SPI_CS0_ENABLE_MASK,
        chipSelect: 0,
        isAutoDeactiveCs: 0,
        activeDelay: 0,
        delayDeactive: 0,
      });
      setCsLevel(false);
      addLog(t('serialTool.spi.master.logCsLowActive'));
    } catch (e) {
      spiConfiguredRef.current = false;
      setCsLevel(null);
      addLog(t('serialTool.spi.master.logCsActiveError', { error: (e as Error).message }), true);
    }
  }, [connected, deviceIndex, ensureSpiConfigured, addLog, t]);

  const handleCsDeactive = useCallback(async () => {
    if (!connected) {
      addLog(t('serialTool.spi.master.notConnected'), true);
      return;
    }
    try {
      if (!(await ensureSpiConfigured())) return;
      // chipSelect=1 → CS Deactive (HIGH). Enable CS, no auto-deactive.
      await invokeCommand('ch347_spi_set_chip_select', {
        index: deviceIndex,
        enableSelect: SPI_CS0_ENABLE_MASK,
        chipSelect: SPI_CS0_ENABLE_MASK,
        isAutoDeactiveCs: 0,
        activeDelay: 0,
        delayDeactive: 0,
      });
      setCsLevel(true);
      addLog(t('serialTool.spi.master.logCsHighInactive'));
    } catch (e) {
      spiConfiguredRef.current = false;
      setCsLevel(null);
      addLog(t('serialTool.spi.master.logCsDeactiveError', { error: (e as Error).message }), true);
    }
  }, [connected, deviceIndex, ensureSpiConfigured, addLog, t]);

  // ─── Single-shot ────────────────────────────────────

  // ─── Single-shot transfers (no re-init — matches CH347Demo CH347SpiStream) ──

  const handleWrite = useCallback(async () => {
    if (!connected) {
      addLog(t('serialTool.spi.master.notConnected'), true);
      return;
    }
    const bytes = parseHex(txData);
    if (!bytes.length) {
      addLog(t('serialTool.spi.master.noData'), true);
      return;
    }
    if (!(await ensureSpiConfigured())) return;
    try {
      const params = getTransferParams();
      await invokeCommand('ch347_spi_write', { index: deviceIndex, txData: bytes, ...params });
      addLog(t('serialTool.spi.master.logWrite', { data: formatHex(bytes) }));
    } catch (e) {
      addLog(t('serialTool.spi.master.logError', { error: (e as Error).message }), true);
    }
  }, [connected, txData, deviceIndex, getTransferParams, ensureSpiConfigured, addLog, t]);

  const handleRead = useCallback(async () => {
    if (!connected) {
      addLog(t('serialTool.spi.master.notConnected'), true);
      return;
    }
    const len = parseInt(readLen, 10) || 1;
    if (!(await ensureSpiConfigured())) return;
    try {
      const params = getTransferParams();
      const rx = await invokeCommand('ch347_spi_read', {
        index: deviceIndex,
        readLen: len,
        ...params,
      });
      addLog(t('serialTool.spi.master.logRead', { len, data: formatHex(rx) }));
    } catch (e) {
      addLog(t('serialTool.spi.master.logError', { error: (e as Error).message }), true);
    }
  }, [connected, readLen, deviceIndex, getTransferParams, ensureSpiConfigured, addLog, t]);

  const handleDuplex = useCallback(async () => {
    if (!connected) {
      addLog(t('serialTool.spi.master.notConnected'), true);
      return;
    }
    const bytes = parseHex(txData);
    if (!bytes.length) {
      addLog(t('serialTool.spi.master.noData'), true);
      return;
    }
    if (!(await ensureSpiConfigured())) return;
    try {
      const params = getTransferParams();
      const rx = await invokeCommand('ch347_spi_transfer', {
        index: deviceIndex,
        txData: bytes,
        ...params,
      });
      addLog(t('serialTool.spi.master.logDuplex', { tx: formatHex(bytes), rx: formatHex(rx) }));
    } catch (e) {
      addLog(t('serialTool.spi.master.logError', { error: (e as Error).message }), true);
    }
  }, [connected, txData, deviceIndex, getTransferParams, ensureSpiConfigured, addLog, t]);

  // ─── Workflow ────────────────────────────────────────

  const addStep = useCallback((type: WorkflowStep['type']) => {
    setSteps((prev) => [...prev, { id: nextStepId++, type, data: '', readLen: '' }]);
  }, []);

  const deleteStep = useCallback((id: number) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    setSelectedSteps((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  }, []);

  const updateStep = useCallback((id: number, field: 'data' | 'readLen', val: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: val } : s)));
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedSteps((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selectAll = useCallback(() => setSelectedSteps(new Set(steps.map((s) => s.id))), [steps]);
  const deselectAll = useCallback(() => setSelectedSteps(new Set()), []);

  // ─── Step execution ──────────────────────────────────

  const execStep = useCallback(
    async (step: WorkflowStep) => {
      const params = getTransferParams();
      try {
        switch (step.type) {
          case 'cs_low':
            // SetChipSelect chipSelect=0 directly sets CS LOW (matches reference dialog behavior)
            await invokeCommand('ch347_spi_set_chip_select', {
              index: deviceIndex,
              enableSelect: SPI_CS0_ENABLE_MASK,
              chipSelect: 0,
              isAutoDeactiveCs: 0,
              activeDelay: 0,
              delayDeactive: 0,
            });
            setCsLevel(false);
            addLog(t('serialTool.spi.master.logCsLow'));
            break;
          case 'cs_high':
            // chipSelect=1 sets CS HIGH
            await invokeCommand('ch347_spi_set_chip_select', {
              index: deviceIndex,
              enableSelect: SPI_CS0_ENABLE_MASK,
              chipSelect: SPI_CS0_ENABLE_MASK,
              isAutoDeactiveCs: 0,
              activeDelay: 0,
              delayDeactive: 0,
            });
            setCsLevel(true);
            addLog(t('serialTool.spi.master.logCsHigh'));
            break;
          case 'send': {
            const bytes = parseHex(step.data);
            if (!bytes.length) {
              addLog(t('serialTool.spi.master.logStepNoSend'), true);
              return;
            }
            await invokeCommand('ch347_spi_write', {
              index: deviceIndex,
              txData: bytes,
              ...params,
            });
            addLog(t('serialTool.spi.master.logSend', { data: formatHex(bytes) }));
            break;
          }
          case 'duplex': {
            const bytes = parseHex(step.data);
            if (!bytes.length) {
              addLog(t('serialTool.spi.master.logStepNoDuplex'), true);
              return;
            }
            const rx = await invokeCommand('ch347_spi_transfer', {
              index: deviceIndex,
              txData: bytes,
              ...params,
            });
            addLog(
              t('serialTool.spi.master.logDuplex', { tx: formatHex(bytes), rx: formatHex(rx) })
            );
            break;
          }
          case 'dc_low':
            // GPIO4=DCX: LOW=command mode. bit4=0x10
            await invokeCommand('ch347_gpio_set', {
              index: deviceIndex,
              enable: 0x10,
              dirOut: 0x10,
              dataOut: 0x00,
            });
            addLog(t('serialTool.spi.master.logDcLow'));
            break;
          case 'dc_high':
            await invokeCommand('ch347_gpio_set', {
              index: deviceIndex,
              enable: 0x10,
              dirOut: 0x10,
              dataOut: 0x10,
            });
            addLog(t('serialTool.spi.master.logDcHigh'));
            break;
          case 'reset_low':
            // GPIO5=RESET: LOW=reset. bit5=0x20
            await invokeCommand('ch347_gpio_set', {
              index: deviceIndex,
              enable: 0x20,
              dirOut: 0x20,
              dataOut: 0x00,
            });
            addLog(t('serialTool.spi.master.logRstLow'));
            break;
          case 'reset_high':
            await invokeCommand('ch347_gpio_set', {
              index: deviceIndex,
              enable: 0x20,
              dirOut: 0x20,
              dataOut: 0x20,
            });
            addLog(t('serialTool.spi.master.logRstHigh'));
            break;
          case 'delay': {
            const us = parseInt(step.data, 10) || 0;
            if (us > 0) {
              await new Promise((r) => setTimeout(r, Math.max(1, us / 1000)));
            }
            addLog(t('serialTool.spi.master.logDelay', { us }));
            break;
          }
        }
      } catch (e) {
        addLog(t('serialTool.spi.master.logStepError', { error: (e as Error).message }), true);
      }
    },
    [deviceIndex, getTransferParams, addLog, t]
  );

  const runSelected = useCallback(async () => {
    const selected = steps.filter((s) => selectedSteps.has(s.id));
    if (!selected.length) {
      addLog(t('serialTool.spi.master.logNoStepsSelected'), true);
      return;
    }
    if (!(await ensureSpiConfigured())) return;
    for (const step of selected) await execStep(step);
  }, [steps, selectedSteps, execStep, ensureSpiConfigured, addLog, t]);

  const runAll = useCallback(async () => {
    if (!steps.length) {
      addLog(t('serialTool.spi.master.logNoSteps'), true);
      return;
    }
    if (!(await ensureSpiConfigured())) return;
    for (const step of steps) await execStep(step);
  }, [steps, execStep, ensureSpiConfigured, addLog, t]);

  const runningRef = useRef(false);

  const startLoop = useCallback(async () => {
    const selected = steps.filter((s) => selectedSteps.has(s.id));
    if (!selected.length) {
      addLog(t('serialTool.spi.master.logNoStepsSelected'), true);
      return;
    }
    const max = parseInt(loopCount, 10) || 1;
    setLoopEnabled(true);
    setLoopCurrent(0);
    runningRef.current = true;
    if (!(await ensureSpiConfigured())) return;
    let iter = 0;
    while (runningRef.current && iter < max) {
      for (let i = 0; i < selected.length && runningRef.current; i++) {
        setLoopCurrent(i);
        await execStep(selected[i]);
      }
      iter++;
      if (iter >= max) {
        addLog(t('serialTool.spi.master.logLoopCompleted', { n: max }));
        break;
      }
    }
    setLoopEnabled(false);
    setLoopCurrent(0);
    runningRef.current = false;
  }, [steps, selectedSteps, loopCount, execStep, ensureSpiConfigured, addLog, t]);

  const stopLoop = useCallback(() => {
    runningRef.current = false;
    setLoopEnabled(false);
    setLoopCurrent(0);
  }, []);

  // ─── TLC5615 preset ──────────────────────────────────
  // 之前有 applyTlc5615 / dacHex / 直接 hex 输入等，已按用户要求精简，
  // 现在只保留呼吸灯演示（直接在按钮 onClick 中调 createTLC5615BreathingWorkflow）。

  // ─── Log helpers ──────────────────────────────────────

  const logText = logs.map((e) => `[${e.time}] ${e.message}`).join('\n');

  // ─── 预设管理 ──────────────────────────────────────────
  // 应用预设 / 把当前 steps 另存为预设 / 删除当前选中的用户预设

  /** 应用预设（内置或用户）。直接覆盖 steps，清空选中集合。 */
  const applyPreset = useCallback(
    (key: string) => {
      if (!key) return;
      // 内置预设：直接调 builder 生成 step
      if (key.startsWith('__builtin:')) {
        const b = BUILTIN_PRESETS.find((p) => p.key === key);
        if (!b) return;
        setSteps(b.builder());
        setSelectedSteps(new Set());
        addLog(t('serialTool.spi.master.logPresetLoaded', { name: t(b.nameKey) }));
        return;
      }
      // 用户预设：key 形如 'user:<name>'
      if (key.startsWith('user:')) {
        const name = key.slice('user:'.length);
        const preset = userPresets.find((p) => p.name === name);
        if (!preset) {
          addLog(t('serialTool.spi.master.logPresetNotFound', { name }), true);
          return;
        }
        // 重新分配 id —— 持久化时丢掉了 id，加载时由 nextStepId 现场分配避免与现有 step 冲突
        const steps: WorkflowStep[] = preset.steps.map((s) => ({ ...s, id: ++nextStepId }));
        setSteps(steps);
        setSelectedSteps(new Set());
        addLog(t('serialTool.spi.master.logPresetLoadedUser', { name, count: steps.length }));
      }
    },
    [userPresets, addLog, t]
  );

  /** 把当前 steps 另存为用户预设。重名会询问是否覆盖。 */
  const saveCurrentAsPreset = useCallback(async () => {
    if (!steps.length) {
      addLog(t('serialTool.spi.master.logNoStepsToSave'), true);
      return;
    }
    const name = (
      await showPrompt(
        t('serialTool.spi.master.modalSaveAsTitle'),
        t('serialTool.spi.master.modalSaveAsDefault', { n: userPresets.length + 1 }),
        t('serialTool.spi.master.modalSaveAsMessage', { count: steps.length })
      )
    )?.trim();
    if (!name) return;
    const exists = userPresets.some((p) => p.name === name);
    if (
      exists &&
      !(await showConfirm(
        t('serialTool.spi.master.modalOverwriteTitle', { name }),
        t('serialTool.spi.master.modalOverwriteMessage'),
        { okText: t('serialTool.spi.master.modalOverwriteOk'), okDanger: true }
      ))
    )
      return;
    // 持久化时丢掉 id（运行时唯一的），保留 type/data/readLen
    const stripped: SavedPreset = {
      name,
      steps: steps.map(({ type, data, readLen }) => ({ type, data, readLen })),
    };
    const next = exists
      ? userPresets.map((p) => (p.name === name ? stripped : p))
      : [...userPresets, stripped];
    setUserPresets(next);
    saveUserPresets(next);
    setSelectedPreset(`user:${name}`);
    addLog(t('serialTool.spi.master.logPresetSaved', { name, count: stripped.steps.length }));
  }, [steps, userPresets, addLog, showPrompt, showConfirm, t]);

  /** 删除当前选中的用户预设（内置预设不可删）。 */
  const deleteSelectedPreset = useCallback(async () => {
    if (!selectedPreset.startsWith('user:')) {
      addLog(t('serialTool.spi.master.logBuiltinCannotDelete'), true);
      return;
    }
    const name = selectedPreset.slice('user:'.length);
    if (
      !(await showConfirm(
        t('serialTool.spi.master.modalDeleteTitle', { name }),
        t('serialTool.spi.master.modalDeleteMessage'),
        { okText: t('serialTool.spi.master.modalDeleteOk'), okDanger: true }
      ))
    )
      return;
    const next = userPresets.filter((p) => p.name !== name);
    setUserPresets(next);
    saveUserPresets(next);
    // 删完后选回第一个（内置或者第一个用户预设）
    setSelectedPreset(BUILTIN_PRESETS[0]?.key ?? (next[0] ? `user:${next[0].name}` : ''));
    addLog(t('serialTool.spi.master.logPresetDeleted', { name }));
  }, [selectedPreset, userPresets, addLog, showConfirm, t]);

  return (
    <div className="spi-master-layout">
      {/* Top: SPI Config — 移到设备选择下方，方便用户先确认 Mode/Speed/CS 再操作。
          原本有"SPI Config"标题和折叠按钮，按用户要求移除，永远展开常驻显示 */}
      <div className="spi-config-panel">
        <div className="spi-config-grid">
          <div className="config-group">
            <label className="config-label">{t('serialTool.spi.master.spiMode')}</label>
            <select
              className="config-select"
              value={spiMode}
              onChange={(e) => setSpiMode(e.target.value)}
            >
              <option value="0">{t('serialTool.spi.master.mode0')}</option>
              <option value="1">{t('serialTool.spi.master.mode1')}</option>
              <option value="2">{t('serialTool.spi.master.mode2')}</option>
              <option value="3">{t('serialTool.spi.master.mode3')}</option>
            </select>
          </div>
          <div className="config-group">
            <label className="config-label">{t('serialTool.spi.master.speed')}</label>
            <select
              className="config-select"
              value={spiSpeed}
              onChange={(e) => setSpiSpeed(e.target.value)}
            >
              {SPEED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="config-group">
            <label className="config-label">{t('serialTool.spi.master.cs')}</label>
            <select className="config-select" defaultValue="0" aria-label="CS0">
              <option value="0">{t('serialTool.spi.master.cs0')}</option>
            </select>
          </div>
          <div className="config-group">
            <label className="config-label">{t('serialTool.spi.master.bits')}</label>
            <select
              className="config-select"
              value={spiBits}
              onChange={(e) => setSpiBits(e.target.value)}
            >
              <option value="8">{t('serialTool.spi.master.bit8')}</option>
              <option value="16">{t('serialTool.spi.master.bit16')}</option>
            </select>
          </div>
          <div className="config-group">
            <label className="config-label">{t('serialTool.spi.master.bitOrder')}</label>
            <select
              className="config-select"
              value={spiBitOrder}
              onChange={(e) => setSpiBitOrder(e.target.value)}
            >
              <option value="1">{t('serialTool.spi.master.msb')}</option>
              <option value="0">{t('serialTool.spi.master.lsb')}</option>
            </select>
          </div>
          {/* Init SPI 按钮 — 紧贴 BitOrder 右侧，方便用户改完配置立刻按下让新参数生效 */}
          <div className="config-group spi-config-action">
            <label className="config-label">&nbsp;</label>
            <button className="i2c-btn primary" onClick={handleInitSpi} disabled={!connected}>
              {t('serialTool.spi.master.initSpi')}
            </button>
          </div>
        </div>
      </div>

      {/* Middle: Workflow (left) + Log (right) */}
      <div className="spi-master-middle">
        {/* Left: Workflow panel */}
        <div className="spi-workflow-panel">
          <div className="spi-panel-heading">
            <div className="spi-section-title">{t('serialTool.spi.master.workflow')}</div>
            <span className="spi-step-count">{steps.length}</span>
          </div>

          {/* 工作流预设区 —— 内置 + 用户自定义。
              下拉选择预设 → Load 应用到下方 steps。
              "另存为预设" 把当前 steps 持久化到 localStorage，下次进来还在。
              选中用户预设时显示"删除"按钮（内置预设不可删）。
              仅 'general' 变体显示；'display' 变体（SPI 点屏工具）有自己的预设按钮区，不混用 */}
          {presetVariant === 'general' && (
            <div className="spi-preset-bar">
              <label className="spi-preset-label">{t('serialTool.spi.master.preset')}</label>
              <select
                className="spi-preset-select"
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value)}
              >
                <optgroup label={t('serialTool.spi.master.builtinPresets')}>
                  {BUILTIN_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {t(p.nameKey)}
                    </option>
                  ))}
                </optgroup>
                {userPresets.length > 0 && (
                  <optgroup label={t('serialTool.spi.master.customPresets')}>
                    {userPresets.map((p) => (
                      <option key={`user:${p.name}`} value={`user:${p.name}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                className="spi-preset-btn primary"
                onClick={() => applyPreset(selectedPreset)}
                disabled={!selectedPreset}
              >
                {t('serialTool.spi.master.load')}
              </button>
              <button
                className="spi-preset-btn"
                onClick={saveCurrentAsPreset}
                disabled={!steps.length}
                title={t('serialTool.spi.master.saveAsTitle')}
              >
                {t('serialTool.spi.master.saveAs')}
              </button>
              {selectedPreset.startsWith('user:') && (
                <button
                  className="spi-preset-btn danger"
                  onClick={deleteSelectedPreset}
                  title={t('serialTool.spi.master.deleteTitle')}
                >
                  {t('serialTool.spi.master.delete')}
                </button>
              )}
            </div>
          )}

          {/* "+步骤" 工具栏 —— 按类别分组，视觉更整齐。
              - 数据组：Send（MOSI）/ Duplex（MOSI+MISO）
              - CS 组：CS Low / CS High
              - 控制组：DC / RST 各对低高电平
              - 延时：单独一个
              用 .spi-step-toolbar / .spi-btn-group 控制对齐和分隔线。
              CS 在 Single Transfer 面板有直接控制，这里仍保留方便插入到工作流序列中 */}
          <div className="spi-step-toolbar">
            <span className="spi-step-toolbar-label">{t('serialTool.spi.master.addStep')}</span>
            <div className="spi-btn-group">
              <button
                className="modbus-reg-btn"
                onClick={() => addStep('send')}
                title={t('serialTool.spi.master.stepSendTitle')}
              >
                {t('serialTool.spi.master.stepSend')}
              </button>
              <button
                className="modbus-reg-btn"
                onClick={() => addStep('duplex')}
                title={t('serialTool.spi.master.stepDuplexTitle')}
              >
                {t('serialTool.spi.master.stepDuplex')}
              </button>
            </div>
            <div className="spi-btn-group">
              <button
                className="modbus-reg-btn"
                onClick={() => addStep('cs_low')}
                title={t('serialTool.spi.master.stepCsLowTitle')}
              >
                {t('serialTool.spi.master.stepCsLow')}
              </button>
              <button
                className="modbus-reg-btn"
                onClick={() => addStep('cs_high')}
                title={t('serialTool.spi.master.stepCsHighTitle')}
              >
                {t('serialTool.spi.master.stepCsHigh')}
              </button>
            </div>
            <div className="spi-btn-group">
              <button
                className="modbus-reg-btn"
                onClick={() => addStep('dc_low')}
                title={t('serialTool.spi.master.stepDcLowTitle')}
              >
                {t('serialTool.spi.master.stepDcLow')}
              </button>
              <button
                className="modbus-reg-btn"
                onClick={() => addStep('dc_high')}
                title={t('serialTool.spi.master.stepDcHighTitle')}
              >
                {t('serialTool.spi.master.stepDcHigh')}
              </button>
            </div>
            <div className="spi-btn-group">
              <button
                className="modbus-reg-btn"
                onClick={() => addStep('reset_low')}
                title={t('serialTool.spi.master.stepRstLowTitle')}
              >
                {t('serialTool.spi.master.stepRstLow')}
              </button>
              <button
                className="modbus-reg-btn"
                onClick={() => addStep('reset_high')}
                title={t('serialTool.spi.master.stepRstHighTitle')}
              >
                {t('serialTool.spi.master.stepRstHigh')}
              </button>
            </div>
            <div className="spi-btn-group">
              <button
                className="modbus-reg-btn"
                onClick={() => addStep('delay')}
                title={t('serialTool.spi.master.stepDelayTitle')}
              >
                {t('serialTool.spi.master.stepDelay')}
              </button>
            </div>
          </div>

          {/* 显示屏预设按钮区 — 仅在 'display' 变体（SPI 点屏工具）下显示。
              包含 ST7796S TFT 初始化、SSD1306 OLED 快速测试、SSD1306 + TTF 中文渲染。
              单独一行，与"+步骤"工具栏分开 */}
          {presetVariant === 'display' && (
            <div className="spi-step-toolbar">
              <span className="spi-step-toolbar-label">
                {t('serialTool.spi.master.displayPresets')}
              </span>
              <div className="spi-btn-group">
                <button
                  className="i2c-btn"
                  onClick={() => {
                    // ST7796S full init sequence (ref: LVGL st7796 driver / Adafruit ST7796S).
                    // RES# hardwired to 3.3V, GPIO4→DCX, CS stays LOW for entire sequence.
                    const C = (c: string): WorkflowStep[] => [
                      { id: ++nextStepId, type: 'dc_low', data: '', readLen: '' },
                      { id: ++nextStepId, type: 'send', data: c, readLen: '' },
                    ];
                    const D = (d: string): WorkflowStep[] => [
                      { id: ++nextStepId, type: 'dc_high', data: '', readLen: '' },
                      { id: ++nextStepId, type: 'send', data: d, readLen: '' },
                    ];
                    const W = (t: number): WorkflowStep[] => [
                      { id: ++nextStepId, type: 'delay', data: String(t), readLen: '' },
                    ];
                    const steps: WorkflowStep[] = [
                      { id: ++nextStepId, type: 'cs_low', data: '', readLen: '' },
                      // --- Unlock extended command set ---
                      ...C('F0'),
                      ...D('C3'),
                      ...C('F0'),
                      ...D('96'),
                      // --- MADCTL: MX+MY+ML (landscape, mirror X/Y) ---
                      ...C('36'),
                      ...D('68'),
                      // --- Pixel Format: 16-bit RGB565 ---
                      ...C('3A'),
                      ...D('05'),
                      // --- Display Function Control ---
                      ...C('B6'),
                      ...D('00 02'),
                      // --- Blanking Porch Control ---
                      ...C('B5'),
                      ...D('02 03 00 04'),
                      // --- Frame Rate Control (in normal mode) ---
                      ...C('B1'),
                      ...D('80 10'),
                      // --- Display Inversion Control ---
                      ...C('B4'),
                      ...D('00'),
                      // --- Entry Mode ---
                      ...C('B7'),
                      ...D('C6'),
                      // --- VCOM Control ---
                      ...C('C5'),
                      ...D('24'),
                      // --- Panel Driving Setting ---
                      ...C('E8'),
                      ...D('40 8A 00 00 29 19 A5 33'),
                      // --- Power Control ---
                      ...C('C0'),
                      ...D('02'),
                      ...C('C1'),
                      ...D('01'),
                      ...C('C2'),
                      ...D('00'),
                      ...C('C3'),
                      ...D('01 22'),
                      ...C('C4'),
                      ...D('11'),
                      // --- Positive Gamma ---
                      ...C('E0'),
                      ...D('F0 09 13 12 12 2B 3C 44 4B 1B 18 17 1D 21'),
                      // --- Negative Gamma ---
                      ...C('E1'),
                      ...D('F0 09 13 0C 0D 27 3B 44 4D 0B 17 17 1D 21'),
                      // --- Lock extended command set ---
                      ...C('F0'),
                      ...D('C3'),
                      ...C('F0'),
                      ...D('69'),
                      // --- Normal Display Mode ---
                      ...C('13'),
                      // --- Sleep Out + wait ---
                      ...C('11'),
                      ...W(120000),
                      // --- Display ON + wait ---
                      ...C('29'),
                      ...W(50000),
                      // --- Set window: 320×480 ---
                      ...C('2A'),
                      ...D('00 00 01 3F'),
                      ...C('2B'),
                      ...D('00 00 01 DF'),
                      // --- Memory Write → red pixels (RGB565 F800) ---
                      ...C('2C'),
                      ...D(Array(200).fill('F8 00').join(' ')),
                      { id: ++nextStepId, type: 'cs_high', data: '', readLen: '' },
                    ];
                    setSteps(steps);
                    setSelectedSteps(new Set());
                    addLog(t('serialTool.spi.master.logSt7796sInit'));
                  }}
                  style={{ fontSize: 11, padding: '4px 10px', marginTop: 4 }}
                >
                  {t('serialTool.spi.master.st7796sTest')}
                </button>

                <button
                  className="i2c-btn"
                  onClick={() => {
                    const steps: WorkflowStep[] = [
                      { id: ++nextStepId, type: 'cs_low', data: '', readLen: '' },
                      { id: ++nextStepId, type: 'dc_low', data: '', readLen: '' },
                      { id: ++nextStepId, type: 'send', data: '8D', readLen: '' },
                      { id: ++nextStepId, type: 'dc_low', data: '', readLen: '' },
                      { id: ++nextStepId, type: 'send', data: '14', readLen: '' },
                      { id: ++nextStepId, type: 'dc_low', data: '', readLen: '' },
                      { id: ++nextStepId, type: 'send', data: 'AF', readLen: '' },
                      { id: ++nextStepId, type: 'dc_low', data: '', readLen: '' },
                      { id: ++nextStepId, type: 'send', data: 'A5', readLen: '' }, // Force all pixels ON
                      { id: ++nextStepId, type: 'cs_high', data: '', readLen: '' },
                    ];
                    setSteps(steps);
                    setSelectedSteps(new Set());
                    addLog(t('serialTool.spi.master.logOledQuickTest'));
                  }}
                  style={{ fontSize: 11, padding: '4px 10px', marginTop: 4 }}
                >
                  {t('serialTool.spi.master.oledQuickTest')}
                </button>

                {/* OLED 文字输入面板 — 中英日韩等任意 Unicode，使用 Source Han Sans SC TTF 字体渲染。
                width: '100%' 让此面板在 flex-wrap 工具栏中独占一行。 */}
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    width: '100%',
                    marginTop: 4,
                    padding: '4px 6px',
                    background: 'var(--color-surface-subtle, rgba(127,127,127,0.08))',
                    border: '1px solid var(--color-border-subtle, rgba(127,127,127,0.2))',
                    borderRadius: 4,
                  }}
                >
                  <span style={{ fontSize: 10, opacity: 0.7, whiteSpace: 'nowrap' }}>
                    {t('serialTool.spi.master.oledYellow')}
                  </span>
                  <input
                    type="text"
                    value={oledYellowText}
                    onChange={(e) => setOledYellowText(e.target.value)}
                    placeholder={t('serialTool.spi.master.oledYellowPlaceholder')}
                    title={t('serialTool.spi.master.oledYellowTitle')}
                    style={{ flex: '1 1 120px', minWidth: 80, fontSize: 11, padding: '2px 6px' }}
                  />
                  <span style={{ fontSize: 10, opacity: 0.7, whiteSpace: 'nowrap' }}>
                    {t('serialTool.spi.master.oledBlue')}
                  </span>
                  <input
                    type="text"
                    value={oledBlueText}
                    onChange={(e) => setOledBlueText(e.target.value)}
                    placeholder={t('serialTool.spi.master.oledBluePlaceholder')}
                    title={t('serialTool.spi.master.oledBlueTitle')}
                    style={{ flex: '1 1 120px', minWidth: 80, fontSize: 11, padding: '2px 6px' }}
                  />
                  <span style={{ fontSize: 10, opacity: 0.7, whiteSpace: 'nowrap' }}>
                    {t('serialTool.spi.master.fontSize')}
                  </span>
                  <input
                    type="number"
                    value={oledFontSize}
                    onChange={(e) => setOledFontSize(e.target.value)}
                    min="8"
                    max="24"
                    title={t('serialTool.spi.master.fontSizeTitle')}
                    style={{ width: 44, fontSize: 11, padding: '2px 6px' }}
                  />
                </div>

                <button
                  className="i2c-btn"
                  onClick={async () => {
                    // SSD1306 128x64 OLED 初始化 + 用 TTF 字体（Source Han Sans SC）渲染中英文文字。
                    // 黄色区 (page 0-1, 16px 高) 显示用户输入的第一行文字；
                    // 蓝色区 page 4-5 (16px 高) 显示第二行；其余 page 清屏。
                    // 字体通过 src/Components/SPITool/lib/ssd1306Font.ts 加载，
                    // 用 Canvas 绘制后阈值化转 1-bit，再按 SSD1306 page-column 字节布局打包。
                    try {
                      await loadOledFont();
                    } catch (e) {
                      addLog(
                        t('serialTool.spi.master.logOledFontError', {
                          error: (e as Error).message,
                        }),
                        true
                      );
                      return;
                    }

                    const C = (c: string): WorkflowStep[] => [
                      { id: ++nextStepId, type: 'dc_low', data: '', readLen: '' },
                      { id: ++nextStepId, type: 'send', data: c, readLen: '' },
                    ];
                    const D = (d: string): WorkflowStep[] => [
                      { id: ++nextStepId, type: 'dc_high', data: '', readLen: '' },
                      { id: ++nextStepId, type: 'send', data: d, readLen: '' },
                    ];
                    const W = (t: number): WorkflowStep[] => [
                      { id: ++nextStepId, type: 'delay', data: String(t), readLen: '' },
                    ];

                    // 字号限制在 8-24 像素之间，超出就用默认 14
                    const fs = Math.max(8, Math.min(24, parseInt(oledFontSize) || 14));
                    // 黄色区文字渲染（128×16 = 2 page，每 page 128 字节）
                    const yellowBytes = renderTextToSSD1306Bytes(oledYellowText, {
                      width: 128,
                      height: 16,
                      fontSize: fs,
                    });
                    // 蓝色区文字渲染（同样 2 page）
                    const blueBytes = renderTextToSSD1306Bytes(oledBlueText, {
                      width: 128,
                      height: 16,
                      fontSize: fs,
                    });
                    // 清屏 page = 128 字节全 0
                    const blankHex = bytesToHex(new Array(128).fill(0));

                    const steps: WorkflowStep[] = [
                      ...W(100000),
                      { id: ++nextStepId, type: 'cs_low', data: '', readLen: '' },
                      // --- SSD1306 初始化序列（参考 UG-2864TMBEG01 SPEC）---
                      // AE=显示关闭, A8 3F=MUX 1/64, D3 00=显示偏移=0, 40=起始行=0,
                      // A1=段映射(列翻转), C8=COM 扫描翻转, DA 12=COM 引脚硬件配置(交替),
                      // 81 7F=对比度, A4=GDDRAM 输出, A6=正常显示, D5 00=时钟分频,
                      // 8D 14=电荷泵开启, AF=显示开启
                      ...C('AE'),
                      ...C('A8'),
                      ...C('3F'),
                      ...C('D3'),
                      ...C('00'),
                      ...C('40'),
                      ...C('A1'),
                      ...C('C8'),
                      ...C('DA'),
                      ...C('12'),
                      ...C('81'),
                      ...C('7F'),
                      ...C('A4'),
                      ...C('A6'),
                      ...C('D5'),
                      ...C('00'),
                      ...C('8D'),
                      ...C('14'),
                      ...C('AF'),
                      ...W(20000),

                      // Page 0-1：黄色区（前 16 行像素），显示第一行 TTF 文字
                      ...C('B0'),
                      ...C('00'),
                      ...C('10'),
                      ...D(bytesToHex(yellowBytes.slice(0, 128))),
                      ...C('B1'),
                      ...C('00'),
                      ...C('10'),
                      ...D(bytesToHex(yellowBytes.slice(128, 256))),

                      // Page 2-3：蓝色区上半，留空（隔开两行文字，视觉更清爽）
                      ...C('B2'),
                      ...C('00'),
                      ...C('10'),
                      ...D(blankHex),
                      ...C('B3'),
                      ...C('00'),
                      ...C('10'),
                      ...D(blankHex),

                      // Page 4-5：蓝色区中部，显示第二行 TTF 文字
                      ...C('B4'),
                      ...C('00'),
                      ...C('10'),
                      ...D(bytesToHex(blueBytes.slice(0, 128))),
                      ...C('B5'),
                      ...C('00'),
                      ...C('10'),
                      ...D(bytesToHex(blueBytes.slice(128, 256))),

                      // Page 6-7：蓝色区下半，留空
                      ...C('B6'),
                      ...C('00'),
                      ...C('10'),
                      ...D(blankHex),
                      ...C('B7'),
                      ...C('00'),
                      ...C('10'),
                      ...D(blankHex),

                      { id: ++nextStepId, type: 'cs_high', data: '', readLen: '' },
                    ];
                    setSteps(steps);
                    setSelectedSteps(new Set());
                    addLog(
                      t('serialTool.spi.master.logSsd1306Init', {
                        yellow: oledYellowText,
                        blue: oledBlueText,
                        size: fs,
                      })
                    );
                  }}
                  style={{ fontSize: 11, padding: '4px 10px', marginTop: 4 }}
                >
                  {t('serialTool.spi.master.ssd1306Init')}
                </button>
              </div>
            </div>
          )}

          {/* Step list — 表格布局（仿 SPIDisplayTool 初始化命令表）：
              # | 类型(下拉) | 数据 | 删除。保留勾选框（运行 Selected）和 active 高亮。
              表头第一列是"全选"主控勾选框 —— 全选/全不选不再用单独按钮 */}
          <div className="spi-step-table">
            <table>
              <thead>
                <tr>
                  <th className="col-check">
                    {/* 主控全选 checkbox：
                        - 0 步骤被选中 → unchecked
                        - 全部被选中  → checked
                        - 部分被选中  → indeterminate（半选状态，点击会全选）
                        通过 ref callback 设置 indeterminate（React 不支持作为 prop） */}
                    <input
                      type="checkbox"
                      className="modbus-advanced-checkbox"
                      checked={steps.length > 0 && selectedSteps.size === steps.length}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            selectedSteps.size > 0 && selectedSteps.size < steps.length;
                      }}
                      disabled={!steps.length}
                      onChange={(e) => {
                        if (e.target.checked) selectAll();
                        else deselectAll();
                      }}
                      title={
                        selectedSteps.size === steps.length
                          ? t('serialTool.spi.master.deselectAllTitle')
                          : t('serialTool.spi.master.selectAllTitle')
                      }
                    />
                  </th>
                  <th className="col-num">{t('serialTool.spi.master.colNum')}</th>
                  <th className="col-type">{t('serialTool.spi.master.colType')}</th>
                  <th>{t('serialTool.spi.master.colData')}</th>
                  <th className="col-actions">
                    {/* 清空按钮：删除所有步骤 + 清空选中集合。
                        二次确认避免误操作 —— 用户已经填了一堆步骤再误点就很痛苦 */}
                    <button
                      className="spi-step-del"
                      disabled={!steps.length}
                      onClick={async () => {
                        if (steps.length === 0) return;
                        if (
                          !(await showConfirm(
                            t('serialTool.spi.master.modalClearTitle'),
                            t('serialTool.spi.master.modalClearMessage', { count: steps.length }),
                            { okText: t('serialTool.spi.master.modalClearOk'), okDanger: true }
                          ))
                        )
                          return;
                        const n = steps.length;
                        setSteps([]);
                        setSelectedSteps(new Set());
                        addLog(t('serialTool.spi.master.logCleared', { n }));
                      }}
                      title={t('serialTool.spi.master.clearTitle')}
                    >
                      {t('serialTool.spi.master.clear')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {steps.map((step, idx) => {
                  const sel = selectedSteps.has(step.id);
                  const active = loopEnabled && idx === loopCurrent;
                  // 几种 GPIO 切换类型没有数据负载，渲染只读提示文字保持列对齐
                  const isGpioToggle =
                    step.type === 'cs_low' ||
                    step.type === 'cs_high' ||
                    step.type === 'dc_low' ||
                    step.type === 'dc_high' ||
                    step.type === 'reset_low' ||
                    step.type === 'reset_high';
                  return (
                    <tr
                      key={step.id}
                      className={`${sel ? 'selected' : ''} ${active ? 'active' : ''}`}
                      data-step-type={step.type}
                    >
                      <td className="col-check">
                        <input
                          type="checkbox"
                          className="modbus-advanced-checkbox"
                          checked={sel}
                          onChange={() => toggleSelect(step.id)}
                        />
                      </td>
                      <td className="col-num">{idx + 1}</td>
                      <td className="col-type">
                        <select
                          value={step.type}
                          onChange={(e) =>
                            setSteps((prev) =>
                              prev.map((s) =>
                                s.id === step.id
                                  ? {
                                      ...s,
                                      type: e.target.value as WorkflowStep['type'],
                                      data: '',
                                      readLen: '',
                                    }
                                  : s
                              )
                            )
                          }
                        >
                          <option value="send">{t('serialTool.spi.master.typeSend')}</option>
                          <option value="duplex">{t('serialTool.spi.master.typeDuplex')}</option>
                          <option value="cs_low">{t('serialTool.spi.master.typeCsLow')}</option>
                          <option value="cs_high">{t('serialTool.spi.master.typeCsHigh')}</option>
                          <option value="dc_low">{t('serialTool.spi.master.typeDcLow')}</option>
                          <option value="dc_high">{t('serialTool.spi.master.typeDcHigh')}</option>
                          <option value="reset_low">{t('serialTool.spi.master.typeRstLow')}</option>
                          <option value="reset_high">
                            {t('serialTool.spi.master.typeRstHigh')}
                          </option>
                          <option value="delay">{t('serialTool.spi.master.typeDelay')}</option>
                        </select>
                      </td>
                      <td>
                        {(step.type === 'send' || step.type === 'duplex') && (
                          <input
                            className="spi-step-input"
                            type="text"
                            value={step.data}
                            onChange={(e) =>
                              updateStep(step.id, 'data', formatHexInput(e.target.value))
                            }
                            placeholder={t('serialTool.spi.master.dataPlaceholder')}
                          />
                        )}
                        {step.type === 'delay' && (
                          <div className="spi-step-data-with-unit">
                            <input
                              className="spi-step-input"
                              type="number"
                              value={step.data}
                              onChange={(e) => updateStep(step.id, 'data', e.target.value)}
                              placeholder={t('serialTool.spi.master.delayPlaceholder')}
                            />
                            <span className="spi-step-unit">
                              {t('serialTool.spi.master.delayUnit')}
                            </span>
                          </div>
                        )}
                        {isGpioToggle && (
                          <span className="spi-step-noop">
                            {t('serialTool.spi.master.gpioNoParam')}
                          </span>
                        )}
                      </td>
                      <td className="col-actions">
                        <button
                          className="spi-step-del"
                          onClick={() => deleteStep(step.id)}
                          title={t('serialTool.spi.master.delete')}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!steps.length && (
                  <tr>
                    <td colSpan={5} className="spi-step-empty">
                      {presetVariant === 'display'
                        ? t('serialTool.spi.master.noStepsDisplay')
                        : t('serialTool.spi.master.noStepsGeneral')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Loop controls */}
          <div className="spi-workflow-actions">
            <div className="config-group spi-loop-field">
              <label className="config-label">{t('serialTool.spi.master.loopCount')}</label>
              <input
                className="config-select"
                type="number"
                value={loopCount}
                onChange={(e) => setLoopCount(e.target.value)}
                min={1}
                max={99999}
                disabled={loopEnabled}
              />
            </div>
            <div className="spi-workflow-run-buttons">
              <button className="i2c-btn primary" onClick={runSelected} disabled={!steps.length}>
                {t('serialTool.spi.master.runSelected')}
              </button>
              <button className="i2c-btn" onClick={runAll} disabled={!steps.length}>
                {t('serialTool.spi.master.runAll')}
              </button>
              {loopEnabled ? (
                <button className="i2c-btn danger" onClick={stopLoop}>
                  {t('serialTool.spi.master.stop')}
                </button>
              ) : (
                <button
                  className="i2c-btn"
                  onClick={startLoop}
                  disabled={!steps.filter((s) => selectedSteps.has(s.id)).length}
                >
                  {t('serialTool.spi.master.loop')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Single-shot + Log */}
        <div className="spi-side-column">
          {/* Single-shot panel — includes direct CS control (matching CH347Demo layout) */}
          <div className="spi-single-panel">
            <div className="spi-section-title">{t('serialTool.spi.master.singleTransfer')}</div>
            {/* CS control row — direct chip select like CH347Demo SPI片选控制 */}
            <div className="spi-cs-row">
              <span className="spi-cs-label">{t('serialTool.spi.master.csControl')}</span>
              <div className="spi-cs-buttons">
                <button
                  className={`i2c-btn spi-cs-button ${csLevel === false ? 'active-low' : ''}`}
                  onClick={handleCsActive}
                  disabled={!connected}
                  aria-pressed={csLevel === false}
                >
                  {t('serialTool.spi.master.csActive')}
                </button>
                <button
                  className={`i2c-btn spi-cs-button ${csLevel === true ? 'active-high' : ''}`}
                  onClick={handleCsDeactive}
                  disabled={!connected}
                  aria-pressed={csLevel === true}
                >
                  {t('serialTool.spi.master.csDeactive')}
                </button>
              </div>
              <span
                className={`spi-cs-state ${
                  csLevel === null ? 'unknown' : csLevel === false ? 'low' : 'high'
                }`}
                role="status"
                aria-live="polite"
              >
                {csLevel === null
                  ? t('serialTool.spi.master.csUnknown')
                  : csLevel === false
                    ? t('serialTool.spi.master.csLowIndicator')
                    : t('serialTool.spi.master.csHighIndicator')}
              </span>
            </div>
            <div className="spi-param-row">
              <div className="config-group spi-tx-field">
                <label className="config-label">{t('serialTool.spi.master.txData')}</label>
                <textarea
                  className="i2c-textarea"
                  rows={2}
                  value={txData}
                  onChange={(e) => setTxData(formatHexInput(e.target.value))}
                  placeholder={t('serialTool.spi.master.dataPlaceholder')}
                />
              </div>
              <div className="config-group spi-number-field">
                <label className="config-label">{t('serialTool.spi.master.readLen')}</label>
                <input
                  className="config-select"
                  type="number"
                  value={readLen}
                  onChange={(e) => setReadLen(e.target.value)}
                />
              </div>
              <div className="config-group spi-byte-field">
                <label className="config-label">{t('serialTool.spi.master.outDefault')}</label>
                <input
                  className="config-select"
                  type="text"
                  value={outDefaultData}
                  onChange={(e) => setOutDefaultData(e.target.value)}
                  maxLength={2}
                />
              </div>
              <div className="spi-transfer-actions">
                <button className="i2c-btn" onClick={handleWrite} disabled={!connected}>
                  {t('serialTool.spi.master.write')}
                </button>
                <button className="i2c-btn" onClick={handleRead} disabled={!connected}>
                  {t('serialTool.spi.master.read')}
                </button>
                <button className="i2c-btn primary" onClick={handleDuplex} disabled={!connected}>
                  {t('serialTool.spi.master.duplex')}
                </button>
              </div>
            </div>
          </div>

          {/* Log */}
          <div className="i2c-log-area spi-log-area">
            <div className="i2c-log-title">
              <span className="status-led active" />
              {t('serialTool.spi.master.log')}
            </div>
            <div className="i2c-log-list i2c-log-interactive">
              <pre className="i2c-log-pre" style={{ fontSize: logFontSize }}>
                {logText || t('serialTool.spi.master.ready')}
              </pre>
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* SPI Config 已移到本组件顶部（spi-master-layout 第一个子节点），原本在这里的卡片已删除 */}

      {/* 自定义模态弹窗 —— 替代浏览器原生 prompt/confirm（后者会显示 "localhost:3030" 等地址栏）。
          mode='prompt' 显示输入框，'confirm' 仅显示确认/取消。点击空白处或按 ESC 取消。 */}
      {modal.open && (
        <div className="spi-modal-overlay" onClick={() => closeModal(null)}>
          <div
            className="spi-modal"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeModal(null);
              if (e.key === 'Enter' && modal.mode === 'prompt') closeModal(modalInput);
            }}
            tabIndex={-1}
          >
            <div className="spi-modal-title">{modal.title}</div>
            {modal.message && <div className="spi-modal-message">{modal.message}</div>}
            {modal.mode === 'prompt' && (
              <input
                className="spi-modal-input"
                type="text"
                value={modalInput}
                autoFocus
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') closeModal(modalInput);
                  if (e.key === 'Escape') closeModal(null);
                }}
              />
            )}
            <div className="spi-modal-actions">
              <button className="spi-modal-btn" onClick={() => closeModal(null)}>
                {t('serialTool.spi.master.modalCancel')}
              </button>
              <button
                className={`spi-modal-btn ${modal.okDanger ? 'danger' : 'primary'}`}
                onClick={() => closeModal(modal.mode === 'prompt' ? modalInput : '')}
              >
                {modal.okText ?? t('serialTool.spi.master.modalOk')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
