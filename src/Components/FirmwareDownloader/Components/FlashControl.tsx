import React from 'react';
import { useTranslation } from 'react-i18next';
import { FlashProgress, FlashDevice, LogEntry } from '../../../FlashManager';
import { POST_FLASH_ACTION_OPTIONS, type PostFlashAction } from '../../../Domain/flash';
import { FlashLog } from './FlashLog';

interface FlashControlProps {
  progress: FlashProgress | null;
  verifyDownload: boolean;
  autoFlashOnConnect: boolean;
  postFlashAction: PostFlashAction;
  isFlashing: boolean;
  isCancelling: boolean;
  selectedDevice: FlashDevice | null;
  imagePath: string | null;
  logs: LogEntry[];
  isDeviceReady: (device: FlashDevice | null) => boolean;
  onVerifyDownloadChange: (checked: boolean) => void;
  onAutoFlashOnConnectChange: (checked: boolean) => void;
  onPostFlashActionChange: (action: PostFlashAction) => void;
  onStartFlash: () => void;
  onCancelFlash: () => void;
}

export const FlashControl: React.FC<FlashControlProps> = ({
  progress,
  verifyDownload,
  autoFlashOnConnect,
  postFlashAction,
  isFlashing,
  isCancelling,
  selectedDevice,
  imagePath,
  logs,
  isDeviceReady,
  onVerifyDownloadChange,
  onAutoFlashOnConnectChange,
  onPostFlashActionChange,
  onStartFlash,
  onCancelFlash,
}) => {
  const { t } = useTranslation();

  return (
    <div className="fd-right-column">
      <div className="fd-row fd-row-top">
        <div className="fd-section fd-section-options">
          <h3>{t('firmwareDownloader.flashControl.optionsTitle', '功能配置')}</h3>
          <div className="fd-checkbox-group">
            <div className="fd-checkbox-row">
              <label className="fd-checkbox-item">
                <input
                  type="checkbox"
                  checked={verifyDownload}
                  onChange={(e) => onVerifyDownloadChange(e.target.checked)}
                  disabled={isFlashing}
                />
                <span className="fd-checkbox-label">
                  {t('firmwareDownloader.flashControl.verifyDownload', '验证下载镜像')}
                </span>
              </label>
              <label className="fd-checkbox-item">
                <input
                  type="checkbox"
                  checked={autoFlashOnConnect}
                  onChange={(e) => onAutoFlashOnConnectChange(e.target.checked)}
                  disabled={isFlashing}
                />
                <span className="fd-checkbox-label">
                  {t('firmwareDownloader.flashControl.autoFlashOnConnect', '插入设备后自动烧录')}
                </span>
              </label>
            </div>
            <label className="fd-select-item">
              <span className="fd-select-label">
                {t('firmwareDownloader.flashControl.postFlashAction', '烧录完成后')}
              </span>
              <select
                value={postFlashAction}
                onChange={(e) => onPostFlashActionChange(e.target.value as PostFlashAction)}
                disabled={isFlashing}
                className="fd-select"
              >
                {POST_FLASH_ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="fd-section fd-section-action">
          <h3>{t('firmwareDownloader.flashControl.controlTitle', '烧录控制')}</h3>
          <div className="fd-progress-container">
            <div className="fd-progress-row">
              <div
                className={`fd-progress-bar ${isCancelling ? 'fd-progress-bar--cancelling' : ''} ${progress?.indeterminate ? 'fd-progress-bar--indeterminate' : ''}`}
              >
                <div
                  className="fd-progress-fill"
                  style={{
                    width: `${isCancelling || progress?.indeterminate ? 0 : (progress?.percent ?? 0)}%`,
                  }}
                />
              </div>
              <span className="fd-progress-percent">
                {isCancelling || progress?.indeterminate
                  ? '0.0'
                  : (progress?.percent ?? 0).toFixed(1)}
                %
              </span>
            </div>
            <div className="fd-progress-stage">
              {isCancelling
                ? t('firmwareDownloader.flashControl.cancelling', '正在取消...')
                : (progress?.stage ?? t('firmwareDownloader.flashControl.waiting', '等待开始'))}
            </div>
            {progress?.speed && !isCancelling && !progress?.indeterminate && (
              <div className="fd-progress-speed">
                {t('firmwareDownloader.flashControl.speed', '速度')} {progress.speed}
              </div>
            )}
          </div>
          <button
            onClick={isFlashing ? onCancelFlash : onStartFlash}
            disabled={
              isCancelling ||
              (!isFlashing && (!selectedDevice || !imagePath || !isDeviceReady(selectedDevice)))
            }
            className={`fd-button fd-button-large ${isCancelling ? 'fd-button-warning' : isFlashing ? 'fd-button-danger' : 'fd-button-primary'}`}
          >
            {isCancelling
              ? t('firmwareDownloader.flashControl.cancellingFlash', '正在取消烧写...')
              : isFlashing
                ? t('firmwareDownloader.flashControl.cancelFlash', '取消烧写')
                : t('firmwareDownloader.flashControl.startFlash', '开始烧写')}
          </button>
        </div>
      </div>

      <FlashLog logs={logs} />
    </div>
  );
};
