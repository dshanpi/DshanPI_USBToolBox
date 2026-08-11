/**
 * Firmware Downloader component for flashing firmware to devices.
 *
 * This is the main firmware flashing interface that allows users to:
 * - Load and parse firmware images (IMAGEWTY format)
 * - Scan and select FEL/FES devices
 * - Configure flash options (mode, partitions, verify, post-flash actions)
 * - Execute firmware flashing with progress tracking
 * - Optionally auto-flash when a device connects
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useImageLoader, useFlashState } from './Hooks';
import { FirmwareInfo, DeviceList, FlashConfig, FlashControl } from './Components';
import { loadSettings, AppSettings } from '../../Settings/settingsStore';
import { Popup } from '../../CoreUI';
import { useDeviceScanner, useLogger, usePopup } from '../../Hooks';
import './FirmwareDownloader.css';

/**
 * Props for the FirmwareDownloader component.
 */
interface FirmwareDownloaderProps {
  /** Whether the component is currently active/visible */
  isActive?: boolean;
}

/**
 * Firmware Downloader component for device firmware flashing.
 *
 * Provides a two-row layout:
 * - Top row: Firmware info panel and device list
 * - Main row: Flash configuration and control panel
 *
 * Supports auto-flash feature that triggers flashing when a device
 * is detected in FEL/FES mode if enabled in settings.
 *
 * @param props - Component props
 * @param props.isActive - Whether the component is active (defaults to true)
 * @returns The FirmwareDownloader component
 */
export const FirmwareDownloader: React.FC<FirmwareDownloaderProps> = ({ isActive = true }) => {
  const { t } = useTranslation();

  /**
   * Application settings loaded from storage.
   */
  const [settings, setSettings] = useState<AppSettings | null>(null);

  /**
   * Logger for displaying operation messages.
   */
  const { logs, addLog } = useLogger();

  /**
   * Ref for auto-flash callback, used to trigger flashing when device connects.
   */
  const autoFlashCallbackRef = useRef<(() => void) | null>(null);

  /**
   * Effect: Load application settings on mount.
   */
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  /**
   * Popup state and handlers for user notifications.
   */
  const { popup, showPopup, hidePopup } = usePopup();

  /**
   * Device scanner state and handlers.
   * Hot-plug scanning is configurable via settings.
   * Auto-flash callback is triggered when device becomes ready.
   */
  const {
    devices,
    selectedDevice,
    scanning,
    handleScanDevices,
    isDeviceReady,
    getDeviceStatusDisplay,
    setSelectedDevice,
  } = useDeviceScanner({
    addLog,
    showPopup,
    enableHotPlug: settings?.autoScanDevices ?? true,
    isActive,
    onDeviceReady: () => autoFlashCallbackRef.current?.(),
  });

  /**
   * Image loader state and handlers.
   * Manages firmware image loading, parsing, and partition extraction.
   */
  const {
    imagePath,
    imageInfo,
    partitions,
    loading,
    sysConfig,
    packer,
    handleOpenFile,
    releaseImage,
    reloadImage,
  } = useImageLoader(addLog, settings);

  /**
   * Flash state and handlers.
   * Manages flash configuration, execution, and cancellation.
   */
  const {
    flashMode,
    selectedPartitions,
    verifyDownload,
    postFlashAction,
    autoFlashOnConnect,
    isFlashing,
    isCancelling,
    progress,
    setFlashMode,
    setVerifyDownload,
    setPostFlashAction,
    setAutoFlashOnConnect,
    handleStartFlash,
    handleCancelFlash,
    handlePartitionToggle,
  } = useFlashState(
    addLog,
    selectedDevice,
    imagePath,
    imageInfo,
    isDeviceReady,
    settings,
    showPopup,
    releaseImage,
    reloadImage
  );

  /**
   * Handler for auto-flash when device becomes ready.
   * Only triggers if auto-flash is enabled, image is loaded, and not already flashing.
   */
  const handleDeviceReadyForAutoFlash = useCallback(() => {
    if (!autoFlashOnConnect) return;
    if (!imagePath || !imageInfo) return;
    if (isFlashing) return;
    addLog('info', t('firmwareDownloader.autoFlashTriggered', '检测到设备连接，自动开始烧录'));
    handleStartFlash();
  }, [autoFlashOnConnect, imagePath, imageInfo, isFlashing, addLog, t, handleStartFlash]);

  /**
   * Effect: Update auto-flash callback ref when handler changes.
   */
  useEffect(() => {
    autoFlashCallbackRef.current = handleDeviceReadyForAutoFlash;
  }, [handleDeviceReadyForAutoFlash]);

  /**
   * Handler for popup close, with special handling for confirm dialogs.
   */
  const handlePopupClose = () => {
    if (popup.type === 'confirm') {
      window.__confirmCancelHandler?.();
    }
    hidePopup();
  };

  return (
    <div className="firmware-downloader">
      {/* Top row: Firmware info and device selection */}
      <div className="fd-row">
        <FirmwareInfo
          imagePath={imagePath}
          imageInfo={imageInfo}
          sysConfig={sysConfig}
          packer={packer.current}
          loading={loading}
          isFlashing={isFlashing}
          onOpenFile={handleOpenFile}
        />

        <DeviceList
          devices={devices}
          selectedDevice={selectedDevice}
          scanning={scanning}
          isFlashing={isFlashing}
          isDeviceReady={isDeviceReady}
          getDeviceStatusDisplay={getDeviceStatusDisplay}
          onScan={handleScanDevices}
          onSelectDevice={setSelectedDevice}
        />
      </div>

      {/* Main row: Flash configuration and control */}
      <div className="fd-row fd-row-main">
        <FlashConfig
          flashMode={flashMode}
          partitions={partitions}
          selectedPartitions={selectedPartitions}
          isFlashing={isFlashing}
          isLoading={loading}
          progress={progress}
          onFlashModeChange={setFlashMode}
          onPartitionToggle={handlePartitionToggle}
        />

        <FlashControl
          progress={progress}
          verifyDownload={verifyDownload}
          autoFlashOnConnect={autoFlashOnConnect}
          postFlashAction={postFlashAction}
          isFlashing={isFlashing}
          isCancelling={isCancelling}
          selectedDevice={selectedDevice}
          imagePath={imagePath}
          logs={logs}
          isDeviceReady={isDeviceReady}
          onVerifyDownloadChange={setVerifyDownload}
          onAutoFlashOnConnectChange={setAutoFlashOnConnect}
          onPostFlashActionChange={setPostFlashAction}
          onStartFlash={handleStartFlash}
          onCancelFlash={handleCancelFlash}
        />
      </div>

      {/* Popup for errors, confirmations, and progress */}
      <Popup
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={handlePopupClose}
        onConfirm={popup.onConfirm}
      />
    </div>
  );
};

export default FirmwareDownloader;