import React from 'react';
import { useTranslation } from 'react-i18next';

export const CommandModeConfig: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="gf-section">
      <div className="gf-section-header">{t('genericFlash.mode.command', '命令模式')}</div>
      <div className="gf-section-body gf-section-body-small">
        <div className="gf-info-row">
          <span className="gf-info-value">
            {t('genericFlash.mode.commandHintText', '命令模式下逻辑扇区补偿不可操作，使用默认配置')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CommandModeConfig;
