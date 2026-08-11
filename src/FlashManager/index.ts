import { shellCommand } from '../Library/ADB';
import {
  invokeCommand,
  subscribeFlashConfirmRequest,
  subscribeFlashDramInfo,
  subscribeFlashLog,
  subscribeFlashPopup,
  subscribeFlashProgress,
  subscribeFlashState,
} from '../Platform/IPC';
import {
  FlashDevice,
  FlashDramInfo,
  FlashProgress,
  FlashOptions,
  FlashController,
  LogEntry,
} from './Types';
import { FlashProgressService } from './FlashProgressService';
import { type PopupType } from '../CoreUI';
import { deviceDiscoveryService, hotPlugService, type UsbHotPlugCallback } from '../Services';
import i18n from '../i18n';
import { mapFlashError } from './FlashErrorMapper';

/**
 * FlashOrchestrator is the central coordinator for all firmware flash operations.
 *
 * This singleton class manages the complete flash lifecycle including:
 * - Device discovery and scanning (FEL/FES/ADB modes)
 * - Flash operation initiation and cancellation
 * - Progress tracking and event emission to UI
 * - Hot-plug event handling during flashing
 * - Error handling and recovery
 * - Multi-device flash support with task ID tracking
 *
 * It implements the FlashController interface to provide a unified API for
 * the UI components to interact with flash operations.
 *
 * @implements {FlashController}
 */
class FlashOrchestrator implements FlashController {
  /** Progress service for managing callbacks and event emission */
  private progressService = new FlashProgressService();

  /** Flag indicating external working state (e.g., preparation phase) */
  private externalWorking = false;

  /** Set of currently active flash task IDs */
  private activeTaskIds = new Set<number>();

  /** Set of task IDs that have completed/failed/cancelled but not yet fully cleaned */
  private finalizedTaskIds = new Set<number>();

  /** Set of task IDs expecting device reconnect (FEL mode transition) */
  private reconnectExpectedTaskIds = new Set<number>();

  /** Map of task IDs to their target device information for hot-plug matching */
  private taskTargets = new Map<number, Pick<FlashDevice, 'deviceId' | 'bus' | 'port'>>();

  /** Map of completed task results with cleanup timers for auto-expiration */
  private completedTaskResults = new Map<
    number,
    { success: boolean; cleanupTimer: ReturnType<typeof setTimeout> }
  >();

  /** Flag indicating runtime IPC events are bound */
  private runtimeBound = false;

  /** Flag indicating hot-plug event handlers are bound */
  private hotPlugBound = false;

  /**
   * Scans for available flash devices in FEL/FES and ADB modes.
   *
   * Logs scan progress and any errors encountered during device discovery.
   * Emits warning logs if no devices are found or if scan fails for specific modes.
   *
   * @returns Promise resolving to array of discovered FlashDevice objects
   */
  async scan(): Promise<FlashDevice[]> {
    this.emitLog({
      timestamp: new Date(),
      level: 'info',
      message: i18n.t('flashManager.scanningDevices'),
    });

    const discovery = await deviceDiscoveryService.scanDevices();

    if (discovery.errors.efex) {
      this.emitLog({
        timestamp: new Date(),
        level: 'warn',
        message: `${i18n.t('flashManager.efexScanFailed')}: ${String(discovery.errors.efex)}`,
      });
    }

    if (discovery.errors.adb) {
      this.emitLog({
        timestamp: new Date(),
        level: 'warn',
        message: `${i18n.t('flashManager.adbScanFailed')}: ${String(discovery.errors.adb)}`,
      });
    }

    if (discovery.devices.length === 0) {
      this.emitLog({
        timestamp: new Date(),
        level: 'warn',
        message: i18n.t('flashManager.noDevicesFound'),
      });
    }

    return discovery.devices;
  }

