/**
 * GPIO Viewer component for real-time GPIO pin configuration viewing and editing.
 *
 * This component provides an interface for:
 * - Viewing GPIO pin configurations (mux, pull, drive strength, data)
 * - Selecting multiple pins for batch editing
 * - Editing pin configurations inline
 * - Refreshing pin data from the device
 *
 * Works with ADB-connected Allwinner Sunxi devices to read and modify
 * GPIO register configurations through the GPIO driver.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GPIO, type ProgressCallback } from '../../Drivers/GPIO';
import { adbService } from '../../Services';
import { useDeviceManager } from './Hooks/useDeviceManager';
import { usePinSelection } from './Hooks/usePinSelection';
import { usePinEditing } from './Hooks/usePinEditing';
import {
  Toolbar,
  PinTable,
  StatusBar,
  ErrorBar,
  ServerNotRunning,
  NoDeviceSelected,
  NoData,
} from './Components';
import type { PinRowData } from './types';
import './GPIOViewer.css';

/**
 * GPIO Viewer component for viewing and editing GPIO pin configurations.
 *
 * Provides a table-based interface showing all GPIO pins with their
 * current configuration. Supports multi-pin selection and batch editing.
 *
 * Requires ADB server running and a connected Sunxi device.
 *
 * @param props - Component props
 * @param props.isActive - Whether the component is currently active/visible
 * @returns The GPIOViewer component
 */
