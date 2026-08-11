/**
 * EFEL GUI component providing low-level FEL mode operations.
 *
 * This component serves as an interactive interface for FEL mode debugging,
 * allowing users to:
 * - Scan and select FEL devices
 * - Read/write memory at arbitrary addresses
 * - Load binary files to memory
 * - Execute code at specific addresses
 * - View memory contents with hex display and disassembly
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Popup, PopupType, PopupState } from '../../CoreUI';
import {
  DeviceList,
  MemoryRead,
  MemoryWrite,
  InitMemory,
  ExecJump,
  LogPanel,
  HexView,
  EmptyHexView,
} from './Components';
import { useLog, useEFELContext, useMemoryOperations, useDisasm } from './Hooks';
import { useDeviceScanner } from '../../Hooks';
import './EFELGui.css';

/**
 * Props for the EFELGui component.
 */
interface EFELGuiProps {
  /** Whether the component is currently active/visible */
  isActive?: boolean;
}

/**
 * EFEL GUI component for low-level FEL mode operations.
 *
 * Provides a split-panel interface with:
 * - Sidebar: Device list and memory operation controls
 * - Main panel: Hex view with disassembly and log output
 *
 * @param props - Component props
 * @param props.isActive - Whether the component is active (defaults to true)
 * @returns The EFEL GUI component
 */
export const EFELGui: React.FC<EFELGuiProps> = ({ isActive = true }) => {
  /**
   * Popup state for displaying errors and confirmations.
   */
  const [popup, setPopup] = useState<PopupState>({
    visible: false,
    type: 'error',
    title: '',
    message: '',
  });

  /**
   * Log state and container ref for scroll-to-bottom behavior.
   */
  const { logs, logContainerRef, addLog } = useLog();

  /**
   * Displays a popup message to the user.
   * @param type - Popup type (error, info, confirm, etc.)
   * @param title - Popup title
   * @param message - Popup message content
   */
  const showPopup = useCallback((type: PopupType, title: string, message: string) => {
    setPopup({
      visible: true,
      type,
      title,
      message,
    });
  }, []);

  /**
   * Device scanner state and handlers.
   * Hot-plug is disabled for EFEL operations to prevent interference
   * with stuck device recovery.
   */
  const {
    devices,
    selectedDevice,
    scanning,
    handleScanDevices,
    handleSelectDevice,
    isDeviceReady,
    getDeviceStatusDisplay,
  } = useDeviceScanner({
    addLog: (level, message) => addLog(level.toUpperCase().slice(0, 4), message),
    showPopup,
    // EFEL operations open the device directly, so background hot-plug rescans
    // can pile up against a stuck device and make recovery harder.
    enableHotPlug: false,
    isActive,
  });

  /**
   * EFEL context for device communication.
   * Manages the FEL mode connection to the selected device.
   */
  const {
    context,
    isContextReady,
    contextMode,
    initContext,
    closeContext,
  } = useEFELContext(addLog, showPopup);

  /**
   * Memory operation state and handlers.
   * Manages read/write/init/exec operations on the device.
   */
  const {
    address,
    setAddress,
    length,
    setLength,
    memoryData,
    memoryBaseAddr,
    loading,
    disasmArch,
    setDisasmArch,
    writeAddress,
    setWriteAddress,
    writeFilePath,
    initFilePath,
    execAddress,
    setExecAddress,
    handleReadMemory,
    handleSaveMemory,
    handleWriteFile,
    handleSelectFile,
    handleSelectInitFile,
    handleInitMemory,
    handleExec,
    setMemoryData,
  } = useMemoryOperations(context, addLog);

  /**
   * Disassembly result for the current memory data.
   */
  const { disasmResult } = useDisasm(disasmArch, memoryData, memoryBaseAddr, addLog);

  /**
   * Effect: Initialize/close EFEL context based on device selection.
   * When a device is selected, initializes the FEL context.
   * When selection is cleared, closes context and resets memory data.
   */
  useEffect(() => {
    if (selectedDevice) {
      initContext(selectedDevice);
    } else {
      closeContext();
      setMemoryData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice]);

  return (
    <div className="efex-gui">
      {/* Sidebar with device list and operation controls */}
      <div className="efex-sidebar">
        <DeviceList
          devices={devices}
          selectedDevice={selectedDevice}
          scanning={scanning}
          isContextReady={isContextReady}
          contextMode={contextMode}
          onScanDevices={handleScanDevices}
          onSelectDevice={handleSelectDevice}
          isDeviceReady={isDeviceReady}
          getDeviceStatusDisplay={getDeviceStatusDisplay}
        />

        <MemoryRead
          address={address}
          length={length}
          memoryData={memoryData}
          isReady={isContextReady}
          loading={loading}
          onAddressChange={setAddress}
          onLengthChange={setLength}
          onRead={handleReadMemory}
          onSave={handleSaveMemory}
        />

        <MemoryWrite
          writeAddress={writeAddress}
          writeFilePath={writeFilePath}
          isReady={isContextReady}
          loading={loading}
          onAddressChange={setWriteAddress}
          onSelectFile={handleSelectFile}
          onWrite={handleWriteFile}
        />

        <InitMemory
          initFilePath={initFilePath}
          isReady={isContextReady}
          loading={loading}
          onSelectFile={handleSelectInitFile}
          onInit={handleInitMemory}
        />

        <ExecJump
          execAddress={execAddress}
          isReady={isContextReady}
          loading={loading}
          onAddressChange={setExecAddress}
          onExec={handleExec}
        />
      </div>

      {/* Main panel with hex view and logs */}
      <div className="efex-main">
        {memoryData ? (
          <HexView
            memoryData={memoryData}
            memoryBaseAddr={memoryBaseAddr}
            disasmArch={disasmArch}
            disasmResult={disasmResult}
            onArchChange={setDisasmArch}
          />
        ) : (
          <EmptyHexView disasmArch={disasmArch} />
        )}

        <LogPanel logs={logs} logContainerRef={logContainerRef} />
      </div>

      {/* Popup for errors and confirmations */}
      <Popup
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={() => setPopup((prev) => ({ ...prev, visible: false }))}
      />
    </div>
  );
};

export default EFELGui;