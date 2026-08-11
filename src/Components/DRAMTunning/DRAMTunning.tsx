/**
 * DRAM Tuning component for DRAM parameter testing and configuration.
 *
 * This component provides an interface for:
 * - Loading firmware images containing DRAM parameters
 * - Selecting target chip configuration
 * - Configuring DRAM timing parameters
 * - Testing DRAM initialization on connected devices
 * - Viewing raw parameter values and test results
 *
 * Designed for hardware engineers tuning DRAM configurations
 * for new board designs or chip variants.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Popup, PopupType, PopupState } from '../../CoreUI';
import {
  DeviceSelector,
  FirmwareSelector,
  ChipSelector,
  DRAMConfigPanel,
  DRAMRawParams,
  TestControl,
  ResultDisplay,
  LogPanel,
} from './Components';
import { useLog, useFirmwareLoader, useDRAMConfig, useDRAMTest, useDRAMContext } from './Hooks';
import { useDeviceScanner } from '../../Hooks';
import { createLogAdapter } from '../../Utils/Format';
import './DRAMTunning.css';

/**
 * Props for the DRAMTunning component.
 */
interface DRAMTunningProps {
  /** Whether the component is currently active/visible */
  isActive?: boolean;
}

/**
 * DRAM Tuning component for DRAM parameter configuration and testing.
 *
 * Provides a split-panel interface with:
 * - Sidebar: Device selector, firmware loader, chip selector, and test control
 * - Main panel: Parameter configuration, raw values, test results, and logs
 *
 * @param props - Component props
 * @param props.isActive - Whether the component is active (defaults to true)
 * @returns The DRAMTunning component
 */
export const DRAMTunning: React.FC<DRAMTunningProps> = ({ isActive = true }) => {
  const { t } = useTranslation();

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
   * Displays a popup message to the user.
   * @param type - Popup type (error, info, confirm, etc.)
   * @param title - Popup title
   * @param message - Popup message content
   */
  const showPopup = useCallback((type: PopupType, title: string, message: string) => {
    setPopup({ visible: true, type, title, message });
  }, []);

  /**
   * Log state and container ref for scroll-to-bottom behavior.
   */
  const { logs, logContainerRef, addLog } = useLog();

  /**
   * Device scanner state for FEL device detection.
   */
  const deviceScanner = useDeviceScanner({
    addLog: createLogAdapter(addLog),
    enableHotPlug: true,
    isActive,
  });

  /**
   * DRAM context for FEL mode communication.
   */
  const dramContext = useDRAMContext(addLog, showPopup);

  /**
   * Firmware loader state from custom hook.
   * Loads firmware containing DRAM parameters (boot0).
   */
  const {
    firmwarePath,
    fesData,
    boot0Header,
    loading: fwLoading,
    handleSelectFirmware,
  } = useFirmwareLoader(addLog);

  /**
   * DRAM configuration state from custom hook.
   * Manages chip selection and parameter configuration.
   */
  const {
    selectedChipId,
    dramConfig,
    dramParams,
    availableChips,
    selectChip,
    setDramParam,
    setBitfield,
    loadDefaults,
    resetParams,
  } = useDRAMConfig();

  /**
   * DRAM test state from custom hook.
   * Manages test execution and result display.
   */
  const { testing, result, error, handleRunTest } = useDRAMTest(
    dramContext.context,
    fesData,
    dramParams,
    addLog
  );

  /**
   * Effect: Initialize/close DRAM context based on device selection.
   */
  useEffect(() => {
    if (deviceScanner.selectedDevice) {
      dramContext.initContext(deviceScanner.selectedDevice);
    } else {
      dramContext.closeContext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceScanner.selectedDevice?.id]);

  /**
   * Whether test is disabled (missing requirements).
   */
  const testDisabled = !dramContext.context || !fesData || !selectedChipId || !dramContext.isContextReady;

  if (!isActive) return null;

  return (
    <div className="dram-tunning">
      {/* Sidebar with device, firmware, chip selection */}
      <div className="dram-sidebar">
        <DeviceSelector
          devices={deviceScanner.devices}
          selectedDevice={deviceScanner.selectedDevice}
          scanning={deviceScanner.scanning}
          isReady={deviceScanner.isDeviceReady(deviceScanner.selectedDevice)}
          onScan={() => deviceScanner.handleScanDevices(false, true)}
          onSelectDevice={deviceScanner.handleSelectDevice}
        />

        <FirmwareSelector
          firmwarePath={firmwarePath}
          boot0Header={boot0Header}
          loading={fwLoading}
          onSelectFirmware={handleSelectFirmware}
        />

        <ChipSelector
          availableChips={availableChips}
          selectedChipId={selectedChipId}
          onSelectChip={selectChip}
        />

        {/* Quick action buttons */}
        <div className="dram-section dram-actions-section">
          <div className="section-body">
            <div className="dram-config-actions">
              <button className="dram-btn dram-btn-secondary" onClick={loadDefaults}>
                {t('dramTunning.loadDefaults', 'Load Defaults')}
              </button>
              <button className="dram-btn dram-btn-danger" onClick={resetParams}>
                {t('dramTunning.reset', 'Reset')}
              </button>
            </div>
          </div>
        </div>

        <TestControl testing={testing} disabled={testDisabled} onRunTest={handleRunTest} />
      </div>

      {/* Main panel with configuration and results */}
      <div className="dram-main">
        <div className="dram-config-container">
          <div className="dram-config-left">
            <DRAMConfigPanel
              dramConfig={dramConfig}
              dramParams={dramParams}
              onParamChange={setDramParam}
              onBitfieldChange={setBitfield}
            />
          </div>
          <div className="dram-config-right">
            <DRAMRawParams dramParams={dramParams} onParamChange={setDramParam} />
          </div>
        </div>

        <ResultDisplay
          result={result}
          error={error}
          inputParams={dramParams}
          dramConfig={dramConfig}
        />

        <LogPanel logs={logs} logContainerRef={logContainerRef} />
      </div>

      {/* Popup for errors and confirmations */}
      <Popup
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={() => setPopup((p) => ({ ...p, visible: false }))}
      />
    </div>
  );
};