export const GPIOViewer: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const { t } = useTranslation();

  /**
   * Ref to track if initial device scan has been performed.
   */
  const scannedRef = useRef(false);

  /**
   * Device manager state from custom hook.
   * Manages ADB server status, device list, and GPIO driver instance.
   */
  const {
    serverStatus,
    devices,
    selectedDevice,
    isRoot,
    loading,
    error,
    sunxiInfo,
    gpio,
    pinData,
    progress: deviceProgress,
    statusText: deviceStatusText,
    checkServerStatus,
    scanDevices,
    handleSelectDevice,
    handleRefresh,
    handleRoot,
    setError,
    setLoading,
    setPinData,
  } = useDeviceManager();

  /**
   * Pin selection state from custom hook.
   * Manages multi-pin selection for batch operations.
   */
  const {
    selectedPins,
    handleRowClick: baseHandleRowClick,
    handleCheckboxChange,
    handleSelectAll,
    handleClearSelection,
    isAllSelected,
  } = usePinSelection();

  /**
   * Pin editing state from custom hook.
   * Manages inline editing of pin configurations.
   */
  const {
    editingPins,
    editValues,
    changedPins,
    isEditing,
    progress: editProgress,
    statusText: editStatusText,
    getCommonMuxOptions,
    handleInlineEdit,
    handleMultiEdit,
    handleInlineSave,
    handleInlineCancel,
    setEditValues,
  } = usePinEditing();

  /**
   * Effect: Check ADB server status when component becomes active.
   */
  useEffect(() => {
    if (isActive) {
      checkServerStatus();
    }
  }, [isActive, checkServerStatus]);

  /**
   * Effect: Restore previously selected device from ADB service.
   */
  useEffect(() => {
    if (isActive && !selectedDevice) {
      adbService.getSelectedDevice().then((serial) => {
        if (serial) {
          handleSelectDevice(serial);
        }
      });
    }
  }, [isActive, selectedDevice, handleSelectDevice]);

  /**
   * Effect: Perform initial device scan if no devices are available.
   */
  useEffect(() => {
    if (isActive && devices.length === 0 && !scannedRef.current && !selectedDevice) {
      scannedRef.current = true;
      scanDevices();
    }
  }, [isActive, devices.length, scanDevices, selectedDevice]);

  /**
   * Refreshes pin data from the GPIO driver.
   * Reads all pin configurations and updates the table data.
   * @param gpioInstance - GPIO driver instance to use
   */
  const refreshPinData = useCallback(
    async (gpioInstance: GPIO) => {
      if (!gpioInstance) return;

      setLoading(true);
      setError(null);

      try {
        const progressCb: ProgressCallback = () => {};

        const allData = await gpioInstance.sunxiGpioGetAllPinData(progressCb);

        // Build row data from pin mux, pull, drv, and data info
        const rows: PinRowData[] = [];
        for (const [pinName, muxInfo] of Object.entries(allData.mux)) {
          const bank = pinName.substring(0, 2);
          const pinNum = parseInt(pinName.substring(2), 10);
          const gpioId = gpioInstance.gpioPin(bank, pinNum);

          rows.push({
            pin: pinName,
            gpioId,
            mux: muxInfo,
            pull: allData.pull[pinName] || 'UNKNOWN',
            drv: allData.drv[pinName] || 0,
            data: allData.data[pinName] !== undefined ? allData.data[pinName] : 'FUNCTION',
          });
        }

        // Track changed pins for visual highlighting
        const changed = new Set<string>();
        for (const newRow of rows) {
          const oldRow = pinData.find((p) => p.pin === newRow.pin);
          if (oldRow) {
            if (
              oldRow.mux.id !== newRow.mux.id ||
              oldRow.pull !== newRow.pull ||
              oldRow.drv !== newRow.drv ||
              oldRow.data !== newRow.data
            ) {
              changed.add(newRow.pin);
            }
          }
        }

        setPinData(rows);

        if (changed.size > 0) {
          setTimeout(() => {}, 2000);
        }
      } catch (e) {
        setError(`${t('gpioViewer.error.readPinData', '读取引脚数据失败')}: ${e}`);
      } finally {
        setLoading(false);
      }
    },
    [t, pinData, setPinData, setLoading, setError]
  );

  /**
   * Handler for row click, supporting multi-selection with Ctrl/Shift.
   * @param row - Pin row data
   * @param event - Mouse event
   */
  const handleRowClick = useCallback(
    (row: PinRowData, event: React.MouseEvent) => {
      baseHandleRowClick(row, event, pinData);
    },
    [baseHandleRowClick, pinData]
  );

  /**
   * Handler for multi-pin edit action.
   */
  const onMultiEdit = useCallback(() => {
    handleMultiEdit(pinData, selectedPins);
  }, [handleMultiEdit, pinData, selectedPins]);

  /**
   * Handler for saving inline edits to the device.
   */
  const onInlineSave = useCallback(async () => {
    if (!gpio) return;
    try {
      await handleInlineSave(gpio, refreshPinData);
      handleClearSelection();
    } catch (e) {
      setError(`${t('gpioViewer.error.configPin', '配置引脚失败')}: ${e}`);
    }
  }, [gpio, handleInlineSave, refreshPinData, handleClearSelection, setError, t]);

  /**
   * Renders the toolbar component with current state.
   * @returns The toolbar component
   */
  const renderToolbar = useCallback(
    () => (
      <Toolbar
        devices={devices}
        selectedDevice={selectedDevice}
        isRoot={isRoot}
        loading={loading}
        sunxiInfo={sunxiInfo}
        gpio={gpio}
        selectedPinsSize={selectedPins.size}
        isEditing={isEditing}
        onScanDevices={scanDevices}
        onSelectDevice={handleSelectDevice}
        onRoot={handleRoot}
        onRefresh={handleRefresh}
        onMultiEdit={onMultiEdit}
        onClearSelection={handleClearSelection}
      />
    ),
    [
      devices,
      selectedDevice,
      isRoot,
      loading,
      sunxiInfo,
      gpio,
      selectedPins.size,
      isEditing,
      scanDevices,
      handleSelectDevice,
      handleRoot,
      handleRefresh,
      onMultiEdit,
      handleClearSelection,
    ]
  );

  // Early returns for error states
  if (!serverStatus?.running) {
    return <ServerNotRunning renderToolbar={renderToolbar} />;
  }

  if (!selectedDevice || devices.length === 0) {
    return <NoDeviceSelected renderToolbar={renderToolbar} />;
  }

  const commonMuxOptions = isEditing ? getCommonMuxOptions(editingPins, gpio) : [];
  const currentProgress = isEditing ? editProgress : deviceProgress;
  const currentStatusText = isEditing ? editStatusText : deviceStatusText;

  return (
    <div className="gpio-viewer-container">
      {renderToolbar()}

      {/* Error display bar */}
      <ErrorBar error={error} onDismiss={() => setError(null)} />

      {/* Pin configuration table */}
      <div className="gpio-table-container">
        {pinData.length > 0 ? (
          <PinTable
            pinData={pinData}
            selectedPins={selectedPins}
            editingPins={editingPins}
            editValues={editValues}
            changedPins={changedPins}
            isEditing={isEditing}
            loading={loading}
            gpio={gpio}
            isAllSelected={isAllSelected(pinData)}
            commonMuxOptions={commonMuxOptions}
            onRowClick={handleRowClick}
            onCheckboxChange={handleCheckboxChange}
            onSelectAll={(checked) => handleSelectAll(checked, pinData)}
            onInlineEdit={handleInlineEdit}
            onInlineSave={onInlineSave}
            onInlineCancel={handleInlineCancel}
            onEditValuesChange={setEditValues}
          />
        ) : (
          !loading && selectedDevice && <NoData />
        )}
      </div>

      {/* Status bar showing counts and progress */}
      <StatusBar
        selectedDevice={selectedDevice}
        pinData={pinData}
        selectedPinsSize={selectedPins.size}
        editingPinsSize={editingPins.length}
        isEditing={isEditing}
        loading={loading}
        progress={currentProgress}
        statusText={currentStatusText}
      />
    </div>
  );
};