  /**
   * Starts a flash operation on the specified device.
   *
   * Handles device preparation for ADB mode (reboot to FEL) and resolves
   * EFEX device targets. Registers the task for progress tracking and
   * hot-plug monitoring.
   *
   * @param device - Target device to flash
   * @param imagePath - Path to the firmware image file
   * @param options - Flash options including mode, partition config, and MBR data
   * @returns Promise resolving to the task ID for this flash operation
   * @throws Error if device is not ready (missing deviceId, bus, or port)
   */
  async start(device: FlashDevice, imagePath: string, options: FlashOptions): Promise<number> {
    await this.ensureRuntimeEventsBound();

    this.emitLog({
      timestamp: new Date(),
      level: 'info',
      message: i18n.t('flashManager.startFlash', { path: imagePath }),
    });
    this.emitLog({
      timestamp: new Date(),
      level: 'info',
      message: i18n.t('flashManager.targetDevice', { name: device.name, mode: device.modeStr }),
    });
    this.emitLog({
      timestamp: new Date(),
      level: 'info',
      message: i18n.t('flashManager.flashMode', { mode: i18n.t(`flashMode.${options.mode}`) }),
    });

    const target =
      device.mode === 'adb'
        ? await this.prepareDeviceFromAdb(device.serial)
        : await this.resolveEfexTarget(device);

    if (target.deviceId === undefined || target.bus === undefined || target.port === undefined) {
      throw new Error(i18n.t('flashManager.errors.deviceNotReady'));
    }

    const result = await invokeCommand('flash_start', {
      deviceId: target.deviceId,
      bus: target.bus,
      port: target.port,
      imagePath,
      options: {
        ...options,
        mbrData: options.mbrData ? Array.from(options.mbrData) : undefined,
        partitionConfig: options.partitionConfig?.map((partition) => ({
          name: partition.name,
          size: partition.size,
          downloadfile: partition.downloadfile,
          userType: partition.user_type,
          keydata: partition.keydata,
          encrypt: partition.encrypt,
          verify: partition.verify,
          ro: partition.ro,
          customFilePath: partition.customFilePath,
        })),
      },
    });

    if (!this.completedTaskResults.has(result.task_id)) {
      this.activeTaskIds.add(result.task_id);
      this.taskTargets.set(result.task_id, {
        deviceId: target.deviceId,
        bus: target.bus,
        port: target.port,
      });
      this.emitWorkingChange(this.getIsFlashing());
    }

    return result.task_id;
  }

  /**
   * Cancels an active flash operation.
   *
   * If a specific task ID is provided, cancels only that task.
   * If no task ID is provided, cancels all active flash operations.
   *
   * @param taskId - Optional task ID to cancel; if omitted, cancels all active tasks
   */
  cancel(taskId?: number): void {
    const taskIds = taskId !== undefined ? [taskId] : Array.from(this.activeTaskIds);
    for (const currentTaskId of taskIds) {
      this.emitLog({
        taskId: currentTaskId,
        timestamp: new Date(),
        level: 'warn',
        message: i18n.t('flashManager.cancellingFlash'),
      });
      invokeCommand('flash_cancel', { taskId: currentTaskId }).catch(() => {});
    }
  }

  /**
   * Registers a callback for flash progress updates.
   *
   * @param callback - Function to call when progress is updated
   * @returns Unsubscribe function to remove the callback
   */
  onProgress(callback: (progress: FlashProgress) => void): () => void {
    return this.progressService.callbackManager.onProgress(callback);
  }

  /**
   * Registers a callback for log entries during flash operations.
   *
   * @param callback - Function to call when a log entry is emitted
   * @returns Unsubscribe function to remove the callback
   */
  onLog(callback: (log: LogEntry) => void): () => void {
    return this.progressService.callbackManager.onLog(callback);
  }

  /**
   * Registers a callback for flash completion events.
   *
   * @param callback - Function to call when a flash operation completes
   * @returns Unsubscribe function to remove the callback
   */
  onComplete(callback: (result: { taskId: number; success: boolean }) => void): () => void {
    return this.progressService.callbackManager.onComplete(callback);
  }

  /**
   * Registers a callback for DRAM initialization info updates.
   *
   * DRAM info is emitted during FEL mode flash when the device reports
   * DRAM parameters and initialization status.
   *
   * @param callback - Function to call when DRAM info is received
   * @returns Unsubscribe function to remove the callback
   */
  onDramInfo(callback: (info: FlashDramInfo) => void): () => void {
    return this.progressService.callbackManager.onDramInfo(callback);
  }

  /**
   * Registers a callback for working state changes.
   *
   * Working state indicates whether any flash operation is in progress,
   * including external preparation phases.
   *
   * @param callback - Function to call when working state changes
   * @returns Unsubscribe function to remove the callback
   */
  onWorkingChange(callback: (working: boolean) => void): () => void {
    return this.progressService.callbackManager.onWorkingChange(callback);
  }

