import React from 'react';
import { useTranslation } from 'react-i18next';
import { FirmwareLoader } from '../FirmwareLoader';
import { PageContainer } from '../../CoreUI';
import { ImageInfo } from '../../Library/DshanPIIMG';

interface FirmwareLoaderPageProps {
  onImageLoaded?: (info: ImageInfo) => void;
}

export const FirmwareLoaderPage: React.FC<FirmwareLoaderPageProps> = ({ onImageLoaded }) => {
  const { t } = useTranslation();

  return (
    <PageContainer
      title={t('firmwareLoader.title', '固件解析提取')}
      description={t(
        'firmwareLoader.description',
        '加载和解析 Allwinner 格式固件镜像，提取分区数据'
      )}
    >
      <FirmwareLoader onImageLoaded={onImageLoaded} />
    </PageContainer>
  );
};

export default FirmwareLoaderPage;
