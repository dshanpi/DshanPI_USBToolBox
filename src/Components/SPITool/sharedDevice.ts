/**
 * Shared CH347 device state between I2C and SPI tools.
 * Both protocols use the same physical device, so connection
 * state is global.
 *
 * 自动连接（事件驱动，不轮询）：
 *   后端 ch347/device_notifier 在 Windows 上监听 WM_DEVICECHANGE（USB 设备插拔），
 *   一有设备插/拔就 emit "ch347-device-changed"。本模块监听该事件，收到后调一次
 *   ch347_list_devices 扫描，根据列表变化驱动连接/断开：
 *     - 离线 + 检测到设备（新出现，或掉线后又有设备可用）-> 自动 ch347_open。
 *     - 在线 + 当前设备消失（被拔出）-> 自动 ch347_close + online=false。
 *   平时完全不调 ch347_list_devices（不再每 1.5s 轮询），只在插拔时扫一次。
 *
 *   首个订阅者注册时：立即扫一次（捕获已插好的设备）+ 开始监听插拔事件。
 *
 *   手动点"关闭"：setOnline(false) 把 autoDisconnected 置 false（非自动断开），
 *   此时设备仍在列表里（不算"新出现"），故不会立即重连 -- 尊重用户主动关闭；
 *   直到设备重新插拔（再次"出现"）才自动重连。
 *
 *   设备被拔出（自动断开）：autoDisconnected=true，只要有任意设备可用就重连到它
 *   （优先连回原来的 deviceIndex）。
 */

import { invokeCommand } from '../../Platform/IPC';
import { listen } from '@tauri-apps/api/event';

type Listener = () => void;

export interface Ch347Device {
  index: number;
  name: string;
  chipType?: number;
  chipName?: string;
  desc?: string;
  usbClass?: number;
  funcType?: number;
  chipMode?: number;
  interfaceNumber?: number;
  firmwareVersion?: number;
  product?: string;
  manufacturer?: string;
}

interface DeviceState {
  online: boolean;
  deviceIndex: number | null;
  /** 每次成功建立新设备会话时递增；即使 React 未观察到短暂的 offline，也能让协议层丢弃旧配置。 */
  sessionId: number;
  devices: Ch347Device[];
  scanning: boolean;
  /** 设备是否因热插拔而自动断开（区别于用户主动点"关闭"）。
   *  UI 可据此显示提示文案，比如"设备已断开连接"。
   *  autoDisconnected=true 时，离线状态下只要有设备可用就会自动重连。 */
  autoDisconnected: boolean;
}

let state: DeviceState = {
  online: false,
  deviceIndex: null,
  sessionId: 0,
  devices: [],
  scanning: false,
  autoDisconnected: false,
};

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn());
}

// ─── 设备热插拔 + 自动连接监视器（事件驱动）────────────────

/** 防止扫描任务重入（上一次 ch347_list_devices 还没返回就又来一次）。 */
let polling = false;
/** SPI 操作期间暂停扫描，避免与 ch347_spi_write 等并发访问 CH347 DLL（DLL 非线程安全，
 *  并发会导致状态错乱 -> 设备断开 + 吞吐被拖慢）。pausePolling 会等当前扫描结束。 */
let pollingPaused = false;
/** pausePolling 支持嵌套调用；只有最后一个使用者恢复后才允许重新扫描。 */
let pollingPauseDepth = 0;
/** 当前正在执行的扫描 Promise，供 pausePolling 等待。 */
let inFlight: Promise<void> | null = null;
/** 上一轮扫描看到的设备索引集合，用于判断哪些设备是"新出现"的（热插拔 arrival）。 */
let prevDeviceIndices: Set<number> = new Set();
/** SPI 操作期间收到插拔事件时置 true，resumePolling 时补扫一次。 */
let scanPending = false;
/** 插拔事件防抖定时器（插拔会连发多条 WM_DEVICECHANGE）。 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/** 事件监听器是否已启动（首个订阅者时启动一次）。 */
let listening = false;

/**
 * 扫描设备列表变化（事件触发，不再定时轮询）：
 *   - 在线时：当前设备消失 -> 自动断开。
 *   - 离线时：检测到可用设备（新出现，或掉线后又有设备）-> 自动连接。
 * 通过 invokeCommand 调后端 ch347_list_devices -- 跟用户点 ↻ 扫描走同一条路。
 */
async function pollOnce(): Promise<void> {
  if (pollingPaused) {
    scanPending = true;
    return;
  }
  if (polling) {
    if (inFlight) await inFlight;
    return;
  }
  polling = true;
  state = { ...state, scanning: true };
  notify();
  inFlight = doPoll();
  try {
    await inFlight;
  } finally {
    polling = false;
    inFlight = null;
    state = { ...state, scanning: false };
    notify();
  }
}

