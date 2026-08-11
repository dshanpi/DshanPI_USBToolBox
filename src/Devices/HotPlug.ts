import type { UnlistenFn } from '@tauri-apps/api/event';
import { invokeCommand, subscribeUsbHotplug } from '../Platform/IPC';

export type UsbHotPlugEvent = 'arrived' | 'left';

export interface UsbHotPlugCallback {
  event: UsbHotPlugEvent;
  vendorId: number;
  productId: number;
  efexDeviceId: number | null;
  busId: number;
  usbDeviceId: number;
  devicePath: string | null;
  port: number | null;
}

export const SUNXI_USB_VENDOR = 0x1f3a;
export const SUNXI_USB_PRODUCT = 0xefe8;

export type HotPlugCallback = (event: UsbHotPlugCallback) => void;

class HotPlugManager {
  private unlisten: UnlistenFn | null = null;
  private callbacks: Set<HotPlugCallback> = new Set();
  private started: boolean = false;
  private paused: boolean = false;
  private recentEvents: Map<string, number> = new Map();
  private readonly DEBOUNCE_MS = 100;

  private getEventKey(callback: UsbHotPlugCallback): string {
    return (
      callback.devicePath ??
      `efex:${callback.efexDeviceId ?? 'none'}:bus:${callback.busId}:usb:${callback.usbDeviceId}:port:${callback.port ?? 'none'}`
    );
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.unlisten = await subscribeUsbHotplug((callback) => {
      if (this.paused && callback.event !== 'left') {
        return;
      }

      if (callback.vendorId === SUNXI_USB_VENDOR && callback.productId === SUNXI_USB_PRODUCT) {
        const now = Date.now();
        const key = `${callback.event}:${this.getEventKey(callback)}`;
        const lastEventTime = this.recentEvents.get(key) ?? 0;

        if (now - lastEventTime < this.DEBOUNCE_MS) {
          return;
        }

        this.recentEvents.set(key, now);

        this.callbacks.forEach((cb) => cb(callback));
      }
    });

    await invokeCommand('hotplug_start');

    this.started = true;
  }

  stop(): void {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
    this.started = false;
    this.paused = false;
    this.recentEvents.clear();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.recentEvents.clear();
  }

  isPaused(): boolean {
    return this.paused;
  }

  onHotPlug(callback: HotPlugCallback): () => void {
    this.callbacks.add(callback);

    return () => {
      this.callbacks.delete(callback);
    };
  }

  isStarted(): boolean {
    return this.started;
  }

  waitForDeviceArrive(timeoutMs: number = 30000): Promise<UsbHotPlugCallback> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`等待设备超时 (${timeoutMs}ms)`));
      }, timeoutMs);

      const cleanup = this.onHotPlug((event) => {
        if (event.event === 'arrived') {
          clearTimeout(timeout);
          cleanup();
          resolve(event);
        }
      });
    });
  }
}

export const hotPlugManager = new HotPlugManager();
