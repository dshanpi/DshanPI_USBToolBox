import React from 'react';
import { useTranslation } from 'react-i18next';

interface InitMemoryProps {
  initFilePath: string | null;
  isReady: boolean;
  loading: boolean;
  onSelectFile: () => void;
  onInit: () => void;
}

export const InitMemory: React.FC<InitMemoryProps> = ({
  initFilePath,
  isReady,
  loading,
  onSelectFile,
  onInit,
}) => {
  const { t } = useTranslation();

  return (
    <div className="efex-section">
      <div className="section-header">{t('efelGui.initMemory.title', '初始化内存')}</div>
      <div className="section-body">
        <div className="efex-form-group">
          <label>{t('efelGui.initMemory.imageFile', '镜像文件')}</label>
          <div className="efex-file-row">
            <input
              type="text"
              value={initFilePath || ''}
              readOnly
              placeholder={t('efelGui.initMemory.selectImagePlaceholder', '未选择镜像')}
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
          onClick={onInit}
          disabled={!isReady || loading || !initFilePath}
          className="efex-btn efex-btn-primary efex-btn-block"
        >
          {loading ? t('efelGui.initMemory.running', '运行中...') : t('common.run', '运行')}
        </button>
      </div>
    </div>
  );
};
