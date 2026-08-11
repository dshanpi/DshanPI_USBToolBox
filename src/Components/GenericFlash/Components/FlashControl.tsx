import React from 'react';
import { useTranslation } from 'react-i18next';
import { FlashProgress } from '../Types';

interface FlashControlProps {
  progress: FlashProgress | null;
  canFlash: boolean;
  isFlashing: boolean;
  isCancelling: boolean;
  onFlash: () => void;
  onCancel: () => void;
}

export const FlashControl: React.FC<FlashControlProps> = ({
  progress,
  canFlash,
  isFlashing,
  isCancelling,
  onFlash,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <div className="gf-section">
      <div className="gf-section-header">{t('genericFlash.flashControl.title', '烧写控制')}</div>
      <div className="gf-section-body">
        <div className="gf-progress-container">
          <div className="gf-progress-info">
            <div
              className={`gf-progress-bar ${progress?.indeterminate ? 'gf-progress-bar--indeterminate' : ''}`}
            >
              <div
                className="gf-progress-fill"
                style={{ width: progress?.indeterminate ? 0 : `${progress?.percent ?? 0}%` }}
              />
            </div>
            <span className="gf-progress-percent">
              {progress?.indeterminate ? '0.0' : (progress?.percent ?? 0).toFixed(1)}%
            </span>
          </div>
          <span className="gf-progress-stage">
            {progress?.stage || t('genericFlash.flashControl.waiting', '等待开始...')}
          </span>
        </div>

        {isFlashing ? (
          <button
            onClick={onCancel}
            disabled={isCancelling}
            className="gf-btn gf-btn-danger gf-btn-block"
          >
            {isCancelling
              ? t('genericFlash.flashControl.cancelling', '取消中...')
              : t('genericFlash.flashControl.cancel', '取消烧写')}
          </button>
        ) : (
          <button
            onClick={onFlash}
            disabled={!canFlash}
            className="gf-btn gf-btn-success gf-btn-block"
          >
            {t('genericFlash.flashControl.startFlash', '开始烧写')}
          </button>
        )}
      </div>
    </div>
  );
};
