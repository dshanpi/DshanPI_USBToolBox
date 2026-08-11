import React from 'react';
import { useTranslation } from 'react-i18next';
import { MbrExportOptions } from '../Hooks';

interface MbrExportProps {
  mbrExportOptions: MbrExportOptions;
  hasMbr: boolean;
  isFlashing: boolean;
  onExportOptionsChange: (options: MbrExportOptions) => void;
  onExportMbr: () => void;
}

export const MbrExport: React.FC<MbrExportProps> = ({
  mbrExportOptions,
  hasMbr,
  isFlashing,
  onExportOptionsChange,
  onExportMbr,
}) => {
  const { t } = useTranslation();

  return (
    <div className="sf-section">
      <div className="sf-section-header">
        {t('sectorFlash.flashControl.exportTitle', '导出 MBR')}
      </div>
      <div className="sf-section-body">
        <div className="sf-export-option">
          <label>{t('sectorFlash.flashControl.exportFormat', '导出格式')}</label>
          <select
            value={mbrExportOptions.format}
            onChange={(e) =>
              onExportOptionsChange({
                ...mbrExportOptions,
                format: e.target.value as MbrExportOptions['format'],
              })
            }
            disabled={isFlashing}
            className="sf-select"
          >
            <option value="binary">
              {t('sectorFlash.flashControl.formatBinary', '二进制 (BIN)')}
            </option>
            <option value="json">{t('sectorFlash.flashControl.formatJson', 'JSON')}</option>
          </select>
        </div>
        {mbrExportOptions.format === 'json' && (
          <div className="sf-export-option sf-checkbox-option">
            <label>
              <input
                type="checkbox"
                checked={mbrExportOptions.includePartitions}
                onChange={(e) =>
                  onExportOptionsChange({
                    ...mbrExportOptions,
                    includePartitions: e.target.checked,
                  })
                }
                disabled={isFlashing}
              />
              {t('sectorFlash.flashControl.includePartitions', '包含分区表')}
            </label>
          </div>
        )}
        {mbrExportOptions.format === 'binary' && (
          <div className="sf-export-option sf-checkbox-option">
            <label>
              <input
                type="checkbox"
                checked={mbrExportOptions.includeCopies}
                onChange={(e) =>
                  onExportOptionsChange({ ...mbrExportOptions, includeCopies: e.target.checked })
                }
                disabled={isFlashing}
              />
              {t('sectorFlash.flashControl.includeCopies', '包含备份')}
            </label>
          </div>
        )}
        <button
          onClick={onExportMbr}
          disabled={!hasMbr || isFlashing}
          className="sf-btn sf-btn-secondary sf-btn-block"
        >
          {t('sectorFlash.flashControl.exportMbr', '导出 MBR')}
        </button>
      </div>
    </div>
  );
};
