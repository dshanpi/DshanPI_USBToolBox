import type { LogLevel } from '../../FlashManager';

/** Maximum number of parallel flash slots */
export const MAX_SLOTS = 48;

/**
 * Slot status type enumeration.
 *
 * Defines the current state of a flash slot in mass production.
 */
export type SlotStatus = 'idle' | 'waiting' | 'flashing' | 'success' | 'failed';

/**
 * Device slot information for mass production.
 *
 * Represents a single slot in the mass production interface,
 * tracking the device connection, flash progress, and status.
 */
export interface DeviceSlot {
  /** Slot identifier (0-47) */
  id: number;
  /** Current slot status */
  status: SlotStatus;
  /** USB bus number of connected device */
  bus: number | null;
  /** USB port number of connected device */
  port: number | null;
  /** Flash task ID if actively flashing */
  taskId: number | null;
  /** Flash progress percentage (0-100) */
  progress: number;
  /** Current flash stage name */
  stage: string;
  /** Flash speed string (e.g., "1.5 MB/s") */
  speed: string | null;
  /** Error message if failed */
  error: string | null;
  /** Flash start timestamp */
  startTime: number | null;
  /** Flash end timestamp */
  endTime: number | null;
  /** Number of successful flashes on this slot */
  flashCount: number;
}

/**
 * Mass production statistics summary.
 *
 * Aggregated counts for all slots showing total, success,
 * failed, and in-progress flash operations.
 */
export interface FlashStats {
  /** Total devices processed */
  total: number;
  /** Successful flashes */
  success: number;
  /** Failed flashes */
  failed: number;
  /** Currently flashing */
  inProgress: number;
}

/**
 * Mass production log entry structure.
 *
 * Individual log message with timestamp, level, optional slot ID,
 * and message content.
 */
export interface MassProductionLog {
  /** Log timestamp */
  timestamp: Date;
  /** Log level (info, warn, error, success) */
  level: LogLevel;
  /** Log message content */
  message: string;
  /** Slot ID if slot-specific log */
  slotId?: number;
}

/**
 * Creates an array of empty device slots.
 *
 * Initializes all MAX_SLOTS slots with idle status and
 * default values for mass production UI.
 *
 * @returns Array of empty DeviceSlot structures
 */
export function createEmptySlots(): DeviceSlot[] {
  return Array.from({ length: MAX_SLOTS }, (_, i) => ({
    id: i,
    status: 'idle' as SlotStatus,
    bus: null,
    port: null,
    taskId: null,
    progress: 0,
    stage: '',
    speed: null,
    error: null,
    startTime: null,
    endTime: null,
    flashCount: 0,
  }));
}