import React from 'react';
import { useTranslation } from 'react-i18next';

interface FlashProgress {
  percent: number;
  stage: string;
  indeterminate?: boolean;
}

interface FlashControlProps {
  progress: FlashProgress;
  canFlash: boolean;
  isFlashing: boolean;
  onFlash: () => void;
}

export const FlashControl: React.FC<FlashControlProps> = ({
  progress,
  canFlash,
  isFlashing,
  onFlash,
}) => {
  const { t } = useTranslation();

  return (
    <div className="sf-section">
      <div className="sf-section-header">{t('sectorFlash.flashControl.title', '烧录控制')}</div>
      <div className="sf-section-body">
        <div className="sf-progress-container">
          <div className="sf-progress-info">
            <div
              className={`sf-progress-bar ${progress.indeterminate ? 'sf-progress-bar--indeterminate' : ''}`}
            >
              <div
                className="sf-progress-fill"
                style={{ width: progress.indeterminate ? 0 : `${progress.percent}%` }}
              />
            </div>
            <span className="sf-progress-percent">
              {progress.indeterminate ? '0.0' : progress.percent.toFixed(1)}%
            </span>
          </div>
          <span className="sf-progress-stage">
            {progress.stage || t('sectorFlash.flashControl.waiting', '等待烧录')}
          </span>
        </div>

        <button
          onClick={onFlash}
          disabled={!canFlash}
          className="sf-btn sf-btn-success sf-btn-block"
        >
          {isFlashing
            ? t('sectorFlash.flashControl.flashing', '烧录中...')
            : t('sectorFlash.flashControl.startFlash', '开始烧写')}
        </button>
      </div>
    </div>
  );
};
