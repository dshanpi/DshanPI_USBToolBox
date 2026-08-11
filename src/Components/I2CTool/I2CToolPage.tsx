import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '../../CoreUI';
import { I2CTool } from './I2CTool';

interface I2CToolPageProps {
  isActive?: boolean;
}

export const I2CToolPage: React.FC<I2CToolPageProps> = () => {
  const { t } = useTranslation();
  return (
    <div className="serial-tool-page-root">
      <PageContainer title={t('tools.i2cTool.name', 'I2C Tool')}>
        <I2CTool />
      </PageContainer>
    </div>
  );
};
