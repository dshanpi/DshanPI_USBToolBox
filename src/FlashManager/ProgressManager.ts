import { FlashProgress } from './Types';
import i18n from '../i18n';

/**
 * Represents a progress stage in the flash operation.
 *
 * Each stage has a unique ID, a translation key for display,
 * and a weight for calculating overall progress.
 */
export interface ProgressStage {
  /** Unique stage identifier (e.g., 'init_dram', 'download_uboot') */
  id: string;
  /** I18n translation key for stage name */
  nameKey: string;
  /** Weight for overall progress calculation (relative to other stages) */
  weight: number;
}

/**
 * Progress information for a single stage.
 *
 * Used by sub-progress callbacks to report progress within a stage.
 */
export interface StageProgress {
  /** Stage name or label */
  stage: string;
  /** Progress percentage for this stage (0-100) */
  percent: number;
}

type ProgressCallback = (progress: FlashProgress) => void;

/**
 * Manages progress tracking for flash operations with weighted stages.
 *
 * ProgressManager provides a fluent API for defining stages, updating
 * progress, and emitting unified progress callbacks. It calculates
 * overall progress based on stage weights and current stage progress.
 *
 * Example usage:
 * ```typescript
 * const manager = new ProgressManager(callback)
 *   .defineStages(FEL_STAGES)
 *   .startStage('init_dram');
 * manager.updateStageProgress(50);
 * manager.completeStage();
 * manager.nextStage('download_uboot');
 * ```
 */
export class ProgressManager {
  /** Defined progress stages for this operation */
  private stages: ProgressStage[] = [];

  /** Index of the currently active stage */
  private currentStageIndex: number = 0;

  /** Progress percentage within current stage (0-100) */
  private currentStageProgress: number = 0;

  /** Callback function for progress emission */
  private callback: ProgressCallback;

  /** Total weight of all stages for percentage calculation */
  private totalWeight: number = 0;

  /** Additional progress information (partition names, sizes, etc.) */
  private extraInfo: Partial<FlashProgress> = {};

  /** Whether progress is indeterminate (spinner mode) */
  private isIndeterminate: boolean = false;

  /** Set of completed partition names */
  private completedPartitions: Set<string> = new Set();

  /** Progress percentage for current partition if applicable */
  private partitionPercent: number | undefined = undefined;

  /**
   * Creates a new ProgressManager with the specified callback.
   *
   * @param callback - Function to call when progress updates
   */
  constructor(callback: ProgressCallback) {
    this.callback = callback;
  }

  /**
   * Defines the complete set of stages for this operation.
   *
   * Replaces any existing stages and recalculates total weight.
   *
   * @param stages - Array of ProgressStage definitions
   * @returns this for chaining
   */
  defineStages(stages: ProgressStage[]): this {
    this.stages = stages;
    this.totalWeight = stages.reduce((sum, s) => sum + s.weight, 0);
    return this;
  }

  /**
   * Adds a single stage to the stage list.
   *
   * @param id - Unique stage identifier
   * @param nameKey - I18n translation key for stage name
   * @param weight - Stage weight for progress calculation
   * @returns this for chaining
   */
  addStage(id: string, nameKey: string, weight: number): this {
    this.stages.push({ id, nameKey, weight });
    this.totalWeight += weight;
    return this;
  }

  /**
   * Sets additional progress information.
   *
   * Merges provided info with existing extraInfo.
   *
   * @param info - Partial FlashProgress fields to add
   * @returns this for chaining
   */
  setExtraInfo(info: Partial<FlashProgress>): this {
    this.extraInfo = { ...this.extraInfo, ...info };
    return this;
  }

  /**
   * Sets the current partition name being flashed.
   *
   * @param partitionName - Partition name or undefined to clear
   * @returns this for chaining
   */
  setCurrentPartition(partitionName: string | undefined): this {
    if (partitionName) {
      this.extraInfo = { ...this.extraInfo, currentPartition: partitionName };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { currentPartition: _, ...rest } = this.extraInfo;
      this.extraInfo = rest;
    }
    return this;
  }

  /**
   * Marks a partition as completed.
   *
   * Adds to completedPartitions set and updates extraInfo.
   *
   * @param partitionName - Name of completed partition
   * @returns this for chaining
   */
  markPartitionCompleted(partitionName: string): this {
    this.completedPartitions.add(partitionName);
    this.extraInfo = {
      ...this.extraInfo,
      completedPartitions: Array.from(this.completedPartitions),
    };
    return this;
  }

  /**
   * Clears all extra progress information.
   *
   * @returns this for chaining
   */
  clearExtraInfo(): this {
    this.extraInfo = {};
    return this;
  }

