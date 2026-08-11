import {
  hotPlugManager,
  type HotPlugCallback,
  type UsbHotPlugCallback,
  type UsbHotPlugEvent,
} from '../Devices/HotPlug';

/** Re-export hot-plug callback types for convenience */
export type { HotPlugCallback, UsbHotPlugCallback, UsbHotPlugEvent };

/**
 * Service for USB hot-plug event monitoring.
 *
 * HotPlugService wraps the HotPlugManager from the Devices module,
 * providing a simplified API for monitoring USB device connection
 * and disconnection events.
 *
 * Events are emitted from the Rust backend via Tauri IPC and
 * debounced to prevent rapid-fire updates during device initialization.
 *
 * Used by useHotPlug hook and FlashManager for automatic device
 * detection during flash operations.
 *
 * Example usage:
 * ```typescript
 * await hotPlugService.start();
 * const unsubscribe = hotPlugService.onHotPlug((event) => {
 *   if (event.event === 'arrived') {
 *     console.log('Device connected');
 *   }
 * });
 * ```
 */
export class HotPlugService {
  /**
   * Starts the hot-plug monitoring service.
   *
   * Registers USB hot-plug callback with the Rust backend.
   *
   * @returns Promise resolving when service started
   */
  start(): Promise<void> {
    return hotPlugManager.start();
  }

  /**
   * Stops the hot-plug monitoring service.
   *
   * Unregisters callbacks and stops event emission.
   */
  stop(): void {
    hotPlugManager.stop();
  }

  /**
   * Pauses hot-plug event emission.
   *
   * Events continue to be received but not emitted to subscribers.
   * Used during flash operations to prevent UI interference.
   */
  pause(): void {
    hotPlugManager.pause();
  }

  /**
   * Resumes hot-plug event emission.
   *
   * Re-enables event emission after pause.
   */
  resume(): void {
    hotPlugManager.resume();
  }

  /**
   * Checks if hot-plug events are paused.
   *
   * @returns True if paused
   */
  isPaused(): boolean {
    return hotPlugManager.isPaused();
  }

  /**
   * Registers a callback for hot-plug events.
   *
   * Callback receives UsbHotPlugCallback with event type and device info.
   *
   * @param callback - Function to call on hot-plug events
   * @returns Unsubscribe function
   */
  onHotPlug(callback: HotPlugCallback): () => void {
    return hotPlugManager.onHotPlug(callback);
  }

  /**
   * Checks if hot-plug service has been started.
   *
   * @returns True if started
   */
  isStarted(): boolean {
    return hotPlugManager.isStarted();
  }

  /**
   * Waits for a device to arrive with optional timeout.
   *
   * Returns promise that resolves when a device connects.
   * Useful for waiting for device reconnection after reboot.
   *
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise resolving to UsbHotPlugCallback event
   */
  waitForDeviceArrive(timeoutMs?: number): Promise<UsbHotPlugCallback> {
    return hotPlugManager.waitForDeviceArrive(timeoutMs);
  }
}

/** Singleton instance of HotPlugService */
export const hotPlugService = new HotPlugService();