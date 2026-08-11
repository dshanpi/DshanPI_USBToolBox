import { FlashDramInfo, FlashProgress, LogEntry } from './Types';
import { PopupType } from '../CoreUI';

/**
 * Interface for flash operation callbacks.
 *
 * Defines the callback functions that flash operations can use
 * to communicate progress, logs, completion, and user interactions
 * back to the calling code.
 */
export interface FlashCallbacks {
  /** Called when flash progress updates */
  onProgress: (progress: FlashProgress) => void;
  /** Called when a log entry is generated */
  onLog: (log: LogEntry) => void;
  /** Called when flash operation completes */
  onComplete: (result: { taskId: number; success: boolean }) => void;
  /** Called when DRAM info is received (optional) */
  onDramInfo?: (info: FlashDramInfo) => void;
  /** Called when working state changes (optional) */
  onWorkingChange?: (working: boolean) => void;
  /** Called when device rescan is needed */
  onRescan: () => void;
  /** Called to check if operation was cancelled */
  checkCancelled: () => void;
  /** Called to show a popup to the user (optional) */
  onShowPopup?: (taskId: number, type: PopupType, title: string, message: string) => void;
  /** Called to request user confirmation (optional) */
  onShowConfirm?: (taskId: number, title: string, message: string) => Promise<boolean>;
}

/**
 * Manages callback registrations and event emission for flash operations.
 *
 * CallbackManager provides a centralized way to register multiple
 * callbacks for the same event type and emit events to all registered
 * callbacks. Each registration returns an unsubscribe function.
 *
 * Example usage:
 * ```typescript
 * const manager = new CallbackManager();
 * const unsubscribe = manager.onProgress((progress) => console.log(progress));
 * manager.emitProgress({ percent: 50, stage: 'downloading' });
 * unsubscribe();
 * ```
 */
export class CallbackManager {
  /** Set of registered progress callbacks */
  private progressCallbacks: Set<(progress: FlashProgress) => void> = new Set();

  /** Set of registered log callbacks */
  private logCallbacks: Set<(log: LogEntry) => void> = new Set();

  /** Set of registered completion callbacks */
  private completeCallbacks: Set<(result: { taskId: number; success: boolean }) => void> =
    new Set();

  /** Set of registered DRAM info callbacks */
  private dramInfoCallbacks: Set<(info: FlashDramInfo) => void> = new Set();

  /** Set of registered working state change callbacks */
  private workingCallbacks: Set<(working: boolean) => void> = new Set();

  /** Set of registered rescan request callbacks */
  private rescanCallbacks: Set<() => void> = new Set();

  /** Set of registered popup display callbacks */
  private showPopupCallbacks: Set<
    (taskId: number, type: PopupType, title: string, message: string) => void
  > = new Set();

  /** Set of registered confirmation request callbacks */
  private showConfirmCallbacks: Set<
    (taskId: number, title: string, message: string) => Promise<boolean>
  > = new Set();

  /**
   * Emits progress update to all registered callbacks.
   *
   * @param progress - FlashProgress information to emit
   */
  emitProgress(progress: FlashProgress): void {
    this.progressCallbacks.forEach((cb) => cb(progress));
  }

  /**
   * Emits log entry to all registered callbacks.
   *
   * @param log - LogEntry to emit
   */
  emitLog(log: LogEntry): void {
    this.logCallbacks.forEach((cb) => cb(log));
  }

  /**
   * Emits completion event to all registered callbacks.
   *
   * @param result - Completion result with task ID and success status
   */
  emitComplete(result: { taskId: number; success: boolean }): void {
    this.completeCallbacks.forEach((cb) => cb(result));
  }

  /**
   * Emits DRAM info to all registered callbacks.
   *
   * @param info - FlashDramInfo to emit
   */
  emitDramInfo(info: FlashDramInfo): void {
    this.dramInfoCallbacks.forEach((cb) => cb(info));
  }