  /**
   * Sets indeterminate mode for operations without known duration.
   *
   * @param indeterminate - True to enable indeterminate mode
   * @returns this for chaining
   */
  setIndeterminate(indeterminate: boolean): this {
    this.isIndeterminate = indeterminate;
    return this;
  }

  /**
   * Sets progress percentage for current partition.
   *
   * @param percent - Partition progress percentage or undefined
   * @returns this for chaining
   */
  setPartitionPercent(percent: number | undefined): this {
    this.partitionPercent = percent;
    return this;
  }

  /**
   * Starts a specific stage by its ID.
   *
   * Sets current stage index and resets stage progress to 0.
   * Emits initial progress for the stage.
   *
   * @param stageId - Stage identifier to start
   * @returns this for chaining
   */
  startStage(stageId: string): this {
    const index = this.stages.findIndex((s) => s.id === stageId);
    if (index === -1) {
      console.warn(`Stage ${stageId} not found`);
      return this;
    }
    this.currentStageIndex = index;
    this.currentStageProgress = 0;
    this.emitProgress(i18n.t(this.stages[index].nameKey), 0);
    return this;
  }

  /**
   * Updates progress within the current stage.
   *
   * Clamps progress to 0-100 range and emits updated progress.
   *
   * @param progress - Progress percentage for current stage
   * @param stageName - Optional stage name override
   * @returns this for chaining
   */
  updateStageProgress(progress: number, stageName?: string): this {
    this.currentStageProgress = Math.min(100, Math.max(0, progress));
    const currentStage = this.stages[this.currentStageIndex];
    const name = stageName || (currentStage ? i18n.t(currentStage.nameKey) : '');
    this.emitProgress(name, this.currentStageProgress);
    return this;
  }

  /**
   * Marks the current stage as complete.
   *
   * Sets stage progress to 100 and emits completion.
   *
   * @param stageName - Optional stage name override
   * @returns this for chaining
   */
  completeStage(stageName?: string): this {
    const currentStage = this.stages[this.currentStageIndex];
    const name = stageName || (currentStage ? i18n.t(currentStage.nameKey) : '');
    this.currentStageProgress = 100;
    this.emitProgress(name, 100);
    return this;
  }

  /**
   * Advances to the next stage or a specific stage.
   *
   * Resets progress to 0 and emits initial progress for new stage.
   *
   * @param stageId - Optional specific stage ID to jump to
   * @returns this for chaining
   */
  nextStage(stageId?: string): this {
    if (stageId) {
      const index = this.stages.findIndex((s) => s.id === stageId);
      if (index !== -1) {
        this.currentStageIndex = index;
      }
    } else {
      this.currentStageIndex++;
    }
    this.currentStageProgress = 0;
    const currentStage = this.stages[this.currentStageIndex];
    if (currentStage) {
      this.emitProgress(i18n.t(currentStage.nameKey), 0);
    }
    return this;
  }

  /**
   * Calculates overall progress percentage across all stages.
   *
   * Uses weighted calculation based on stage weights and
   * current progress within each stage.
   *
   * @returns Overall progress percentage (0-100)
   */
  getOverallPercent(): number {
    let completedWeight = 0;

    for (let i = 0; i < this.currentStageIndex; i++) {
      completedWeight += this.stages[i].weight;
    }

    const currentStage = this.stages[this.currentStageIndex];
    if (currentStage) {
      completedWeight += currentStage.weight * (this.currentStageProgress / 100);
    }

    return (completedWeight / this.totalWeight) * 100;
  }

  /**
   * Emits progress callback with calculated overall percentage.
   *
   * @param stage - Current stage name
   * @param _localProgress - Local progress (unused, for calculation)
   */
  private emitProgress(stage: string, _localProgress: number): void {
    const percent = this.getOverallPercent();
    this.callback({
      percent: Math.round(percent * 100) / 100,
      stage,
      ...this.extraInfo,
      indeterminate: this.isIndeterminate,
      partitionPercent: this.partitionPercent,
    });
  }

  /**
   * Creates a sub-progress callback for nested progress reporting.
   *
   * The returned callback can be passed to sub-operations that
   * report their own progress, which gets scaled by weightRatio.
   *
   * @param weightRatio - Factor to scale sub-progress (default 1)
   * @returns Callback function accepting StageProgress
   */
  createSubProgressCallback(weightRatio: number = 1): (progress: StageProgress) => void {
    return (progress: StageProgress) => {
      this.updateStageProgress(progress.percent * weightRatio, progress.stage);
    };
  }

  /**
   * Gets progress percentage for a specific stage.
   *
   * @param stageId - Stage identifier to query
   * @returns Progress percentage (100 for completed, 0 for pending, current for active)
   */
  getStagePercent(stageId: string): number {
    const index = this.stages.findIndex((s) => s.id === stageId);
    if (index === -1) return 0;
    if (index < this.currentStageIndex) return 100;
    if (index > this.currentStageIndex) return 0;
    return this.currentStageProgress;
  }

