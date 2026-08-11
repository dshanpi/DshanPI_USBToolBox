import React from 'react';
import { useTranslation } from 'react-i18next';
import { UseLogicOffsetResult, StorageType } from '../Hooks/useLogicOffset';

interface LogicOffsetModeConfigProps {
  logicOffset: UseLogicOffsetResult;
  disabled: boolean;
}

export const LogicOffsetModeConfig: React.FC<LogicOffsetModeConfigProps> = ({
  logicOffset,
  disabled,
}) => {
  const { t } = useTranslation();
  const { config, loading, hasValidOffset, setStorageType, setManualOffset } = logicOffset;

  const handleStorageTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStorageType(e.target.value as StorageType);
  };

  const handleManualOffsetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 0) {
      setManualOffset(value);
    }
  };

  const isDisabled = disabled || loading;

  return (
    <div className="gf-section">
      <div className="gf-section-header">
        {t('genericFlash.logicOffset.title', '逻辑扇区补偿配置')}
      </div>
      <div className="gf-section-body gf-section-body-fix-size">
        <div className="gf-form-group">
          <label>{t('genericFlash.logicOffset.storageType', '存储类型')}</label>
          <select
            value={config.storageType}
            onChange={handleStorageTypeChange}
            disabled={isDisabled}
          >
            <option value="sdmmc">{t('genericFlash.logicOffset.sdmmc', 'SD/eMMC')}</option>
            <option value="ufs">{t('genericFlash.logicOffset.ufs', 'UFS')}</option>
            <option value="nor">{t('genericFlash.logicOffset.nor', 'NOR Flash')}</option>
          </select>
        </div>

        {hasValidOffset ? (
          <>
            <div className="gf-info-row">
              <span className="gf-info-label">
                {t('genericFlash.logicOffset.offset', '偏移补偿')}
              </span>
              <span className="gf-info-value">{config.logicOffset}</span>
            </div>
            <div className="gf-info-row">
              <span className="gf-info-label">{t('genericFlash.logicOffset.source', '来源')}</span>
              <span className="gf-info-value">
                {config.source === 'boot_dtb'
                  ? t('genericFlash.logicOffset.bootDtb', '引导固件 DTB')
                  : config.source === 'uboot_dtb'
                    ? t('genericFlash.logicOffset.ubootDtb', 'U-Boot DTB')
                    : t('genericFlash.logicOffset.manual', '手动输入')}
              </span>
            </div>
          </>
        ) : (
          <div className="gf-form-group">
            <label>{t('genericFlash.logicOffset.offset', '偏移补偿 (扇区)')}</label>
            <input
              value={config.logicOffset}
              onChange={handleManualOffsetChange}
              min={0}
              disabled={isDisabled}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default LogicOffsetModeConfig;
