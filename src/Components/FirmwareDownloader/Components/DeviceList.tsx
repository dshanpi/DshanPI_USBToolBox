import React from 'react';
import { useTranslation } from 'react-i18next';
import { FlashDevice } from '../../../FlashManager';

interface DeviceListProps {
  devices: FlashDevice[];
  selectedDevice: FlashDevice | null;
  scanning: boolean;
  isFlashing: boolean;
  isDeviceReady: (device: FlashDevice | null) => boolean;
  getDeviceStatusDisplay: (device: FlashDevice) => string;
  onScan: (hotPlug?: boolean, isKeyPress?: boolean) => void;
  onSelectDevice: (device: FlashDevice) => void;
}

export const DeviceList: React.FC<DeviceListProps> = ({
  devices,
  selectedDevice,
  scanning,
  isFlashing,
  isDeviceReady,
  getDeviceStatusDisplay,
  onScan,
  onSelectDevice,
}) => {
  const { t } = useTranslation();

  const showSelectHint = devices.length > 1 && !selectedDevice && !isFlashing;

  return (
    <div className="fd-section fd-section-device">
      <div className="fd-section-header">
        <div className="fd-section-header-title">
          <h3>{t('firmwareDownloader.deviceList.title', '设备列表')}</h3>
          {showSelectHint && (
            <span className="fd-device-hint-inline">
              {t('firmwareDownloader.deviceList.selectDevice', '选择设备')}
            </span>
          )}
        </div>
        <button
          onClick={() => onScan(false, true)}
          disabled={scanning || isFlashing}
          className="fd-button fd-button-secondary"
        >
          {scanning ? t('common.scanning', '扫描中...') : t('common.refresh', '刷新')}
        </button>
      </div>
      <div className="fd-device-list">
        {scanning ? (
          <div className="fd-empty-state">
            <span>{t('common.scanning', '扫描中...')}</span>
          </div>
        ) : devices.length === 0 ? (
          <div className="fd-empty-state">
            <span>{t('firmwareDownloader.deviceList.noDevice', '未发现设备')}</span>
          </div>
        ) : (
          <>
            {devices.map((device) => {
              const isSelected = selectedDevice?.id === device.id;
              const isDisabled = isFlashing && !isSelected;

              return (
                <div
                  key={device.id}
                  className={`fd-device-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => !isFlashing && onSelectDevice(device)}
                >
                  <div className="fd-device-info">
                    <span className="fd-device-name">{device.name}</span>
                    <span className="fd-device-type">{device.modeStr}</span>
                  </div>
                  <div
                    className={`fd-device-status ${isDeviceReady(device) ? 'status-ready' : 'status-disconnected'}`}
                  >
                    {isFlashing && isSelected
                      ? t('firmwareDownloader.deviceList.flashing', '烧录中')
                      : getDeviceStatusDisplay(device)}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