  /**
   * Registers a callback for device rescan requests.
   *
   * Rescan is requested when a device disconnects unexpectedly,
   * allowing the UI to refresh the device list.
   *
   * @param callback - Function to call when rescan is requested
   * @returns Unsubscribe function to remove the callback
   */
  onRescan(callback: () => void): () => void {
    return this.progressService.callbackManager.onRescan(callback);
  }

  /**
   * Registers a callback for popup display requests.
   *
   * Popups are used for error messages, warnings, and user notifications
   * during flash operations.
   *
   * @param callback - Function to call when a popup should be shown
   * @returns Unsubscribe function to remove the callback
   */
  onShowPopup(
    callback: (taskId: number, type: PopupType, title: string, message: string) => void
  ): () => void {
    return this.progressService.callbackManager.onShowPopup(callback);
  }

  /**
   * Registers a callback for confirmation requests.
   *
   * Confirmations are used for user decisions during flash operations,
   * such as proceeding with potentially dangerous actions.
   *
   * @param callback - Function to call when confirmation is needed, returns user's decision
   * @returns Unsubscribe function to remove the callback
   */
  onShowConfirm(
    callback: (taskId: number, title: string, message: string) => Promise<boolean>
  ): () => void {
    return this.progressService.callbackManager.onShowConfirm(callback);
  }

  /**
   * Checks if any flash operation is currently in progress.
   *
   * @returns True if any flash task is active or external working state is set
   */
  getIsFlashing(): boolean {
    return this.activeTaskIds.size > 0 || this.externalWorking;
  }

  /**
   * Checks if all active tasks are expecting a device reconnect.
   *
   * This is true during FEL mode transition when the device reboots
   * into FES mode and temporarily disconnects.
   *
   * @returns True if all active tasks expect reconnect
   */
  isExpectingReconnect(): boolean {
    return (
      this.activeTaskIds.size > 0 &&
      Array.from(this.activeTaskIds).every((taskId) => this.reconnectExpectedTaskIds.has(taskId))
    );
  }

  /**
   * Consumes and returns the result of a completed task.
   *
   * Results are cached for 60 seconds after task completion.
   * Calling this method removes the result from cache.
   *
   * @param taskId - Task ID to get result for
   * @returns Task result with success status, or null if not available
   */
  consumeTaskResult(taskId: number): { success: boolean } | null {
    const result = this.completedTaskResults.get(taskId);
    if (!result) {
      return null;
    }

    clearTimeout(result.cleanupTimer);
    this.completedTaskResults.delete(taskId);
    return { success: result.success };
  }

  /**
   * Sets the external working state for preparation phases.
   *
   * Used when the UI needs to indicate working state for operations
   * outside of actual flash operations (e.g., firmware loading, device preparation).
   *
   * @param working - True to set working state, false to clear
   */
  setExternalWorking(working: boolean): void {
    this.externalWorking = working;
    this.emitWorkingChange(this.getIsFlashing());
    if (working) {
      this.emitProgress({ percent: 0, stage: i18n.t('flashManager.preparingFlash') });
    } else {
      this.emitProgress({ percent: 100, stage: '' });
      this.emitComplete({ taskId: 0, success: true });
    }
  }

