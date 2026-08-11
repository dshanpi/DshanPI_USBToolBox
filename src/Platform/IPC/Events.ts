import type { UnlistenFn } from '@tauri-apps/api/event';
import type { EventPayload } from './Commands';
import { subscribeEvent } from './Client';

/**
 * Subscribes to USB hot-plug events.
 *
 * Events are emitted when USB devices connect or disconnect.
 * Used by useHotPlug hook for device monitoring.
 *
 * @param handler - Callback function for hot-plug events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribeUsbHotplug(
  handler: (payload: EventPayload<'usb-hotplug'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('usb-hotplug', handler);
}

/**
 * Subscribes to firmware packer log events.
 *
 * Log events are emitted during firmware packing operations.
 *
 * @param handler - Callback function for log events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribePackerLog(
  handler: (payload: EventPayload<'packer-log'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('packer-log', handler);
}

/**
 * Subscribes to firmware packer progress events.
 *
 * Progress events report packing stage, current/total items,
 * and status messages during firmware creation.
 *
 * @param handler - Callback function for progress events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribePackerProgress(
  handler: (payload: EventPayload<'packer-progress'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('packer-progress', handler);
}

/**
 * Subscribes to flash operation progress events.
 *
 * Progress events report stage, percentage, partition info,
 * and bytes written during flash operations.
 *
 * @param handler - Callback function for progress events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribeFlashProgress(
  handler: (payload: EventPayload<'flash-progress'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('flash-progress', handler);
}

/**
 * Subscribes to flash operation log events.
 *
 * Log events provide timestamped messages with level info,
 * useful for displaying flash operation logs in UI.
 *
 * @param handler - Callback function for log events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribeFlashLog(
  handler: (payload: EventPayload<'flash-log'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('flash-log', handler);
}

/**
 * Subscribes to flash operation state change events.
 *
 * State events indicate operation lifecycle: started, completed,
 * failed, or cancelled.
 *
 * @param handler - Callback function for state events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribeFlashState(
  handler: (payload: EventPayload<'flash-state'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('flash-state', handler);
}

/**
 * Subscribes to flash operation popup events.
 *
 * Popup events request UI dialogs for user notifications
 * during flash operations.
 *
 * @param handler - Callback function for popup events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribeFlashPopup(
  handler: (payload: EventPayload<'flash-popup'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('flash-popup', handler);
}

/**
 * Subscribes to flash confirmation request events.
 *
 * Confirmation events request user approval for operations
 * like overwriting existing data or continuing after errors.
 *
 * @param handler - Callback function for confirmation events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribeFlashConfirmRequest(
  handler: (payload: EventPayload<'flash-confirm-request'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('flash-confirm-request', handler);
}

/**
 * Subscribes to DRAM initialization info events.
 *
 * DRAM info events provide initialization parameters returned
 * after FEL mode DRAM setup, useful for DRAM tuning.
 *
 * @param handler - Callback function for DRAM info events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribeFlashDramInfo(
  handler: (payload: EventPayload<'flash-dram-info'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('flash-dram-info', handler);
}

/**
 * Subscribes to mass production slot update events.
 *
 * Slot update events report individual slot status during
 * multi-device parallel flashing operations.
 *
 * @param handler - Callback function for slot update events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribeMassSlotUpdate(
  handler: (payload: EventPayload<'mass-slot-update'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('mass-slot-update', handler);
}

/**
 * Subscribes to mass production log events.
 *
 * Log events provide timestamped messages from mass production
 * flashing operations across all slots.
 *
 * @param handler - Callback function for log events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribeMassLog(
  handler: (payload: EventPayload<'mass-log'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('mass-log', handler);
}

/**
 * Subscribes to mass production state events.
 *
 * State events report overall mass production status including
 * counts for total, success, failed, and in-progress operations.
 *
 * @param handler - Callback function for state events
 * @returns Promise resolving to unsubscribe function
 */
export function subscribeMassState(
  handler: (payload: EventPayload<'mass-state'>) => void
): Promise<UnlistenFn> {
  return subscribeEvent('mass-state', handler);
}