async function doPoll(): Promise<void> {
  try {
    const list: Ch347Device[] = await invokeCommand('ch347_list_devices');
    // 刷新设备列表（下拉里要显示最新的设备）
    state = { ...state, devices: list };
    notify();

    const currentIndices = new Set(list.map((d) => d.index));
    // 本轮"新出现"的设备（上一轮没有、这一轮有）-- 热插拔 arrival
    const appeared = list.filter((d) => !prevDeviceIndices.has(d.index));
    prevDeviceIndices = currentIndices;

    if (state.online) {
      // ── 在线：检查当前设备是否还在 ──
      const idx = state.deviceIndex;
      if (idx === null || !currentIndices.has(idx)) {
        // 当前设备消失（被拔了）-> 自动断开
        if (idx !== null) {
          try {
            await invokeCommand('ch347_close', { index: idx });
          } catch {
            /* 设备已消失，close 失败正常 */
          }
        }
        // autoDisconnected=true：标记为非用户主动关闭，以便后续自动重连到任意可用设备。
        // 保留 deviceIndex：重连时优先连回原来的设备。
        state = { ...state, online: false, autoDisconnected: true };
        notify();
      }
    } else {
      // ── 离线：尝试自动连接 ──
      let target: number | null = null;
      if (state.autoDisconnected && list.length > 0) {
        // 掉线后重连：优先连回原 deviceIndex，否则连第一个可用设备
        target =
          state.deviceIndex !== null && currentIndices.has(state.deviceIndex)
            ? state.deviceIndex
            : list[0].index;
      } else if (appeared.length > 0) {
        // 热插拔 arrival：有新设备出现 -> 自动连接
        // 优先连回原 deviceIndex（如果它刚好重新出现），否则连第一个新出现的设备
        target =
          state.deviceIndex !== null && appeared.some((d) => d.index === state.deviceIndex)
            ? state.deviceIndex
            : appeared[0].index;
      }

      if (target !== null) {
        try {
          await invokeCommand('ch347_open', { index: target });
          // 连上后记住当前设备（首次自动连接时 deviceIndex 为 null）
          state = {
            ...state,
            online: true,
            autoDisconnected: false,
            deviceIndex: target,
            sessionId: state.sessionId + 1,
          };
          notify();
        } catch {
          /* open 失败（设备被占用等）-- 下次插拔事件会重试 */
        }
      }
    }
  } catch {
    // ch347_list_devices 本身失败（DLL 不可用等）
    if (state.online) {
      // 在线时枚举失败 -- 视为设备不可达，断开（保留 deviceIndex 以便重连）
      if (state.deviceIndex !== null) {
        try {
          await invokeCommand('ch347_close', { index: state.deviceIndex });
        } catch {
          /* ignore */
        }
      }
      state = { ...state, online: false, autoDisconnected: true };
      notify();
    }
    // 离线时枚举失败 -- 静默，下次插拔事件重试
  }
}

/**
 * USB 插拔事件回调（后端 emit "ch347-device-changed"）。
 * 防抖 300ms（插拔会连发多条事件），然后扫一次。SPI 操作期间不立即扫，置 scanPending。
 */
function onDeviceChanged(): void {
  if (pollingPaused) {
    scanPending = true;
    return;
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (pollingPaused) {
      scanPending = true;
      return;
    }
    void pollOnce();
  }, 300);
}

/**
 * 暂停设备扫描，并等待当前正在进行的扫描结束。
 * SPI 长操作（命令表/帧推送/填色）前调用，避免扫描的 ch347_list_devices 与 SPI 写
 * 并发访问 CH347 DLL（DLL 非线程安全，并发会导致设备断开 + 吞吐被拖慢）。
 */
async function pausePolling(): Promise<void> {
  pollingPauseDepth += 1;
  pollingPaused = true;
  if (inFlight) {
    try {
      await inFlight;
    } catch {
      /* 忽略进行中扫描的错误 */
    }
  }
}

/** 恢复设备扫描。SPI 长操作结束后调用；若期间有插拔事件，补扫一次。 */
function resumePolling(): void {
  if (pollingPauseDepth > 0) pollingPauseDepth -= 1;
  if (pollingPauseDepth > 0) return;
  pollingPaused = false;
  if (scanPending) {
    scanPending = false;
    void pollOnce();
  }
}

export const sharedDevice = {
  getState(): DeviceState {
    return state;
  },

  /**
   * 设置连接状态。
   *   - setOnline(true)：用户手动点"打开"成功后调用 -- 清除 autoDisconnected。
   *   - setOnline(false)：用户手动点"关闭" -- 清除 autoDisconnected（标记为非自动断开，
   *     这样设备仍在列表里时不会立即重连，尊重用户主动关闭）。
   *
   * 自动断开（设备被拔）由 pollOnce 直接写 state，不经过 setOnline，从而保留
   * autoDisconnected=true 以便自动重连。
   */
  setOnline(v: boolean) {
    state = {
      ...state,
      online: v,
      autoDisconnected: false,
      sessionId: v && !state.online ? state.sessionId + 1 : state.sessionId,
    };
    notify();
  },

  setDeviceIndex(v: number | null) {
    state = { ...state, deviceIndex: v };
    notify();
  },

  setDevices(v: Array<{ index: number; name: string }>) {
    state = { ...state, devices: v };
    notify();
  },

  setScanning(v: boolean) {
    state = { ...state, scanning: v };
    notify();
  },

  /** 暂停扫描（SPI 长操作前调用，避免与写并发访问 DLL）。会等当前扫描结束。 */
  pausePolling,
  /** 恢复扫描（SPI 长操作后调用）。若期间有插拔事件，补扫一次。 */
  resumePolling,

  /** 用户手动重新枚举设备；与热插拔和首次加载复用同一套扫描、断线及自动重连逻辑。 */
  async rescan(): Promise<void> {
    await pollOnce();
  },

  /** 清除"自动断开"标志（用户重新点"打开"时调用，让 UI 不再显示断开提示）。 */
  clearAutoDisconnected() {
    if (state.autoDisconnected) {
      state = { ...state, autoDisconnected: false };
      notify();
    }
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    // 首个订阅者：立即扫一次（捕获已插好的设备）+ 监听后端 USB 插拔事件。
    if (listeners.size === 1 && !listening) {
      listening = true;
      void pollOnce();
      void listen('ch347-device-changed', () => onDeviceChanged());
    }
    return () => {
      listeners.delete(fn);
    };
  },
};