  /**
   * Ensures runtime IPC event handlers are bound.
   *
   * Binds handlers for flash progress, log, state, DRAM info, popup,
   * and confirmation events from the Rust backend. Also starts the
   * hot-plug monitoring service.
   *
   * This method is idempotent - calling it multiple times has no effect
   * after the first binding.
   *
   * @returns Promise that resolves when all event handlers are bound
   */
  private async ensureRuntimeEventsBound(): Promise<void> {
    if (this.runtimeBound) return;
    this.runtimeBound = true;
    this.bindHotPlugEvents();

    await hotPlugService.start().catch(() => {});

    await Promise.all([
      subscribeFlashProgress((payload) => {
        if (this.finalizedTaskIds.has(payload.taskId)) {
          return;
        }

        if (payload.stageId === 'fel_reconnect') {
          this.reconnectExpectedTaskIds.add(payload.taskId);
        } else {
          this.reconnectExpectedTaskIds.delete(payload.taskId);
        }

        this.emitProgress({
          taskId: payload.taskId,
          stageId: payload.stageId,
          percent: payload.overallPercent,
          stage: payload.stageLabel,
          currentPartition: payload.currentPartition,
          completedPartitions: payload.completedPartitions,
          partitionPercent: payload.partitionPercent,
          indeterminate: payload.indeterminate,
          writtenSize: payload.writtenBytes,
          totalSize: payload.totalBytes,
        });
      }),
      subscribeFlashLog((payload) => {
        if (this.finalizedTaskIds.has(payload.taskId)) {
          return;
        }
        this.emitLog({
          taskId: payload.taskId,
          timestamp: new Date(payload.timestamp),
          level: this.normalizeLogLevel(payload.level),
          message: payload.message,
        });
      }),
      subscribeFlashState((payload) => {
        if (this.finalizedTaskIds.has(payload.taskId)) {
          if (
            payload.status === 'completed' ||
            payload.status === 'failed' ||
            payload.status === 'cancelled'
          ) {
            this.finalizedTaskIds.delete(payload.taskId);
          }
          return;
        }

        if (
          payload.status === 'completed' ||
          payload.status === 'failed' ||
          payload.status === 'cancelled'
        ) {
          this.recordTaskResult(payload.taskId, payload.status === 'completed');
          this.activeTaskIds.delete(payload.taskId);
          this.reconnectExpectedTaskIds.delete(payload.taskId);
          this.taskTargets.delete(payload.taskId);
          this.emitWorkingChange(this.getIsFlashing());
        }

        if (payload.status === 'completed') {
          this.emitComplete({ taskId: payload.taskId, success: true });
          return;
        }

        if (payload.status === 'failed') {
          this.handleError(
            payload.taskId,
            payload.error ?? new Error(payload.message || 'Flash failed')
          );
          this.emitComplete({ taskId: payload.taskId, success: false });
          return;
        }

        if (payload.status === 'cancelled') {
          this.emitComplete({ taskId: payload.taskId, success: false });
        }
      }),
      subscribeFlashDramInfo((payload) => {
        if (this.finalizedTaskIds.has(payload.taskId)) {
          return;
        }
        this.emitDramInfo({
          taskId: payload.taskId,
          retAddr: payload.retAddr,
          dramInitFlag: payload.dramInitFlag,
          dramUpdateFlag: payload.dramUpdateFlag,
          dramPara: payload.dramPara,
        });
      }),
      subscribeFlashPopup((payload) => {
        if (this.finalizedTaskIds.has(payload.taskId)) {
          return;
        }
        this.emitShowPopup(
          payload.taskId,
          payload.popupType as PopupType,
          payload.title,
          payload.message
        );
      }),
      subscribeFlashConfirmRequest(async (payload) => {
        if (this.finalizedTaskIds.has(payload.taskId)) {
          await invokeCommand('flash_confirm', {
            taskId: payload.taskId,
            requestId: payload.requestId,
            confirmed: false,
          }).catch(() => {});
          return;
        }

        const confirmed = await this.progressService.callbackManager.emitShowConfirm(
          payload.taskId,
          payload.title,
          payload.message
        );

        await invokeCommand('flash_confirm', {
          taskId: payload.taskId,
          requestId: payload.requestId,
          confirmed,
        }).catch(() => {});
      }),
    ]);
  }

  /**
   * Binds hot-plug event handlers for device disconnect detection.
   *
   * Monitors USB device removal events and fails active flash tasks
   * when their target device disconnects unexpectedly.
   *
   * This method is idempotent - calling it multiple times has no effect
   * after the first binding.
   */
  private bindHotPlugEvents(): void {
    if (this.hotPlugBound) {
      return;
    }

    this.hotPlugBound = true;
    hotPlugService.onHotPlug((event) => {
      if (event.event !== 'left' || this.activeTaskIds.size === 0) {
        return;
      }

      this.failTasksForDisconnect(event);
    });
  }

  /**
   * Checks if a hot-plug event matches a task's target device.
   *
   * Matches by EFEX device ID or USB port number to identify which
   * task should be affected by a device disconnect event.
   *
   * @param taskId - Task ID to check
   * @param event - Hot-plug event with device information
   * @returns True if the event device matches the task target
   */
  private matchesTaskTarget(taskId: number, event: UsbHotPlugCallback): boolean {
    const target = this.taskTargets.get(taskId);
    if (!target) {
      return false;
    }

    if (event.efexDeviceId != null && target.deviceId != null) {
      return event.efexDeviceId === target.deviceId;
    }

    if (event.port != null && target.port != null) {
      return event.port === target.port;
    }

    return false;
  }

