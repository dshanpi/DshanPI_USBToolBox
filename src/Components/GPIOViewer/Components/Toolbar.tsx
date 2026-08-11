import React from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentChipName } from '../../../Chips';
import type { SunxiInfo } from '../../../Drivers/DeviceInfo';
import { GPIO } from '../../../Drivers/GPIO';
import type { AdbDevice } from '../../../Services';

interface ToolbarProps {
  devices: AdbDevice[];
  selectedDevice: string | null;
  isRoot: boolean | null;
  loading: boolean;
  sunxiInfo: SunxiInfo | null;
  gpio: GPIO | null;
  selectedPinsSize: number;
  isEditing: boolean;
  onScanDevices: () => void;
  onSelectDevice: (serial: string) => void;
  onRoot: () => void;
  onRefresh: () => void;
  onMultiEdit: () => void;
  onClearSelection: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  devices,
  selectedDevice,
  isRoot,
  loading,
  sunxiInfo,
  gpio,
  selectedPinsSize,
  isEditing,
  onScanDevices,
  onSelectDevice,
  onRoot,
  onRefresh,
  onMultiEdit,
  onClearSelection,
}) => {
  const { t } = useTranslation();

  const chipName = sunxiInfo && gpio ? getCurrentChipName(sunxiInfo, gpio.getChipInfo()) : '';

  return (
    <div className="gpio-toolbar">
      <div className="gpio-device-selector">
        <span className="gpio-label">{t('gpioViewer.device', '设备')}</span>
        {devices.length > 1 ? (
          <select
            value={selectedDevice || ''}
            onChange={(e) => onSelectDevice(e.target.value)}
            disabled={loading}
          >
            <option value="">{t('gpioViewer.selectDevice', '选择设备')}</option>
            {devices.map((device) => (
              <option key={device.serial} value={device.serial}>
                {device.model || device.product || device.serial}
              </option>
            ))}
          </select>
        ) : (
          <span className="gpio-device-name">
            {devices.length === 1
              ? devices[0].model || devices[0].product || devices[0].serial
              : t('gpioViewer.noDevice', '无设备')}
          </span>
        )}
        <button className="gpio-small-btn" onClick={onScanDevices} disabled={loading}>
          {t('gpioViewer.refresh', '刷新设备')}
        </button>
        {selectedDevice && (
          <button
            className={`gpio-root-btn ${isRoot === true ? 'root-yes' : isRoot === false ? 'root-no' : ''}`}
            onClick={onRoot}
            disabled={loading || !selectedDevice || isRoot === true}
            title={
              isRoot === true
                ? t('gpioViewer.rootEnabled', '已获取 Root 权限')
                : t('gpioViewer.getRoot', '获取 Root 权限')
            }
          >
            {isRoot === true ? '🔓 Root' : isRoot === false ? '🔒 Root' : '❓ Root'}
          </button>
        )}
      </div>
      {chipName && (
        <div className="gpio-chip-info">
          <span className="gpio-label">{t('gpioViewer.chip', '芯片')}:</span>
          <span className="gpio-chip-name">{chipName}</span>
        </div>
      )}
      {gpio && (
        <button className="gpio-refresh-btn" onClick={onRefresh} disabled={loading || !gpio}>
          {t('gpioViewer.refreshData', '刷新')}
        </button>
      )}
      {selectedPinsSize > 0 && !isEditing && (
        <>
          <button
            className="gpio-multi-edit-btn"
            onClick={onMultiEdit}
            disabled={loading || isEditing}
          >
            {t('gpioViewer.editSelected', '编辑选中')} ({selectedPinsSize})
          </button>
          <button className="gpio-clear-selection-btn" onClick={onClearSelection}>
            {t('gpioViewer.clearSelection', '清除选择')}
          </button>
        </>
      )}
    </div>
  );
};
