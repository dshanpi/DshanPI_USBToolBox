import React from 'react';
import { useTranslation } from 'react-i18next';

interface ExecJumpProps {
  execAddress: string;
  isReady: boolean;
  loading: boolean;
  onAddressChange: (addr: string) => void;
  onExec: () => void;
}

export const ExecJump: React.FC<ExecJumpProps> = ({
  execAddress,
  isReady,
  loading,
  onAddressChange,
  onExec,
}) => {
  const { t } = useTranslation();

  return (
    <div className="efex-section">
      <div className="section-header">{t('efelGui.execJump.title', '执行跳转')}</div>
      <div className="section-body">
        <div className="efex-form-group">
          <label>{t('efelGui.execJump.entryAddr', '入口地址')}</label>
          <div className="efex-file-row">
            <input
              type="text"
              value={execAddress}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="0x00000000"
              disabled={!isReady || loading}
            />
            <button
              onClick={onExec}
              disabled={!isReady || loading}
              className="efex-btn efex-btn-small efex-btn-primary"
            >
              {loading
                ? t('efelGui.execJump.executing', '执行中...')
                : t('efelGui.execJump.exec', '执行')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