  /**
   * Resolves EFEX device target by matching with scanned devices.
   *
   * Used to obtain device ID for devices that may have been scanned
   * without initial device ID information.
   *
   * @param device - Device to resolve with bus/port information
   * @returns Promise resolving to device with resolved deviceId
   */
  private async resolveEfexTarget(device: FlashDevice): Promise<FlashDevice> {
    if (device.bus === undefined || device.port === undefined) {
      return device;
    }

    const devices = await invokeCommand('efex_scan_devices').catch(() => []);
    const matched = devices.find(
      (candidate) => candidate.bus === device.bus && candidate.port === device.port
    );

    if (!matched) {
      return device;
    }

    return {
      id: `efex-${matched.chip_version.toString(16)}-${matched.bus}-${matched.port}`,
      name: device.name,
      deviceId: matched.device_id,
      mode: matched.mode,
      modeStr: matched.mode_str,
      chipVersion: matched.chip_version,
      bus: matched.bus,
      port: matched.port,
    };
  }

  /**
   * Prepares a device for flashing by rebooting from ADB to FEL mode.
   *
   * Sends 'reboot efex' command via ADB shell, then waits for the device
   * to reconnect in FEL mode. Polls for FEL device with 30 retries at
   * 1-second intervals after initial 2-second delay.
   *
   * @param serial - ADB device serial number
   * @returns Promise resolving to FlashDevice in FEL mode
   * @throws Error if device fails to switch to FEL mode within timeout
   */
  private async prepareDeviceFromAdb(serial: string | null | undefined): Promise<FlashDevice> {
    this.emitLog({
      timestamp: new Date(),
      level: 'info',
      message: i18n.t('flashManager.adbHandler.sendingRebootEfex'),
    });

    await shellCommand(serial ?? null, 'reboot efex');
    this.emitLog({
      timestamp: new Date(),
      level: 'info',
      message: i18n.t('flashManager.adbHandler.rebootEfexSent'),
    });

    await this.sleep(2000);
    for (let i = 0; i < 30; i++) {
      const devices = await invokeCommand('efex_scan_devices').catch(() => []);
      const fel = devices.find((candidate) => candidate.mode === 'fel');
      if (fel) {
        this.emitLog({
          timestamp: new Date(),
          level: 'info',
          message: i18n.t('flashManager.adbHandler.switchedToFel'),
        });
        return {
          id: `efex-${fel.chip_version.toString(16)}-${fel.bus}-${fel.port}`,
          name: `0x${fel.chip_version.toString(16)}`,
          deviceId: fel.device_id,
          mode: fel.mode,
          modeStr: fel.mode_str,
          chipVersion: fel.chip_version,
          bus: fel.bus,
          port: fel.port,
        };
      }

      this.emitLog({
        timestamp: new Date(),
        level: 'info',
        message: i18n.t('flashManager.adbHandler.notSwitchedYet', { retry: i + 1, max: 30 }),
      });
      await this.sleep(1000);
    }

    throw new Error(i18n.t('flashManager.adbHandler.reconnectFailed'));
  }

  /**
   * Handles errors during flash operations.
   *
   * Maps errors to user-friendly messages, logs the error, triggers
   * device rescan for protocol/USB errors, and shows appropriate popup.
   *
   * @param taskId - Task ID that encountered the error
   * @param error - Error object or unknown error value
   */
  private handleError(taskId: number, error: unknown): void {
    const { error: mapped, popup } = mapFlashError(error);
    this.emitLog({
      taskId,
      timestamp: new Date(),
      level: 'error',
      message: i18n.t('flashManager.flashFailed', {
        error: `${mapped.name} (${mapped.code}): ${mapped.message}`,
      }),
    });

    if (mapped.isProtocolError() || mapped.isUsbError()) {
      this.emitLog({
        taskId,
        timestamp: new Date(),
        level: 'error',
        message: i18n.t('deviceScanner.deviceDisconnected', 'Device disconnected'),
      });
      this.emitRescan();
    }

    if (popup) {
      this.emitShowPopup(taskId, popup.type, popup.title, popup.message);
    } else {
      this.emitShowPopup(
        taskId,
        'error',
        i18n.t('flashManager.flashFailedTitle', 'Flash Failed'),
        mapped.message
      );
    }
  }

