/**
 * Sector Flash component for partition-based firmware flashing.
 *
 * This component provides an interface for:
 * - Loading firmware images and parsing MBR partition tables
 * - Editing partition configurations (add, modify, delete, reorder)
 * - Exporting modified MBR configurations
 * - Flashing partitions to devices
 *
 * Designed for advanced users who need fine-grained control over
 * partition layout and individual partition flashing.
 */
import React from 'react';
import { useSectorFlash } from './Hooks';
import {
  BootImageSelector,
  DeviceList,
  MbrExport,
  FlashControl,
  PartitionEditor,
  FlashLog,
} from './Components';
import './SectorFlash.css';

/**
 * Props for the SectorFlash component.
 */
interface SectorFlashProps {
  /** Whether the component is currently active/visible */
  isActive?: boolean;
}

/**
 * Sector Flash component for partition-based firmware operations.
 *
 * Provides a split-panel interface with:
 * - Sidebar: Device list, image selector, MBR export, and flash controls
 * - Main panel: Partition editor table and operation logs
 *
 * @param props - Component props
 * @param props.isActive - Whether the component is active (defaults to true)
 * @returns The SectorFlash component
 */
export const SectorFlash: React.FC<SectorFlashProps> = ({ isActive = true }) => {
  /**
   * Sector flash state from custom hook.
   * Manages image loading, MBR parsing, partition editing, and flashing.
   */
  const {
    imagePath,
    imageInfo,
    mbrInfo,
    mbrModified,
    partitionConfig,
    loading,
    isFlashing,
    progress,
    logs,
    devices,
    selectedDevice,
    scanning,
    mbrExportOptions,
    setMbrExportOptions,
    handleOpenFile,
    handleScanDevices,
    handleSelectDevice,
    isDeviceReady,
    getDeviceStatusDisplay,
    handleAddPartition,
    handleUpdatePartition,
    handleDeletePartition,
    handleMovePartition,
    handleClearAllPartitions,
    handleUpdatePartitionConfig,
    handleReloadMbr,
    handleFlashFirmware,
    handleExportMbr,
    addLog,
  } = useSectorFlash({ isActive });

  /**
   * Whether flashing is allowed (device ready, MBR loaded).
   */
  const canFlash = selectedDevice && isDeviceReady(selectedDevice) && mbrInfo && !isFlashing;

  return (
    <div className="sf-gui">
      {/* Sidebar with device, image selection, and controls */}
      <div className="sf-sidebar">
        <DeviceList
          devices={devices}
          selectedDevice={selectedDevice}
          scanning={scanning}
          isFlashing={isFlashing}
          onScanDevices={handleScanDevices}
          onSelectDevice={handleSelectDevice}
          isDeviceReady={isDeviceReady}
          getDeviceStatusDisplay={getDeviceStatusDisplay}
        />

        <BootImageSelector
          imagePath={imagePath}
          imageInfo={imageInfo}
          partitionCount={mbrInfo?.partCount ?? 0}
          loading={loading}
          isFlashing={isFlashing}
          onOpenFile={handleOpenFile}
        />

        <MbrExport
          mbrExportOptions={mbrExportOptions}
          hasMbr={!!mbrInfo}
          isFlashing={isFlashing}
          onExportOptionsChange={setMbrExportOptions}
          onExportMbr={handleExportMbr}
        />

        <FlashControl
          progress={progress}
          canFlash={!!canFlash}
          isFlashing={isFlashing}
          onFlash={handleFlashFirmware}
        />
      </div>

      {/* Main panel with partition editor and logs */}
      <div className="sf-main">
        <PartitionEditor
          mbrInfo={mbrInfo}
          partitionConfig={partitionConfig}
          imagePath={imagePath}
          disabled={isFlashing}
          mbrModified={mbrModified}
          progress={isFlashing ? progress : undefined}
          onAddPartition={handleAddPartition}
          onUpdatePartition={handleUpdatePartition}
          onDeletePartition={handleDeletePartition}
          onMovePartition={handleMovePartition}
          onClearAllPartitions={handleClearAllPartitions}
          onUpdatePartitionConfig={handleUpdatePartitionConfig}
          onReloadMbr={handleReloadMbr}
          addLog={addLog}
        />

        <FlashLog logs={logs} />
      </div>
    </div>
  );
};

export default SectorFlash;