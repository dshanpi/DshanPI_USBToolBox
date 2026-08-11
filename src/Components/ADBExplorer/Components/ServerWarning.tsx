import React from 'react';
import { useTranslation } from 'react-i18next';

interface ServerWarningProps {
  onRetry: () => void;
}

export const ServerWarning: React.FC<ServerWarningProps> = ({ onRetry }) => {
  const { t } = useTranslation();

  return (
    <div className="nautilus-container">
      <div className="nautilus-server-warning">
        <div className="nautilus-warning-icon">⚠️</div>
        <h3>{t('adbExplorer.serverNotRunning.title', 'ADB 服务器未运行')}</h3>
        <p>
          {t(
            'adbExplorer.serverNotRunning.description',
            'ADB 服务器未响应，请检查 ADB 是否正确安装并运行。'
          )}
        </p>
        <button className="nautilus-primary-btn" onClick={onRetry}>
          {t('adbExplorer.serverNotRunning.retry', '重试')}
        </button>
      </div>
    </div>
  );
};