  /**
   * Fails active flash tasks when their target device disconnects.
   *
   * Called when a USB hot-plug 'left' event is detected. Matches
   * disconnected device to active tasks and marks them as failed,
   * except for tasks expecting reconnect (FEL mode transition).
   *
   * @param event - Hot-plug event with disconnected device information
   */
  private failTasksForDisconnect(event: UsbHotPlugCallback): void {
    const taskIds = Array.from(this.activeTaskIds).filter((taskId) =>
      this.matchesTaskTarget(taskId, event)
    );
    if (taskIds.length === 0) {
      return;
    }

    for (const taskId of taskIds) {
      if (this.reconnectExpectedTaskIds.has(taskId)) {
        continue;
      }
      this.finalizedTaskIds.add(taskId);
      this.recordTaskResult(taskId, false);
      this.reconnectExpectedTaskIds.delete(taskId);
      this.taskTargets.delete(taskId);
      this.emitLog({
        taskId,
        timestamp: new Date(),
        level: 'error',
        message: i18n.t('deviceScanner.deviceDisconnected', 'Device disconnected'),
      });
      this.activeTaskIds.delete(taskId);
      this.emitComplete({ taskId, success: false });
      invokeCommand('flash_cancel', { taskId }).catch(() => {});
    }

    this.emitWorkingChange(this.getIsFlashing());
  }

  /**
   * Records a task result with auto-expiration cleanup.
   *
   * Results are cached for 60 seconds to allow consumers to retrieve
   * the outcome of completed tasks. Clears any existing timer for
   * the task before setting a new one.
   *
   * @param taskId - Task ID to record result for
   * @param success - Whether the task completed successfully
   */
  private recordTaskResult(taskId: number, success: boolean): void {
    const existing = this.completedTaskResults.get(taskId);
    if (existing) {
      clearTimeout(existing.cleanupTimer);
    }

    const cleanupTimer = setTimeout(() => {
      this.completedTaskResults.delete(taskId);
    }, 60000);

    this.completedTaskResults.set(taskId, { success, cleanupTimer });
  }

  /**
   * Normalizes log level strings from backend to LogEntry level types.
   *
   * @param level - Log level string from backend
   * @returns Normalized LogEntry level
   */
  private normalizeLogLevel(level: string): LogEntry['level'] {
    if (level === 'warn') return 'warn';
    if (level === 'error') return 'error';
    if (level === 'success') return 'success';
    return 'info';
  }

  /** Creates a promise that resolves after specified milliseconds */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Emits progress update through progress service */
  private emitProgress(progress: FlashProgress): void {
    this.progressService.emitProgress(progress);
  }

  /** Emits log entry through progress service */
  private emitLog(log: LogEntry): void {
    this.progressService.emitLog(log);
  }

  /** Emits completion event through progress service */
  private emitComplete(result: { taskId: number; success: boolean }): void {
    this.progressService.emitComplete(result);
  }

  /** Emits DRAM info through progress service */
  private emitDramInfo(info: FlashDramInfo): void {
    this.progressService.emitDramInfo(info);
  }

  /** Emits working state change through progress service */
  private emitWorkingChange(working: boolean): void {
    this.progressService.emitWorkingChange(working);
  }

  /** Emits rescan request through progress service */
  private emitRescan(): void {
    this.progressService.emitRescan();
  }

  /** Emits popup display request through progress service */
  private emitShowPopup(taskId: number, type: PopupType, title: string, message: string): void {
    this.progressService.emitShowPopup(taskId, type, title, message);
  }
}

/** Singleton instance of FlashOrchestrator for global flash management */
export const flashManager = new FlashOrchestrator();

/** Export FlashOrchestrator type for external type annotations */
export type { FlashOrchestrator };

/** Export all types from FlashManager module */
export * from './Types';

/** Export ErrorHandler for external error handling utilities */
export * from './ErrorHandler';

/** Export FlashCallbacks type for callback type annotations */
export type { FlashCallbacks } from './Callbacks';
