import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '../../CoreUI';
import { SerialTool } from './SerialTool';

interface SerialToolPageProps {
  isActive?: boolean;
}

export const SerialToolPage: React.FC<SerialToolPageProps> = ({ isActive = true }) => {
  const { t } = useTranslation();
  return (
    <div className="serial-tool-page-root">
      <PageContainer title={t('tools.serialTool.name', 'Serial Tool')}>
        <SerialTool isActive={isActive} />
      </PageContainer>
    </div>
  );
};
