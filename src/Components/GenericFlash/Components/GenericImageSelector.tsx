import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericImageInfo } from '../Hooks/useGenericImageLoader';
import { formatSize } from '../../../Utils';

interface GenericImageSelectorProps {
  imagePath: string | null;
  imageInfo: GenericImageInfo | null;
  loading: boolean;
  isFlashing: boolean;
  onOpenFile: () => void;
}

export const GenericImageSelector: React.FC<GenericImageSelectorProps> = ({
  imagePath,
  imageInfo,
  loading,
  isFlashing,
  onOpenFile,
}) => {
  const { t } = useTranslation();

  return (
    <div className="gf-section">
      <div className="gf-section-header">{t('genericFlash.genericImage.title', '通用固件')}</div>
      <div className="gf-section-body">
        <div className="gf-form-group">
          <label>{t('firmwareDownloader.firmwareInfo.filePath', '文件路径')}</label>
          <div className="gf-file-row">
            <input
              type="text"
              value={imagePath ? imagePath.split(/[/\\]/).pop() : ''}
              readOnly
              placeholder={t('common.notSelected', '未选择')}
              disabled={loading || isFlashing}
            />
            <button
              onClick={onOpenFile}
              disabled={loading || isFlashing}
              className="gf-btn gf-btn-small gf-btn-primary"
            >
              {t('common.browse', '浏览')}
            </button>
          </div>
        </div>
        <div className="gf-info-row">
          <span className="gf-info-label">
            {t('firmwareDownloader.firmwareInfo.imageSize', '镜像大小')}
          </span>
          <span className="gf-info-value">{imageInfo ? formatSize(imageInfo.size) : '-'}</span>
        </div>
      </div>
    </div>
  );
};
