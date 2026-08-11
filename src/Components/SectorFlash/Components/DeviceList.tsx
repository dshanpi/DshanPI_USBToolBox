import React from 'react';
import { useTranslation } from 'react-i18next';
import { FlashDevice } from '../../../FlashManager';

interface DeviceListProps {
  devices: FlashDevice[];
  selectedDevice: FlashDevice | null;
  scanning: boolean;
  isFlashing: boolean;
  onScanDevices: () => void;
  onSelectDevice: (device: FlashDevice) => void;
  isDeviceReady: (device: FlashDevice) => boolean;
  getDeviceStatusDisplay: (device: FlashDevice) => string;
}

export const DeviceList: React.FC<DeviceListProps> = ({
  devices,
  selectedDevice,
  scanning,
  isFlashing,
  onScanDevices,
  onSelectDevice,
  isDeviceReady,
  getDeviceStatusDisplay,
}) => {
  const { t } = useTranslation();
  const hasMultipleDevices = devices.length > 1;

  return (
    <div className="sf-section">
      <div className="sf-section-header">{t('sectorFlash.deviceList.title', '设备列表')}</div>
      <div className="sf-section-body">
        <button
          onClick={onScanDevices}
          disabled={scanning || isFlashing}
          className="sf-btn sf-btn-primary sf-btn-block"
        >
          {scanning ? t('common.scanning', '扫描中...') : t('common.refresh', '刷新')}
        </button>
        <div className={`sf-device-list ${hasMultipleDevices ? 'has-multiple' : ''}`}>
          {scanning ? (
            <div className="sf-empty">{t('common.scanning', '扫描中...')}</div>
          ) : devices.length === 0 ? (
            <div className="sf-empty">{t('sectorFlash.deviceList.noDevice', '未发现设备')}</div>
          ) : (
            devices.map((device, index) => (
              <div
                key={index}
                className={`sf-device-item ${selectedDevice === device ? 'selected' : ''}`}
                onClick={() => !isFlashing && onSelectDevice(device)}
              >
                <div className="sf-device-name">{device.name}</div>
                <div className="sf-device-info">
                  <span className="sf-device-mode">{device.modeStr}</span>
                  {selectedDevice === device && (
                    <span
                      className={`sf-device-status ${isDeviceReady(device) ? 'status-ready' : 'status-disconnected'}`}
                    >
                      {isFlashing && selectedDevice === device
                        ? t('firmwareDownloader.deviceList.flashing', '烧录中')
                        : getDeviceStatusDisplay(device)}
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
