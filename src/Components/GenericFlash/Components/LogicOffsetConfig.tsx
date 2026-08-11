import React from 'react';
import { useTranslation } from 'react-i18next';
import { UseLogicOffsetResult } from '../Hooks/useLogicOffset';
import { GenericFlashMode } from '../../../Library/FDT';
import CommandModeConfig from './CommandModeConfig';
import LogicOffsetModeConfig from './LogicOffsetModeConfig';

interface LogicOffsetConfigProps {
  logicOffset: UseLogicOffsetResult;
  disabled: boolean;
}

export const LogicOffsetConfig: React.FC<LogicOffsetConfigProps> = ({ logicOffset, disabled }) => {
  const { t } = useTranslation();
  const { mode, setMode, loading } = logicOffset;

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMode(e.target.value as GenericFlashMode);
  };

  const isDisabled = disabled || loading;

  return (
    <>
      <div className="gf-section">
        <div className="gf-section-header">{t('genericFlash.mode.title', '烧录模式')}</div>
        <div className="gf-section-body gf-section-body-small">
          <div className="gf-form-group">
            <label>{t('genericFlash.mode.select', '模式选择')}</label>
            <select value={mode} onChange={handleModeChange} disabled={isDisabled}>
              <option value="command">{t('genericFlash.mode.command', '命令模式')}</option>
              <option value="logic_offset">
                {t('genericFlash.mode.logicOffset', '逻辑扇区补偿模式')}
              </option>
            </select>
          </div>
        </div>
      </div>

      {mode === 'command' ? (
        <CommandModeConfig />
      ) : (
        <LogicOffsetModeConfig logicOffset={logicOffset} disabled={isDisabled} />
      )}
    </>
  );
};

export default LogicOffsetConfig;
