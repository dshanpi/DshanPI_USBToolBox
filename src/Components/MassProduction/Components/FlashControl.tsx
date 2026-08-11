import React from 'react';
import { useTranslation } from 'react-i18next';
import type { FlashMode, PostFlashAction } from '../../../Domain/flash';
import { POST_FLASH_ACTION_OPTIONS } from '../../../Domain/flash';
import { FLASH_MODE_LABELS } from '../../../FlashManager/Types';
import type { FlashStats } from '../Types';

// All flash modes from Domain/flash.ts
const ALL_FLASH_MODES: FlashMode[] = [
  'bootloader',
  'partition',
  'keep_data',
  'partition_erase',
  'full_erase',
  'erase_only',
];

interface FlashControlProps {
  isRunning: boolean;
  hasFirmware: boolean;
  stats: FlashStats;
  flashMode: FlashMode;
  postFlashAction: PostFlashAction;
  onFlashModeChange: (mode: FlashMode) => void;
  onPostFlashActionChange: (action: PostFlashAction) => void;
  onStart: () => void;
  onStop: () => void;
}

export const FlashControl: React.FC<FlashControlProps> = ({
  isRunning,
  hasFirmware,
  stats,
  flashMode,
  postFlashAction,
  onFlashModeChange,
  onPostFlashActionChange,
  onStart,
  onStop,
}) => {
  const { t } = useTranslation();

  return (
    <div className="mp-section">
      <div className="section-header">{t('massProduction.flashControl', '烧录控制')}</div>
      <div className="section-body">
        <div className="mp-stats">
          <div className="mp-stat-item mp-stat-success">
            <span className="mp-stat-value">{stats.success}</span>
            <span className="mp-stat-label">{t('massProduction.success', '成功')}</span>
          </div>
          <div className="mp-stat-item mp-stat-failed">
            <span className="mp-stat-value">{stats.failed}</span>
            <span className="mp-stat-label">{t('massProduction.failed', '失败')}</span>
          </div>
          <div className="mp-stat-item mp-stat-progress">
            <span className="mp-stat-value">{stats.inProgress}</span>
            <span className="mp-stat-label">{t('massProduction.inProgress', '进行中')}</span>
          </div>
        </div>

        <div className="mp-form-group">
          <label className="mp-form-label">{t('massProduction.flashMode', '烧录模式')}</label>
          <select
            className="mp-select"
            value={flashMode}
            onChange={(e) => onFlashModeChange(e.target.value as FlashMode)}
            disabled={isRunning}
          >
            {ALL_FLASH_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(FLASH_MODE_LABELS[mode])}
              </option>
            ))}
          </select>
        </div>

        <div className="mp-form-group">
          <label className="mp-form-label">{t('massProduction.postFlashAction', '完成后')}</label>
          <select
            className="mp-select"
            value={postFlashAction}
            onChange={(e) => onPostFlashActionChange(e.target.value as PostFlashAction)}
            disabled={isRunning}
          >
            {POST_FLASH_ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.label)}
              </option>
            ))}
          </select>
        </div>

        {!isRunning ? (
          <button
            className="mp-btn mp-btn-success mp-btn-block"
            onClick={onStart}
            disabled={!hasFirmware}
          >
            {t('massProduction.startFlash', '开始烧录')}
          </button>
        ) : (
          <button className="mp-btn mp-btn-danger mp-btn-block" onClick={onStop}>
            {t('massProduction.stopFlash', '停止烧录')}
          </button>
        )}
      </div>
    </div>
  );
};
