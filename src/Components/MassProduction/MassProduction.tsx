/**
 * Mass Production component for parallel multi-device firmware flashing.
 *
 * This component provides an interface for simultaneous firmware flashing
 * across multiple devices (up to 48 slots). Designed for production
 * environments where high throughput is required.
 *
 * Features:
 * - Firmware image selection and validation
 * - Flash mode and post-flash action configuration
 * - Real-time per-slot status and progress tracking
 * - Aggregate statistics (success/failure counts)
 * - Centralized log panel for all slot operations
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FirmwareSelect, FlashControl, DeviceListView, LogPanel } from './Components';
import { useImageLoader, useMassProduction } from './Hooks';
import type { MassProductionLog } from './Types';
import { formatErrorForLog, type LogLevel } from '../../FlashManager';
import { loadSettings, AppSettings, saveSettings } from '../../Settings/settingsStore';
import './MassProduction.css';

/**
 * Props for the MassProduction component.
 */
interface MassProductionProps {
  /** Whether the component is currently active/visible */
  isActive?: boolean;
  /** Callback invoked when running state changes */
  onRunningChange?: (running: boolean) => void;
}

/**
 * Maximum number of logs to retain in the log panel.
 */
const MAX_LOGS = 500;

/**
 * Mass Production component for parallel multi-device firmware flashing.
 *
 * Provides a split-panel interface with:
 * - Sidebar: Firmware selection and flash controls
 * - Main panel: Device slot grid and operation logs
 *
 * @param props - Component props
 * @param props.isActive - Whether the component is active (defaults to true)
 * @param props.onRunningChange - Optional callback for running state changes
 * @returns The MassProduction component
 */
export const MassProduction: React.FC<MassProductionProps> = ({
  isActive: _isActive = true,
  onRunningChange,
}) => {
  const { t } = useTranslation();

  /**
   * Operation logs for all slots.
   */
  const [logs, setLogs] = useState<MassProductionLog[]>([]);

  /**
   * Application settings loaded from storage.
   */
  const [settings, setSettings] = useState<AppSettings | null>(null);

  /**
   * Effect: Load application settings on mount.
   */
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  /**
   * Adds a log entry to the log panel.
   * Logs are capped at MAX_LOGS to prevent memory issues.
   * @param level - Log level (info, warn, error, etc.)
   * @param message - Log message content
   * @param slotId - Optional slot ID for per-slot logs
   */
  const addLog = useCallback((level: LogLevel, message: string, slotId?: number) => {
    setLogs((prev) => {
      const next = [...prev, { timestamp: new Date(), level, message, slotId }];
      return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
    });
  }, []);

  /**
   * Image loader state from custom hook.
   * Manages firmware image loading and parsing.
   */
  const { imagePath, imageInfo, sysConfig, packer, loading, handleOpenFile } = useImageLoader(
    addLog,
    settings
  );

  /**
   * Handler for settings changes.
   * Updates local state and persists to storage.
   * @param updates - Partial settings to update
   */
  const handleSettingsChange = useCallback(
    (updates: Partial<AppSettings>) => {
      if (settings) {
        const newSettings = { ...settings, ...updates };
        setSettings(newSettings);
        saveSettings(newSettings);
      }
    },
    [settings]
  );

  /**
   * Mass production state from custom hook.
   * Manages slot states, flashing lifecycle, and statistics.
   */
  const {
    slots,
    isRunning,
    stats,
    flashMode,
    setFlashMode,
    postFlashAction,
    setPostFlashAction,
    start,
    stop,
  } = useMassProduction({ addLog, settings, onSettingsChange: handleSettingsChange });

  /**
   * Effect: Notify parent of running state changes.
   */
  useEffect(() => {
    onRunningChange?.(isRunning);
  }, [isRunning, onRunningChange]);

  /**
   * Handler for starting mass production flashing.
   * Validates firmware image and initiates multi-slot flashing.
   */
  const handleStart = useCallback(async () => {
    if (!imagePath) return;
    try {
      await start(imagePath);
      const firmwareName = imagePath.split(/[/\\]/).pop() || '';
      addLog('info', t('massProduction.startMultiflash', { name: firmwareName }));
    } catch (error) {
      addLog('error', `开始多路烧录失败: ${formatErrorForLog(error)}`);
    }
  }, [imagePath, start, addLog, t]);

  /**
   * Handler for stopping mass production flashing.
   * Cancels all active flash operations.
   */
  const handleStop = useCallback(async () => {
    try {
      await stop();
    } catch (error) {
      addLog('error', `停止多路烧录失败: ${formatErrorForLog(error)}`);
    }
  }, [stop, addLog]);

  return (
    <div className="mp-gui">
      {/* Sidebar with firmware and flash controls */}
      <div className="mp-sidebar">
        <FirmwareSelect
          imagePath={imagePath}
          imageInfo={imageInfo}
          sysConfig={sysConfig}
          packer={packer}
          loading={loading}
          isRunning={isRunning}
          onOpenFile={handleOpenFile}
        />
        <FlashControl
          isRunning={isRunning}
          hasFirmware={!!imagePath}
          stats={stats}
          flashMode={flashMode}
          postFlashAction={postFlashAction}
          onFlashModeChange={setFlashMode}
          onPostFlashActionChange={setPostFlashAction}
          onStart={handleStart}
          onStop={handleStop}
        />
      </div>

      {/* Main panel with device slots and logs */}
      <div className="mp-main">
        <DeviceListView slots={slots} />
        <LogPanel logs={logs} />
      </div>
    </div>
  );
};

export default MassProduction;