  /**
   * Emits working state change to all registered callbacks.
   *
   * @param working - True if flash operation is active
   */
  emitWorkingChange(working: boolean): void {
    this.workingCallbacks.forEach((cb) => cb(working));
  }

  /**
   * Emits rescan request to all registered callbacks.
   *
   * Called when device list needs to be refreshed.
   */
  emitRescan(): void {
    this.rescanCallbacks.forEach((cb) => cb());
  }

  /**
   * Emits popup display request to all registered callbacks.
   *
   * @param taskId - Task ID that triggered the popup
   * @param type - Popup type (error, warning, info)
   * @param title - Popup title
   * @param message - Popup message content
   */
  emitShowPopup(taskId: number, type: PopupType, title: string, message: string): void {
    this.showPopupCallbacks.forEach((cb) => cb(taskId, type, title, message));
  }

  /**
   * Emits confirmation request to the first registered callback.
   *
   * Only the first registered confirm callback is used,
   * as confirmation requires a single response.
   *
   * @param taskId - Task ID requesting confirmation
   * @param title - Confirmation dialog title
   * @param message - Confirmation dialog message
   * @returns Promise resolving to user's confirmation decision
   */
  async emitShowConfirm(taskId: number, title: string, message: string): Promise<boolean> {
    const callbacks = Array.from(this.showConfirmCallbacks);
    if (callbacks.length === 0) return false;
    return callbacks[0](taskId, title, message);
  }

  /**
   * Registers a progress callback.
   *
   * @param callback - Function to call when progress updates
   * @returns Unsubscribe function to remove the callback
   */
  onProgress(callback: (progress: FlashProgress) => void): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  /**
   * Registers a log callback.
   *
   * @param callback - Function to call when a log is generated
   * @returns Unsubscribe function to remove the callback
   */
  onLog(callback: (log: LogEntry) => void): () => void {
    this.logCallbacks.add(callback);
    return () => this.logCallbacks.delete(callback);
  }

  /**
   * Registers a completion callback.
   *
   * @param callback - Function to call when operation completes
   * @returns Unsubscribe function to remove the callback
   */
  onComplete(callback: (result: { taskId: number; success: boolean }) => void): () => void {
    this.completeCallbacks.add(callback);
    return () => this.completeCallbacks.delete(callback);
  }

  /**
   * Registers a DRAM info callback.
   *
   * @param callback - Function to call when DRAM info is received
   * @returns Unsubscribe function to remove the callback
   */
  onDramInfo(callback: (info: FlashDramInfo) => void): () => void {
    this.dramInfoCallbacks.add(callback);
    return () => this.dramInfoCallbacks.delete(callback);
  }

  /**
   * Registers a working state change callback.
   *
   * @param callback - Function to call when working state changes
   * @returns Unsubscribe function to remove the callback
   */
  onWorkingChange(callback: (working: boolean) => void): () => void {
    this.workingCallbacks.add(callback);
    return () => this.workingCallbacks.delete(callback);
  }

  /**
   * Registers a rescan request callback.
   *
   * @param callback - Function to call when rescan is needed
   * @returns Unsubscribe function to remove the callback
   */
  onRescan(callback: () => void): () => void {
    this.rescanCallbacks.add(callback);
    return () => this.rescanCallbacks.delete(callback);
  }

  /**
   * Registers a popup display callback.
   *
   * @param callback - Function to call when popup should be shown
   * @returns Unsubscribe function to remove the callback
   */
  onShowPopup(
    callback: (taskId: number, type: PopupType, title: string, message: string) => void
  ): () => void {
    this.showPopupCallbacks.add(callback);
    return () => this.showPopupCallbacks.delete(callback);
  }

  /**
   * Registers a confirmation request callback.
   *
   * @param callback - Function to call when confirmation is needed
   * @returns Unsubscribe function to remove the callback
   */
  onShowConfirm(
    callback: (taskId: number, title: string, message: string) => Promise<boolean>
  ): () => void {
    this.showConfirmCallbacks.add(callback);
    return () => this.showConfirmCallbacks.delete(callback);
  }
}