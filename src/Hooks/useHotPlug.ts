import { useEffect, useRef, useCallback } from 'react';
import { hotPlugService, type UsbHotPlugCallback } from '../Services';

/**
 * React hook for monitoring USB hot-plug events.
 *
 * Provides automatic device connect/disconnect detection using
 * the HotPlugService. Events are debounced for 'arrived' events
 * to prevent rapid-fire updates during device initialization.
 *
 * The hook automatically starts the hot-plug service and manages
 * subscription lifecycle. It can be paused/resumed based on the
 * enabled and isActive parameters.
 *
 * Example usage:
 * ```typescript
 * useHotPlug(
 *   (event) => {
 *     if (event.event === 'arrived') {
 *       console.log('Device connected');
 *     } else {
 *       console.log('Device disconnected');
 *     }
 *   },
 *   true,  // enabled
 *   true   // isActive
 * );
 * ```
 *
 * @param onDeviceChange - Callback for hot-plug events
 * @param enabled - Whether hot-plug detection is enabled (default true)
 * @param isActive - Whether the component is active (default true)
 * @returns Object with isStarted status
 */
export function useHotPlug(
  onDeviceChange: (event: UsbHotPlugCallback) => void,
  enabled: boolean = true,
  isActive: boolean = true
) {
  /** Ref tracking if hot-plug service has started */
  const startedRef = useRef(false);

  /** Ref storing unsubscribe function */
  const unsubscribeRef = useRef<(() => void) | null>(null);

  /** Ref for pending debounce timer */
  const pendingEventRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Ref for enabled state (synced from prop) */
  const enabledRef = useRef(enabled);

  /** Ref for isActive state (synced from prop) */
  const isActiveRef = useRef(isActive);

  /** Ref for initialization complete flag (1 second after start) */
  const initializedRef = useRef(false);

  // Keep refs synchronized with props for callback access
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  /**
   * Starts the hot-plug monitoring service.
   *
   * Sets initialized flag after 1 second to filter out
   * initial device detection noise.
   */
  const startHotPlug = useCallback(async () => {
    if (startedRef.current) {
      return;
    }

    try {
      await hotPlugService.start();
      startedRef.current = true;
      // Delay initialization to avoid processing startup events
      setTimeout(() => {
        initializedRef.current = true;
      }, 1000);
    } catch (error) {
      console.error('Failed to start hotplug watcher:', error);
    }
  }, []);

  /**
   * Handles hot-plug events with debouncing for 'arrived' events.
   *
   * 'arrived' events are debounced by 50ms to prevent multiple
   * callback invocations during device initialization.
   * 'left' events are processed immediately for responsive disconnect handling.
   *
   * @param event - Hot-plug event from the service
   */
  const handleHotPlugEvent = useCallback(
    (event: UsbHotPlugCallback) => {
      if (!enabledRef.current || !isActiveRef.current) return;

      if (event.event === 'arrived') {
        // Ignore events during initialization phase
        if (!initializedRef.current) return;

        // Debounce arrived events
        if (pendingEventRef.current) {
          clearTimeout(pendingEventRef.current);
        }

        pendingEventRef.current = setTimeout(() => {
          if (!enabledRef.current || !isActiveRef.current) return;
          onDeviceChange(event);
          pendingEventRef.current = null;
        }, 50);
      } else {
        // Process 'left' events immediately
        if (pendingEventRef.current) {
          clearTimeout(pendingEventRef.current);
          pendingEventRef.current = null;
        }
        onDeviceChange(event);
      }
    },
    [onDeviceChange]
  );

  // Manage hot-plug subscription based on enabled state
  useEffect(() => {
    if (!enabled) {
      // Clean up when disabled
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (pendingEventRef.current) {
        clearTimeout(pendingEventRef.current);
        pendingEventRef.current = null;
      }
      hotPlugService.pause();
      return;
    }

    // Start service and subscribe when enabled
    startHotPlug();
    hotPlugService.resume();

    const unsubscribe = hotPlugService.onHotPlug(handleHotPlugEvent);
    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
      unsubscribeRef.current = null;
      if (pendingEventRef.current) {
        clearTimeout(pendingEventRef.current);
        pendingEventRef.current = null;
      }
    };
  }, [enabled, startHotPlug, handleHotPlugEvent]);

  return {
    /** Whether hot-plug service has been started */
    isStarted: startedRef.current,
  };
}