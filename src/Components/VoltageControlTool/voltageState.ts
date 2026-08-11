/**
 * GPIO0 电压控制共享状态单例。
 *
 * 把"GPIO0 输出电平"从原 VoltageControlTool 页面里抽出来做成全局单例，
 * 这样侧边栏的电压按钮（VoltageToggleButton）与任何打开 CH347 设备的工具
 * （I2C / SPI / SPIDisplay）都能共享同一份状态，UI 与硬件电平保持一致。
 *
 * 电压语义（适配新版电路）：
 *   - enabled = true  -> 拉高 GPIO0 -> 3.3V
 *   - enabled = false -> 拉低 GPIO0 -> 1.8V
 *
 * GPIO0 在 CH347GPIO_Set 的位掩码中对应 bit0（GPIO0_BIT = 0x01）。
 * 只置 bit0，绝不动 GPIO4(DC)/GPIO5(RST) 等其它引脚，可与 SPI 点屏工具共存。
 *
 * CH347GPIO_Set 是只写接口、无法回读当前电平，因此：
 *   - 设备上线（online false->true）时主动拉高 GPIO0（默认 3.3V），
 *     让按钮显示的 3.3V 与硬件实际电平一致；
 *   - 设备掉线（online true->false）时复位 enabled=true（UI 显示下次启动默认值）。
 */

import { invokeCommand } from '../../Platform/IPC';
import { sharedDevice } from '../SPITool/sharedDevice';

/** GPIO0 在 CH347GPIO_Set 位掩码中的 bit。 */
const GPIO0_BIT = 0x01;

interface VoltageState {
  /** true=3.3V（拉高 GPIO0），false=1.8V（拉低 GPIO0）。 */
  enabled: boolean;
  /** 指令进行中，防止快速连点导致电平指令交叉。 */
  busy: boolean;
  /** 最近一次错误信息，null=无错误。 */
  error: string | null;
}

let state: VoltageState = {
  enabled: true,
  busy: false,
  error: null,
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/**
 * 写 GPIO0 电平。设备可能已断开，失败时由调用方决定是否忽略。
 *
 * @param high - true=拉高（3.3V），false=拉低（1.8V）
 * @param index - CH347 设备索引
 */
async function applyGpio0(high: boolean, index: number): Promise<void> {
  await invokeCommand('ch347_gpio_set', {
    index,
    enable: GPIO0_BIT,
    dirOut: GPIO0_BIT,
    dataOut: high ? GPIO0_BIT : 0x00,
  });
}

// ─── 监听 sharedDevice 的在线状态变化 ────────────────────
// 上线时初始化 GPIO0 为高（= 3.3V 启动默认值 + 让 UI 的 3.3V 与硬件一致）；
// 掉线时复位 enabled（设备已不可达，不额外写 GPIO，
// 下次上线会再次拉高 GPIO0，恢复 3.3V 默认态）。
let prevOnline = false;
sharedDevice.subscribe(() => {
  const { online, deviceIndex } = sharedDevice.getState();
  if (!prevOnline && online && deviceIndex !== null) {
    // false -> true：设备刚上线，拉高 GPIO0（默认 3.3V）。
    void applyGpio0(true, deviceIndex)
      .then(() => {
        state = { ...state, enabled: true, error: null };
        notify();
      })
      .catch(() => {
        /* 初始化失败不阻塞连接流程，忽略 */
      });
  } else if (prevOnline && !online) {
    // true -> false：设备掉线，复位 UI 状态。
    if (!state.enabled || state.error) {
      state = { ...state, enabled: true, error: null };
      notify();
    }
  }
  prevOnline = online;
});

export const voltageState = {
  getState(): VoltageState {
    return state;
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /**
   * 切换 GPIO0 电平（3.3V <-> 1.8V）。
   * 设备未连接或指令进行中时忽略；失败时保持原状态，让 UI 与硬件一致。
   */
  async setEnabled(next: boolean): Promise<void> {
    const { online, deviceIndex } = sharedDevice.getState();
    if (!online || deviceIndex === null) return;
    if (state.busy || state.enabled === next) return;
    state = { ...state, busy: true, error: null };
    notify();
    try {
      await applyGpio0(next, deviceIndex);
      state = { ...state, enabled: next };
    } catch (err) {
      state = { ...state, error: String(err) };
    } finally {
      state = { ...state, busy: false };
      notify();
    }
  },

  /** 在当前 enabled 基础上翻转。 */
  async toggle(): Promise<void> {
    await this.setEnabled(!state.enabled);
  },

  /** 当前是否使能（3.3V）。 */
  get enabled(): boolean {
    return state.enabled;
  },
};