  /**
   * Resets progress manager to initial state.
   *
   * Clears stage index, progress, and extra info.
   *
   * @returns this for chaining
   */
  reset(): this {
    this.currentStageIndex = 0;
    this.currentStageProgress = 0;
    this.extraInfo = {};
    return this;
  }

  /**
   * Gets the currently active stage definition.
   *
   * @returns Current ProgressStage or undefined if out of range
   */
  getCurrentStage(): ProgressStage | undefined {
    return this.stages[this.currentStageIndex];
  }

  /**
   * Gets all defined stages as a copy.
   *
   * @returns Array of ProgressStage definitions
   */
  getStages(): ProgressStage[] {
    return [...this.stages];
  }
}

/**
 * Stages for FEL mode preparation before flash.
 *
 * Covers DRAM initialization, UBoot download, and device reconnect
 * after transitioning from FEL to FES mode.
 */
export const FEL_STAGES: ProgressStage[] = [
  { id: 'prepare', nameKey: 'flashManager.stages.prepareFes', weight: 2 },
  { id: 'init_dram', nameKey: 'flashManager.stages.initDram', weight: 40 },
  { id: 'download_uboot', nameKey: 'flashManager.stages.downloadUboot', weight: 25 },
  { id: 'reconnect', nameKey: 'flashManager.stages.waitReconnect', weight: 20 },
  { id: 'ready', nameKey: 'flashManager.stages.prepareFlash', weight: 3 },
];

/**
 * Stages for FES mode partition flashing.
 *
 * Covers secure boot query, storage info, MBR, partition downloads,
 * boot code, and device mode setting after completion.
 */
export const FES_STAGES: ProgressStage[] = [
  { id: 'query_secure', nameKey: 'flashManager.stages.queryBootMode', weight: 2 },
  { id: 'erase_flag', nameKey: 'flashManager.stages.sendEraseFlag', weight: 3 },
  { id: 'query_storage', nameKey: 'flashManager.stages.queryStorageInfo', weight: 2 },
  { id: 'mbr', nameKey: 'flashManager.stages.flashMbr', weight: 5 },
  { id: 'partitions', nameKey: 'flashManager.stages.flashPartitions', weight: 80 },
  { id: 'boot', nameKey: 'flashManager.stages.downloadBoot', weight: 5 },
  { id: 'set_mode', nameKey: 'flashManager.stages.setDeviceMode', weight: 2 },
  { id: 'complete', nameKey: 'flashManager.stages.complete', weight: 1 },
];

/**
 * Combined stages for full flash operation (FEL + FES).
 *
 * Covers complete workflow from image loading through FEL preparation
 * to FES partition flashing and final completion.
 */
export const FULL_FLASH_STAGES: ProgressStage[] = [
  { id: 'load_image', nameKey: 'flashManager.stages.loadImage', weight: 3 },
  { id: 'open_device', nameKey: 'flashManager.stages.openDevice', weight: 2 },
  { id: 'fel_prepare', nameKey: 'flashManager.stages.prepareFes', weight: 1 },
  { id: 'fel_init_dram', nameKey: 'flashManager.stages.initDram', weight: 20 },
  { id: 'fel_download_uboot', nameKey: 'flashManager.stages.downloadUboot', weight: 12 },
  { id: 'fel_reconnect', nameKey: 'flashManager.stages.waitReconnect', weight: 10 },
  { id: 'fel_ready', nameKey: 'flashManager.stages.prepareFlash', weight: 2 },
  { id: 'fes_flash', nameKey: 'flashManager.stages.fesFlash', weight: 35 },
  { id: 'complete', nameKey: 'flashManager.stages.complete', weight: 5 },
];

/**
 * Creates a ProgressManager configured for full flash operations.
 *
 * @param callback - Progress callback function
 * @returns ProgressManager with FULL_FLASH_STAGES defined
 */
export function createFullFlashProgressManager(callback: ProgressCallback): ProgressManager {
  return new ProgressManager(callback).defineStages(FULL_FLASH_STAGES);
}

/**
 * Creates a ProgressManager configured for FES mode operations.
 *
 * @param callback - Progress callback function
 * @returns ProgressManager with FES_STAGES defined
 */
export function createFesProgressManager(callback: ProgressCallback): ProgressManager {
  return new ProgressManager(callback).defineStages(FES_STAGES);
}

/**
 * Creates a ProgressManager configured for FEL mode preparation.
 *
 * @param callback - Progress callback function
 * @returns ProgressManager with FEL_STAGES defined
 */
export function createFelProgressManager(callback: ProgressCallback): ProgressManager {
  return new ProgressManager(callback).defineStages(FEL_STAGES);
}