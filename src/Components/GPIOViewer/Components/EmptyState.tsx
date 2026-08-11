import React from 'react';
import { useTranslation } from 'react-i18next';

interface EmptyStateProps {
  icon: string;
  message: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, message }) => {
  return (
    <div className="gpio-empty">
      <div className="gpio-empty-icon">{icon}</div>
      <span>{message}</span>
    </div>
  );
};

interface ServerNotRunningProps {
  renderToolbar: () => React.ReactNode;
}

export const ServerNotRunning: React.FC<ServerNotRunningProps> = ({ renderToolbar }) => {
  const { t } = useTranslation();

  return (
    <div className="gpio-viewer-container">
      {renderToolbar()}
      <EmptyState icon="⚠️" message={t('gpioViewer.serverNotRunning.title', 'ADB 服务器未运行')} />
    </div>
  );
};

interface NoDeviceSelectedProps {
  renderToolbar: () => React.ReactNode;
}

export const NoDeviceSelected: React.FC<NoDeviceSelectedProps> = ({ renderToolbar }) => {
  const { t } = useTranslation();

  return (
    <div className="gpio-viewer-container">
      {renderToolbar()}
      <EmptyState icon="📱" message={t('gpioViewer.noDeviceSelected', '请选择一个ADB设备')} />
    </div>
  );
};

export const NoData: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="gpio-empty">
      <span>{t('gpioViewer.noData', '暂无数据，请刷新')}</span>
    </div>
  );
};
