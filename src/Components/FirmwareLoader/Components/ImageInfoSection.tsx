import React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageInfo, Partition } from '../../../Library/OpenixIMG';
import { formatSize } from '../../../Utils';

interface ImageInfoSectionProps {
  imageInfo: ImageInfo;
  partitions: Partition[];
  isEncrypted: boolean;
}

export const ImageInfoSection: React.FC<ImageInfoSectionProps> = ({
  imageInfo,
  partitions,
  isEncrypted,
}) => {
  const { t } = useTranslation();

  const getPartitionsTotalSize = (): string => {
    const totalSectors = partitions.reduce((total, partition) => total + partition.size, 0);
    return formatSize(totalSectors * 512);
  };

  return (
    <div className="image-info">
      <h3>{t('firmwareLoader.imageInfo.title', '镜像信息')}</h3>
      <div className="info-grid">
        <div className="info-item">
          <span className="label">{t('firmwareLoader.imageInfo.fullSize', '完整镜像大小')}</span>
          <span className="value">{formatSize(imageInfo.header.image_size)}</span>
        </div>
        <div className="info-item">
          <span className="label">
            {t('firmwareLoader.imageInfo.partitionSize', '逻辑分区大小')}
          </span>
          <span className="value">{getPartitionsTotalSize()}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.imageInfo.fileCount', '文件数量')}</span>
          <span className="value">{imageInfo.files.length}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.imageInfo.encrypted', '加密镜像')}</span>
          <span className="value">
            {isEncrypted ? t('common.yes', '是') : t('common.no', '否')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ImageInfoSection;
