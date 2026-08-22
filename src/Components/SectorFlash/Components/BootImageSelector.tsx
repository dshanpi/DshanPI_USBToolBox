import React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageInfo } from '../../../Library/DshanPIIMG';
import { formatSize } from '../../../Utils';

interface BootImageSelectorProps {
  imagePath: string | null;
  imageInfo: ImageInfo | null;
  partitionCount: number;
  loading: boolean;
  isFlashing: boolean;
  onOpenFile: () => void;
}

export const BootImageSelector: React.FC<BootImageSelectorProps> = ({
  imagePath,
  imageInfo,
  partitionCount,
  loading,
  isFlashing,
  onOpenFile,
}) => {
  const { t } = useTranslation();

  return (
    <div className="sf-section">
      <div className="sf-section-header">{t('sectorFlash.bootImage.title', '固件镜像')}</div>
      <div className="sf-section-body">
        <div className="sf-form-group">
          <label>{t('firmwareDownloader.firmwareInfo.filePath', '文件路径')}</label>
          <div className="sf-file-row">
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
              className="sf-btn sf-btn-small sf-btn-primary"
            >
              {t('common.browse', '浏览...')}
            </button>
          </div>
        </div>
        <div className="sf-info-row">
          <span className="sf-info-label">
            {t('firmwareDownloader.firmwareInfo.imageSize', '镜像大小')}
          </span>
          <span className="sf-info-value">
            {imageInfo ? formatSize(imageInfo.header.image_size) : '-'}
          </span>
        </div>
        <div className="sf-info-row">
          <span className="sf-info-label">
            {t('sectorFlash.partitionEditor.partitionCount', '分区数')}
          </span>
          <span className="sf-info-value">{partitionCount > 0 ? partitionCount : '-'}</span>
        </div>
      </div>
    </div>
  );
};
