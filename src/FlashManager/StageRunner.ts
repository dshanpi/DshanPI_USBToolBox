import { ProgressManager, FULL_FLASH_STAGES } from './ProgressManager';
import type { FlashProgress } from './Types';

/**
 * Manages ProgressManager lifecycle for flash operations.
 *
 * StageRunner creates and tracks a ProgressManager instance,
 * allowing it to be retrieved and cleared as needed.
 * Useful for operations that need progress tracking with
 * automatic cleanup.
 */
export class StageRunner {
  /** Current active ProgressManager instance */
  private progressManager: ProgressManager | null = null;

  /**
   * Creates a new ProgressManager with full flash stages.
   *
   * @param onProgress - Callback function for progress updates
   * @returns ProgressManager instance for stage management
   */
  create(onProgress: (progress: FlashProgress) => void): ProgressManager {
    this.progressManager = new ProgressManager(onProgress);
    this.progressManager.defineStages(FULL_FLASH_STAGES);
    return this.progressManager;
  }

  /**
   * Gets the current ProgressManager instance.
   *
   * @returns ProgressManager or null if not created
   */
  get current(): ProgressManager | null {
    return this.progressManager;
  }

  /**
   * Clears and destroys the current ProgressManager.
   */
  clear(): void {
    this.progressManager = null;
  }
}