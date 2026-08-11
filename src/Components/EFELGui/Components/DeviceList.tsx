import React from 'react';
import { useTranslation } from 'react-i18next';
import { FlashDevice } from '../../../FlashManager';

interface DeviceListProps {
  devices: FlashDevice[];
  selectedDevice: FlashDevice | null;
  scanning: boolean;
  isContextReady: boolean;
  contextMode: string | undefined;
  onScanDevices: () => void;
  onSelectDevice: (device: FlashDevice) => void;
  isDeviceReady: (device: FlashDevice | null) => boolean;
  getDeviceStatusDisplay: (device: FlashDevice) => string;
}

export const DeviceList: React.FC<DeviceListProps> = ({
  devices,
  selectedDevice,
  scanning,
  isContextReady,
  contextMode,
  onScanDevices,
  onSelectDevice,
  isDeviceReady,
  getDeviceStatusDisplay,
}) => {
  const { t } = useTranslation();
  const hasMultipleDevices = devices.length > 1;

  const getDeviceStatusClassName = (device: FlashDevice) => {
    const classes = ['device-status'];
    if (device.mode === 'adb') {
      classes.push('status-adb');
    } else if (isContextReady && selectedDevice === device) {
      classes.push('status-ready');
    } else if (!isDeviceReady(device)) {
      classes.push('status-disconnected');
    }
    return classes.join(' ');
  };

  const getDeviceStatusText = (device: FlashDevice) => {
    if (device.mode === 'adb') {
      return t('efelGui.status.adb', 'ADB');
    }
    if (selectedDevice === device) {
      if (isContextReady) {
        return t('efelGui.status.ready', 'Ready');
      }
      return contextMode || t('efelGui.status.connecting', 'Connecting...');
    }
    return getDeviceStatusDisplay(device);
  };

  return (
    <div className="efex-section">
      <div className="section-header">{t('efelGui.deviceSelect', 'Select Device')}</div>
      <div className="section-body">
        <button
          onClick={onScanDevices}
          disabled={scanning}
          className="efex-btn efex-btn-primary efex-btn-block"
        >
          {scanning ? t('common.scanning', 'Scanning...') : t('efelGui.scanDevice', 'Scan Devices')}
        </button>
        <div className={`efex-device-list ${hasMultipleDevices ? 'has-multiple' : ''}`}>
          {scanning ? (
            <div className="efex-empty">{t('common.scanning', 'Scanning...')}</div>
          ) : devices.length === 0 ? (
            <div className="efex-empty">{t('efelGui.noDevice', 'No devices')}</div>
          ) : (
            devices.map((device, index) => {
              const isSelected = selectedDevice === device;

              return (
                <div
                  key={device.id || index}
                  className={`efex-device-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectDevice(device)}
                >
                  <div className="device-name">{device.name}</div>
                  <div className="device-info">
                    <span className="device-mode">{device.modeStr}</span>
                    {isSelected && (
                      <span className={getDeviceStatusClassName(device)}>
                        {getDeviceStatusText(device)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};