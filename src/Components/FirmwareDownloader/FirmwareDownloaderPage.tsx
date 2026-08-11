import React from 'react';
import { useTranslation } from 'react-i18next';
import { FirmwareDownloader } from './FirmwareDownloader';
import { PageContainer } from '../../CoreUI';

interface FirmwareDownloaderPageProps {
  isActive?: boolean;
}

export const FirmwareDownloaderPage: React.FC<FirmwareDownloaderPageProps> = ({
  isActive = true,
}) => {
  const { t } = useTranslation();

  return (
    <PageContainer
      title={t('firmwareDownloader.title')}
      description={t('firmwareDownloader.description')}
    >
      <FirmwareDownloader isActive={isActive} />
    </PageContainer>
  );
};

export default FirmwareDownloaderPage;
