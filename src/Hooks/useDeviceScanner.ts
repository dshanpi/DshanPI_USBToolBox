import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  flashManager,
  getErrorSolution,
  formatErrorForLog,
  FlashDevice,
  LogEntry,
} from '../FlashManager';
import { useHotPlug } from './useHotPlug';
import {
  isDeviceReady as checkDeviceReady,
  getDeviceStatusDisplay as getDeviceStatus,
} from '../Utils/Device';
import { EFEX_ERROR_CODES, isEfexError } from '../Library/libEFEX';
import { deviceDiscoveryService, type UsbHotPlugCallback } from '../Services';

/**
 * Popup type for device scanner notifications.
 *
 * - 'error': Critical error requiring user attention
 * - 'warning': Non-critical issue or caution
 * - 'info': Informational message
 * - 'success': Success notification
 */
export type PopupType = 'error' | 'warning' | 'info' | 'success';

/**
 * Configuration options for the useDeviceScanner hook.
 */
export interface UseDeviceScannerOptions {
  /** Function to add log entries during device scanning */
  addLog: (level: LogEntry['level'], message: string) => void;
  /** Optional function to show popup notifications */
  showPopup?: (type: PopupType, title: string, message: string) => void;
  /** Enable automatic hot-plug device detection */
  enableHotPlug?: boolean;
  /** Whether the scanner is currently active (visible to user) */
  isActive?: boolean;
  /** Callback when a single ready device is found */
  onDeviceReady?: () => void;
}

/**
 * Result returned by the useDeviceScanner hook.
 *
 * Provides device list, selection state, scanning controls,
 * and device status helpers.
 */
export interface DeviceScannerResult {
  /** Current list of discovered devices */
  devices: FlashDevice[];
  /** Currently selected device for operations */
  selectedDevice: FlashDevice | null;
  /** Whether a scan is currently in progress */
  scanning: boolean;
  /** Trigger device scan, optionally from hot-plug event or key press */
  handleScanDevices: (hotPlug?: boolean, isKeyPress?: boolean) => Promise<void>;
  /** Select a device for operations */
  handleSelectDevice: (device: FlashDevice) => Promise<void>;
  /** Clear all devices and selection */
  clearDevices: () => Promise<void>;
  /** Check if a device is ready for flash operations */
  isDeviceReady: (device: FlashDevice | null) => boolean;
  /** Get localized device status display string */
  getDeviceStatusDisplay: (device: FlashDevice | null) => string;
  /** Set selected device directly */
  setSelectedDevice: (device: FlashDevice) => Promise<void>;
  /** Set devices list directly */
  setDevices: React.Dispatch<React.SetStateAction<FlashDevice[]>>;
  /** Enable or disable hot-plug detection */
  setHotPlugEnabled: (enabled: boolean) => void;
}

/**
 * React hook for managing device discovery and selection.
 *
 * Provides comprehensive device scanning functionality including:
 * - Manual device scanning via handleScanDevices
 * - Automatic hot-plug device detection
 * - Device selection management
 * - Integration with FlashManager for rescan events
 * - Error handling and user notifications
 *
 * Automatically selects a single ready device when found.
 * Handles device disconnect events and refreshes selection.
 *
 * Example usage:
 * ```typescript
 * const scanner = useDeviceScanner({
 *   addLog: (level, msg) => console.log(`${level}: ${msg}`),
 *   enableHotPlug: true,
 * });
 * await scanner.handleScanDevices();
 * ```
 *
 * @param options - Configuration options for the scanner
 * @returns DeviceScannerResult with device state and controls
 */
