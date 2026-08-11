import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PinRowData, ProgressState } from '../types';

interface StatusBarProps {
  selectedDevice: string | null;
  pinData: PinRowData[];
  selectedPinsSize: number;
  editingPinsSize: number;
  isEditing: boolean;
  loading: boolean;
  progress: ProgressState;
  statusText: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  selectedDevice,
  pinData,
  selectedPinsSize,
  editingPinsSize,
  isEditing,
  loading,
  progress,
  statusText,
}) => {
  const { t } = useTranslation();

  return (
    <div className="gpio-statusbar">
      <span>
        {selectedDevice &&
          pinData.length > 0 &&
          `${pinData.length} ${t('gpioViewer.pins', '个引脚')}`}
        {selectedPinsSize > 0 &&
          ` | ${t('gpioViewer.selected', '已选择')} ${selectedPinsSize} ${t('gpioViewer.pins', '个引脚')}`}
        {isEditing &&
          ` | ${t('gpioViewer.editing', '编辑中')}: ${editingPinsSize} ${t('gpioViewer.pins', '个引脚')}`}
      </span>
      {loading && (
        <div className="gpio-statusbar-progress">
          <span className="gpio-statusbar-text">
            {statusText} ({progress.current}/{progress.total})
          </span>
          <div className="gpio-statusbar-track">
            <div
              className="gpio-statusbar-fill"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
      {!loading && <span>{statusText}</span>}
    </div>
  );
};
