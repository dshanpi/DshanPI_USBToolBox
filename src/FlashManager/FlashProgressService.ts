import { CallbackManager, type FlashCallbacks } from './Callbacks';
import type { FlashDramInfo, FlashProgress, LogEntry } from './Types';
import type { PopupType } from '../CoreUI';

/**
 * Service for managing flash progress event emission.
 *
 * FlashProgressService wraps a CallbackManager and provides methods
 * for emitting various flash events. It can convert its functionality
 * to a FlashCallbacks interface for passing to flash operations.
 */
export class FlashProgressService {
  /** Callback manager for handling event subscriptions */
  private callbacks = new CallbackManager();

  /**
   * Gets the underlying callback manager.
   *
   * Used by FlashOrchestrator to register external callbacks.
   *
   * @returns CallbackManager instance
   */
  get callbackManager(): CallbackManager {
    return this.callbacks;
  }

  /**
   * Emits progress update to all registered callbacks.
   *
   * @param progress - FlashProgress information to emit
   */
  emitProgress(progress: FlashProgress): void {
    this.callbacks.emitProgress(progress);
  }

  /**
   * Emits log entry to all registered callbacks.
   *
   * @param log - LogEntry to emit
   */
  emitLog(log: LogEntry): void {
    this.callbacks.emitLog(log);
  }

  /**
   * Emits completion event to all registered callbacks.
   *
   * @param result - Completion result with task ID and success status
   */
  emitComplete(result: { taskId: number; success: boolean }): void {
    this.callbacks.emitComplete(result);
  }

  /**
   * Emits DRAM info to all registered callbacks.
   *
   * @param info - FlashDramInfo to emit
   */
  emitDramInfo(info: FlashDramInfo): void {
    this.callbacks.emitDramInfo(info);
  }

  /**
   * Emits working state change to all registered callbacks.
   *
   * @param working - True if flash operation is active
   */
  emitWorkingChange(working: boolean): void {
    this.callbacks.emitWorkingChange(working);
  }

  /**
   * Emits rescan request to all registered callbacks.
   *
   * Called when device list needs to be refreshed due to disconnect.
   */
  emitRescan(): void {
    this.callbacks.emitRescan();
  }

  /**
   * Emits popup display request to all registered callbacks.
   *
   * @param taskId - Task ID that triggered the popup
   * @param type - Popup type (error, warning, info, etc.)
   * @param title - Popup title
   * @param message - Popup message content
   */
  emitShowPopup(taskId: number, type: PopupType, title: string, message: string): void {
    this.callbacks.emitShowPopup(taskId, type, title, message);
  }

  /**
   * Converts this service to a FlashCallbacks interface.
   *
   * Used when passing callbacks to flash operations that expect
   * the FlashCallbacks interface format.
   *
   * @param checkCancelled - Function to check if operation was cancelled
   * @returns FlashCallbacks interface implementation
   */
  toFlashCallbacks(checkCancelled: () => void): FlashCallbacks {
    return {
      onProgress: (progress) => this.emitProgress(progress),
      onLog: (log) => this.emitLog(log),
      onComplete: () => {},
      onDramInfo: () => {},
      onWorkingChange: () => {},
      onRescan: () => this.emitRescan(),
      checkCancelled,
      onShowPopup: (taskId, type, title, message) =>
        this.emitShowPopup(taskId, type, title, message),
      onShowConfirm: (taskId, title, message) =>
        this.callbacks.emitShowConfirm(taskId, title, message),
    };
  }
}