export function useDeviceScanner(options: UseDeviceScannerOptions): DeviceScannerResult {
  const { addLog, showPopup, enableHotPlug = false, isActive = true } = options;

  const { t } = useTranslation();
  const [devices, setDevices] = useState<FlashDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<FlashDevice | null>(null);
  const [scanning, setScanning] = useState(false);
  const [hotPlugEnabled, setHotPlugEnabled] = useState(true);

  /** Ref to prevent concurrent scans */
  const scanningRef = useRef(false);

  /** Ref for hot-plug enabled state (used in callbacks) */
  const hotPlugEnabledRef = useRef(true);

  /** Ref for current selected device (used in callbacks) */
  const selectedDeviceRef = useRef<FlashDevice | null>(null);

  /** Ref for active state (used in callbacks) */
  const isActiveRef = useRef(isActive);

  /** Ref to track if initial auto-scan was performed */
  const autoScannedRef = useRef(false);

  /**
   * Checks if a device matches a hot-plug event.
   *
   * Used to identify which device was connected/disconnected
   * based on USB device ID or port number.
   *
   * @param device - Device to check
   * @param event - Hot-plug event with device information
   * @returns True if device matches the event
   */
  const matchesHotplugDevice = useCallback((device: FlashDevice, event: UsbHotPlugCallback) => {
    if (device.mode === 'adb') {
      return false;
    }

    if (event.efexDeviceId != null && device.deviceId != null) {
      return event.efexDeviceId === device.deviceId;
    }

    return event.port != null && device.port != null && event.port === device.port;
  }, []);

  // Keep refs synchronized with state for callback access
  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  /**
   * Sets hot-plug enabled state with ref synchronization.
   *
   * @param enabled - Whether hot-plug detection is enabled
   */
  const setHotPlugEnabledCallback = useCallback((enabled: boolean) => {
    hotPlugEnabledRef.current = enabled;
    setHotPlugEnabled(enabled);
  }, []);

  /**
   * Clears the currently selected device.
   */
  const clearSelectedDevice = useCallback(async () => {
    setSelectedDevice(null);
  }, []);

  /**
   * Sets a device as selected.
   *
   * @param device - Device to select
   */
  const selectDevice = useCallback(async (device: FlashDevice) => {
    setSelectedDevice(device);
  }, []);

  /**
   * Performs device discovery scan.
   *
   * Scans both EFEX and ADB devices, handles errors, and updates
   * device list. Automatically selects single ready device.
   *
   * Disables hot-plug during scan to prevent race conditions.
   *
   * @param hotPlug - True if triggered by hot-plug event
   * @param isKeyPress - True if triggered by user key press
   */
  const doScan = useCallback(
    async (hotPlug: boolean = false, isKeyPress: boolean = false) => {
      if (scanningRef.current) return;

      if (enableHotPlug) {
        setHotPlugEnabled(false);
      }
      scanningRef.current = true;
      setScanning(true);

      try {
        const discovery = await deviceDiscoveryService.scanDevices();
        const foundDevices = discovery.devices;

        // Check if EFEX scan returned "no device" (not an error for display)
        const efexNoDevice =
          discovery.errors.efex != null &&
          isEfexError(discovery.errors.efex) &&
          discovery.errors.efex.code === EFEX_ERROR_CODES.USB_DEVICE_NOT_FOUND;

        setDevices(foundDevices);

        // Log scan errors (excluding expected "no device" error)
        if (discovery.errors.efex && !efexNoDevice) {
          addLog(
            'warn',
            t('deviceScanner.efexScanFailed', 'EFEX scan failed: {{error}}', {
              error: formatErrorForLog(discovery.errors.efex),
            })
          );
        }
        if (discovery.errors.adb) {
          addLog(
            'warn',
            t('deviceScanner.adbScanFailed', 'ADB scan failed: {{error}}', {
              error: formatErrorForLog(discovery.errors.adb),
            })
          );
        }

        // Log scan results
        if (foundDevices.length > 0) {
          addLog(
            'info',
            t('efelGui.logMessages.devicesFound', {
              count: foundDevices.length,
              defaultValue: 'Found {{count}} devices',
            })
          );
        } else if (!discovery.errors.adb && (!discovery.errors.efex || efexNoDevice)) {
          addLog('info', t('deviceScanner.noDevice', '未发现设备'));
        }

        // Auto-select single ready device, or refresh selection for multiple
        if (foundDevices.length === 1) {
          const device = foundDevices[0];
          if (checkDeviceReady(device)) {
            await selectDevice(device);
            options.onDeviceReady?.();
          }
        } else if (foundDevices.length > 1) {
          const currentSelected = selectedDeviceRef.current;
          if (currentSelected) {
            const refreshedDevice = foundDevices.find((d) => d.id === currentSelected.id);
            if (refreshedDevice) {
              await selectDevice(refreshedDevice);
            } else {
              await clearSelectedDevice();
            }
          }
        } else {
          await clearSelectedDevice();
        }
      } catch (err) {
        addLog(
          'error',
          t('deviceScanner.scanFailed', 'Scan devices failed: {{error}}', {
            error: formatErrorForLog(err),
          })
        );
        setDevices([]);
        await clearSelectedDevice();

        // Show error popup for manual scans
        if (showPopup && (!hotPlug || isKeyPress)) {
          const solution = getErrorSolution(err);
          if (solution) {
            showPopup(solution.type, solution.title, solution.message);
          }
        }
      } finally {
        setScanning(false);
        scanningRef.current = false;
        if (enableHotPlug) {
          setHotPlugEnabled(true);
        }
      }
    },
    [addLog, showPopup, t, enableHotPlug, selectDevice, clearSelectedDevice]
  );

  /**
   * Triggers device scan with optional hot-plug/key-press flags.
   *
   * @param hotPlug - True if triggered by hot-plug event
   * @param isKeyPress - True if triggered by user key press
   */
  const handleScanDevices = useCallback(
    async (hotPlug?: boolean, isKeyPress?: boolean) => {
      await doScan(hotPlug, isKeyPress);
    },
    [doScan]
  );

  // Perform initial auto-scan when hook becomes active
  useEffect(() => {
    if (!isActive || !enableHotPlug) {
      autoScannedRef.current = false;
      return;
    }

    if (autoScannedRef.current) {
      return;
    }

    autoScannedRef.current = true;
    void doScan(true, false);
  }, [doScan, enableHotPlug, isActive]);

  /**
   * Handles device selection request.
   *
   * @param device - Device to select
   */
  const handleSelectDevice = useCallback(
    async (device: FlashDevice) => {
      await selectDevice(device);
    },
    [selectDevice]
  );

  /**
   * Clears all devices and selection state.
   */
  const clearDevices = useCallback(async () => {
    setDevices([]);
    await clearSelectedDevice();
  }, [clearSelectedDevice]);

  /**
   * Checks if a device is ready for flash operations.
   *
   * @param device - Device to check
   * @returns True if device is in ready mode (FEL, FES, or ADB)
   */
  const isDeviceReady = useCallback((device: FlashDevice | null): boolean => {
    return checkDeviceReady(device);
  }, []);

  /**
   * Gets localized device status display string.
   *
   * @param device - Device to get status for
   * @returns Localized status string
   */
  const getDeviceStatusDisplay = useCallback(
    (device: FlashDevice | null): string => {
      return getDeviceStatus(device, t);
    },
    [t]
  );

  // Subscribe to FlashManager rescan events
  useEffect(() => {
    const unsubRescan = flashManager.onRescan(() => {
      if (!isActiveRef.current) {
        return;
      }
      void doScan(false);
    });

    return () => {
      unsubRescan();
    };
  }, [doScan]);

  /**
   * Handles hot-plug events (device connect/disconnect).
   *
   * For 'arrived' events, logs connection and triggers scan.
   * For 'left' events, filters out disconnected device from list,
   * handling FEL reconnect expected state specially.
   *
   * @param event - Hot-plug event with device information
   */
  const handleHotPlugEvent = useCallback(
    async (event: UsbHotPlugCallback) => {
      if (!hotPlugEnabledRef.current) return;

      if (event.event === 'arrived') {
        addLog('info', t('deviceScanner.deviceConnected', 'Device connected'));
        await doScan(false, true);
      } else if (event.event === 'left') {
        let removedAny = false;
        let removedSelected = false;
        let nextDevices: FlashDevice[] = [];

        setDevices((prev) => {
          nextDevices = prev.filter((device) => {
            if (!matchesHotplugDevice(device, event)) {
              return true;
            }

            // Keep device if it's selected and expecting reconnect
            const isSelected = selectedDeviceRef.current?.id === device.id;
            if (isSelected && flashManager.isExpectingReconnect()) {
              return true;
            }

            removedAny = true;
            removedSelected = removedSelected || isSelected;
            return false;
          });

          return nextDevices;
        });

        if (!removedAny) {
          return;
        }

        addLog('info', t('deviceScanner.deviceDisconnected', 'Device disconnected'));

        // Update selection if removed device was selected
        if (removedSelected) {
          setSelectedDevice(
            nextDevices.length === 1 && checkDeviceReady(nextDevices[0]) ? nextDevices[0] : null
          );
        }
      }
    },
    [addLog, t, doScan, matchesHotplugDevice]
  );

  // Enable hot-plug detection
  useHotPlug(handleHotPlugEvent, enableHotPlug && hotPlugEnabled, isActive);

  return {
    devices,
    selectedDevice,
    scanning,
    handleScanDevices,
    handleSelectDevice,
    clearDevices,
    isDeviceReady,
    getDeviceStatusDisplay,
    setSelectedDevice: selectDevice,
    setDevices,
    setHotPlugEnabled: setHotPlugEnabledCallback,
  };
}