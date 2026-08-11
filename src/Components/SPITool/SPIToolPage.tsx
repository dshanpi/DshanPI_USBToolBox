import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '../../CoreUI';
import { SPITool } from './SPITool';

interface SPIToolPageProps {
  isActive?: boolean;
}

export const SPIToolPage: React.FC<SPIToolPageProps> = () => {
  const { t } = useTranslation();
  return (
    <div className="serial-tool-page-root">
      <PageContainer title={t('tools.spiTool.name', 'SPI Tool')}>
        <SPITool />
      </PageContainer>
    </div>
  );
};
