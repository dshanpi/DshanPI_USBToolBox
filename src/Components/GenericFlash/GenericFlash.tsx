/**
 * Generic Flash component for flashing boot images with generic disk images.
 *
 * This component provides an interface for flashing:
 * - A boot image (IMAGEWTY firmware) containing Boot0/U-Boot
 * - A generic disk image (raw partition image, GPT disk, etc.)
 *
 * Supports logic offset configuration for proper image alignment
 * and custom partition offset handling.
 */
import React, { useState, useEffect } from 'react';
import { useBootImageLoader, useGenericImageLoader, useFlashState, useLogicOffset } from './Hooks';
import {
  DeviceList,
  BootImageSelector,
  GenericImageSelector,
  FlashControl,
  ImageInfo,
  FlashLog,
  LogicOffsetConfig,
} from './Components';
import { loadSettings, AppSettings } from '../../Settings/settingsStore';
import { Popup } from '../../CoreUI';
import { useDeviceScanner, useLogger, usePopup } from '../../Hooks';
import './GenericFlash.css';

/**
 * Props for the GenericFlash component.
 */
interface GenericFlashProps {
  /** Whether the component is currently active/visible */
  isActive?: boolean;
}

/**
 * Generic Flash component for combined boot + generic image flashing.
 *
 * Provides a split-panel interface with:
 * - Sidebar: Device list, image selectors, offset config, and flash controls
 * - Main panel: Image info display and operation logs
 *
 * @param props - Component props
 * @param props.isActive - Whether the component is active (defaults to true)
 * @returns The GenericFlash component
 */
export const GenericFlash: React.FC<GenericFlashProps> = ({ isActive = true }) => {
  /**
   * Application settings loaded from storage.
   */
  const [settings, setSettings] = useState<AppSettings | null>(null);

  /**
   * Logger for displaying operation messages.
   */
  const { logs, addLog } = useLogger();

  /**
   * Popup state and handlers for user notifications.
   */
  const { popup, showPopup, hidePopup } = usePopup();

  /**
   * Effect: Load application settings on mount.
   */
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  /**
   * Device scanner state and handlers.
   * Hot-plug scanning is configurable via settings.
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
  });

  /**
   * Boot image loader state from custom hook.
   * Manages boot firmware image loading and MBR extraction.
   */
  const {
    bootImagePath,
    bootImageInfo,
    mbrCopy,
    loading: bootLoading,
    packer: bootPacker,
    handleOpenBootFile,
  } = useBootImageLoader(addLog, settings);

  /**
   * Logic offset configuration for image alignment.
   */
  const logicOffset = useLogicOffset(addLog);

  /**
   * Effect: Auto-detect logic offset when boot image is loaded.
   */
  useEffect(() => {
    if (bootPacker.current && bootImageInfo) {
      logicOffset.autoDetect(bootPacker.current);
    } else if (!bootImageInfo) {
      logicOffset.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootImageInfo]);

  /**
   * Generic image loader state from custom hook.
   * Manages generic disk/partition image loading.
   */
  const {
    genericImagePath,
    genericImageInfo,
    partitions,
    diskType,
    loading: genericLoading,
    handleOpenGenericFile,
  } = useGenericImageLoader(addLog);

  /**
   * Flash state from custom hook.
   * Manages flash execution and cancellation.
   */
  const { isFlashing, isCancelling, progress, handleStartFlash, handleCancelFlash } = useFlashState(
    {
      addLog,
      selectedDevice,
      bootImagePath,
      bootPacker,
      genericImagePath,
      genericImageSize: genericImageInfo?.size ?? null,
      logicOffsetConfig: logicOffset.config,
      mbrCopy,
      mode: logicOffset.mode,
      isDeviceReady,
      showPopup,
    }
  );

  /**
   * Combined loading state from both image loaders.
   */
  const loading = bootLoading || genericLoading;

  /**
   * Whether flashing is allowed (device ready, both images loaded).
   */
  const canFlash = selectedDevice && bootImagePath && genericImagePath && !isFlashing;

  return (
    <div className="gf-gui">
      {/* Sidebar with device, image selection, and controls */}
      <div className="gf-sidebar">
        <DeviceList
          devices={devices}
          selectedDevice={selectedDevice}
          scanning={scanning}
          isFlashing={isFlashing}
          onScanDevices={() => handleScanDevices(false, true)}
          onSelectDevice={setSelectedDevice}
          isDeviceReady={isDeviceReady}
          getDeviceStatusDisplay={getDeviceStatusDisplay}
        />

        <BootImageSelector
          imagePath={bootImagePath}
          imageInfo={bootImageInfo}
          loading={loading}
          isFlashing={isFlashing}
          onOpenFile={handleOpenBootFile}
        />

        <GenericImageSelector
          imagePath={genericImagePath}
          imageInfo={genericImageInfo}
          loading={loading}
          isFlashing={isFlashing}
          onOpenFile={handleOpenGenericFile}
        />

        <LogicOffsetConfig logicOffset={logicOffset} disabled={isFlashing} />

        <FlashControl
          progress={progress}
          canFlash={!!canFlash}
          isFlashing={isFlashing}
          isCancelling={isCancelling}
          onFlash={handleStartFlash}
          onCancel={handleCancelFlash}
        />
      </div>

      {/* Main panel with image info and logs */}
      <div className="gf-main">
        <ImageInfo
          genericImageInfo={genericImageInfo}
          partitions={partitions}
          diskType={diskType}
          disabled={isFlashing}
        />

        <FlashLog logs={logs} />
      </div>

      {/* Popup for errors and confirmations */}
      <Popup
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={hidePopup}
      />
    </div>
  );
};

export default GenericFlash;