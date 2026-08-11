import React from 'react';
import { useTranslation } from 'react-i18next';
import { FlashDevice } from '../Types';

interface DeviceListProps {
  devices: FlashDevice[];
  selectedDevice: FlashDevice | null;
  scanning: boolean;
  isFlashing: boolean;
  onScanDevices: () => void;
  onSelectDevice: (device: FlashDevice) => void;
  isDeviceReady: (device: FlashDevice | null) => boolean;
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
    <div className="gf-section">
      <div className="gf-section-header">{t('genericFlash.deviceList.title', '设备选择')}</div>
      <div className="gf-section-body">
        <button
          onClick={onScanDevices}
          disabled={scanning || isFlashing}
          className="gf-btn gf-btn-primary gf-btn-block"
        >
          {scanning ? t('common.scanning', '扫描中...') : t('common.refresh', '刷新')}
        </button>
        <div className={`gf-device-list ${hasMultipleDevices ? 'has-multiple' : ''}`}>
          {scanning ? (
            <div className="gf-empty">{t('common.scanning', '扫描中...')}</div>
          ) : devices.length === 0 ? (
            <div className="gf-empty">{t('genericFlash.deviceList.noDevice', '未发现设备')}</div>
          ) : (
            devices.map((device, index) => {
              const isSelected = selectedDevice === device;
              const isDisabled = isFlashing && !isSelected;

              return (
                <div
                  key={index}
                  className={`gf-device-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => !isFlashing && onSelectDevice(device)}
                >
                  <div className="gf-device-name">{device.name}</div>
                  <div className="gf-device-info">
                    <span className="gf-device-mode">{device.modeStr}</span>
                    {isSelected && (
                      <span
                        className={`gf-device-status ${isDeviceReady(device) ? 'status-ready' : 'status-disconnected'}`}
                      >
                        {isFlashing && isSelected
                          ? t('firmwareDownloader.deviceList.flashing', '烧录中')
                          : getDeviceStatusDisplay(device)}
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
