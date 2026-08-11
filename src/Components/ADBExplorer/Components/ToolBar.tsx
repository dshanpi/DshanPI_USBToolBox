import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AdbDevice } from '../../../Services';

interface ToolBarProps {
  devices: AdbDevice[];
  selectedDevice: string | null;
  isRoot: boolean | null;
  loading: boolean;
  currentPath: string;
  onSelectDevice: (serial: string) => void;
  onScanDevices: (currentPath?: string) => void;
  onRoot: () => void;
}

export const ToolBar: React.FC<ToolBarProps> = ({
  devices,
  selectedDevice,
  isRoot,
  loading,
  currentPath,
  onSelectDevice,
  onScanDevices,
  onRoot,
}) => {
  const { t } = useTranslation();

  return (
    <div className="nautilus-toolbar">
      <div className="nautilus-device-selector">
        <span className="nautilus-label">{t('adbExplorer.device', '设备')}</span>
        {devices.length > 1 ? (
          <select
            value={selectedDevice || ''}
            onChange={(e) => onSelectDevice(e.target.value)}
            disabled={loading}
          >
            <option value="">{t('adbExplorer.selectDevice', '选择设备')}</option>
            {devices.map((device) => (
              <option key={device.serial} value={device.serial}>
                {device.model || device.product || device.serial}
              </option>
            ))}
          </select>
        ) : (
          <span className="nautilus-device-name">
            {devices.length === 1
              ? devices[0].model || devices[0].product || devices[0].serial
              : t('adbExplorer.noDevice', '无设备')}
          </span>
        )}
        <button
          className="nautilus-small-btn"
          onClick={() => onScanDevices(currentPath)}
          disabled={loading}
        >
          {t('adbExplorer.refresh', '刷新')}
        </button>
        {selectedDevice && (
          <button
            className={`nautilus-root-btn ${isRoot === true ? 'root-yes' : isRoot === false ? 'root-no' : ''}`}
            onClick={onRoot}
            disabled={loading || !selectedDevice || isRoot === true}
            title={
              isRoot === true
                ? t('adbExplorer.rootEnabled', '已获取 Root 权限')
                : t('adbExplorer.getRoot', '获取 Root 权限')
            }
          >
            {isRoot === true ? '🔓 Root' : isRoot === false ? '🔒 Root' : '❓ Root'}
          </button>
        )}
      </div>
    </div>
  );
};
