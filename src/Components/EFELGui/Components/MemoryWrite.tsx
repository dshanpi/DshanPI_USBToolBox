import React from 'react';
import { useTranslation } from 'react-i18next';

interface MemoryWriteProps {
  writeAddress: string;
  writeFilePath: string | null;
  isReady: boolean;
  loading: boolean;
  onAddressChange: (addr: string) => void;
  onSelectFile: () => void;
  onWrite: () => void;
}

export const MemoryWrite: React.FC<MemoryWriteProps> = ({
  writeAddress,
  writeFilePath,
  isReady,
  loading,
  onAddressChange,
  onSelectFile,
  onWrite,
}) => {
  const { t } = useTranslation();

  return (
    <div className="efex-section">
      <div className="section-header">{t('efelGui.memoryWrite.title', '内存写入')}</div>
      <div className="section-body">
        <div className="efex-form-group">
          <label>{t('efelGui.memoryWrite.targetAddr', '目标地址')}</label>
          <input
            type="text"
            value={writeAddress}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder="0x00000000"
            disabled={!isReady || loading}
          />
        </div>
        <div className="efex-form-group">
          <label>{t('efelGui.memoryWrite.selectFile', '选择文件')}</label>
          <div className="efex-file-row">
            <input
              type="text"
              value={writeFilePath || ''}
              readOnly
              placeholder={t('efelGui.memoryWrite.selectFilePlaceholder', '未选择文件')}
              disabled={!isReady || loading}
            />
            <button
              onClick={onSelectFile}
              disabled={!isReady || loading}
              className="efex-btn efex-btn-small efex-btn-primary"
            >
              {t('common.browse', '浏览...')}
            </button>
          </div>
        </div>
        <button
          onClick={onWrite}
          disabled={!isReady || loading || !writeFilePath}
          className="efex-btn efex-btn-primary efex-btn-block"
        >
          {loading
            ? t('efelGui.memoryWrite.writing', '写入中...')
            : t('efelGui.memoryWrite.writeMemory', '写入内存')}
        </button>
      </div>
    </div>
  );
};
