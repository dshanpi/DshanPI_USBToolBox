import React from 'react';
import { useTranslation } from 'react-i18next';
import { getChipName, formatChipId } from '../../../Utils/Chips';
import { DEVICE_MODE_NAMES } from '../../../Services';
import type { FlashDevice } from '../../../FlashManager';

interface DeviceSelectorProps {
  devices: FlashDevice[];
  selectedDevice: FlashDevice | null;
  scanning: boolean;
  isReady: boolean;
  onScan: () => void;
  onSelectDevice: (device: FlashDevice) => void;
}

export const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  devices,
  selectedDevice,
  scanning,
  isReady,
  onScan,
  onSelectDevice,
}) => {
  const { t } = useTranslation();

  return (
    <div className="dram-section">
      <div className="section-header">{t('dramTunning.deviceSelect', 'Select Device')}</div>
      <div className="section-body">
        <button
          onClick={onScan}
          disabled={scanning}
          className="dram-btn dram-btn-primary dram-btn-block"
        >
          {scanning
            ? t('common.scanning', 'Scanning...')
            : t('dramTunning.scanDevice', 'Scan Devices')}
        </button>
        <div className="dram-device-list">
          {devices.length === 0 ? (
            <div className="dram-empty">{t('dramTunning.noDevice', 'No devices')}</div>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className={`dram-device-item ${selectedDevice === device ? 'selected' : ''}`}
                onClick={() => onSelectDevice(device)}
              >
                <div className="device-name">
                  {device.mode === 'adb' ? device.name : getChipName(device.chipVersion ?? 0)}
                </div>
                <div className="device-info">
                  <span>
                    {device.mode === 'adb' ? device.serial : formatChipId(device.chipVersion ?? 0)}
                  </span>
                  <span className="device-mode">
                    {device.mode === 'adb'
                      ? 'ADB'
                      : DEVICE_MODE_NAMES[device.mode as keyof typeof DEVICE_MODE_NAMES] ||
                        device.modeStr}
                  </span>
                  {selectedDevice === device && (
                    <span className={`device-status ${isReady ? '' : 'status-timeout'}`}>
                      {isReady
                        ? t('dramTunning.status.ready', 'Ready')
                        : t('dramTunning.status.notReady', 'Not Ready')}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
