import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '../../CoreUI';
import { GPIOTool } from './GPIOTool';

interface GPIOToolPageProps {
  isActive?: boolean;
}

export const GPIOToolPage: React.FC<GPIOToolPageProps> = ({ isActive }) => {
  const { t } = useTranslation();

  return (
    <div className="serial-tool-page-root">
      <PageContainer
        title={t('tools.gpioTool.name', 'GPIO Tool')}
        description={t('gpioTool.pageDescription')}
      >
        <GPIOTool isActive={isActive} />
      </PageContainer>
    </div>
  );
};
