import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '../../CoreUI';
import { ModbusTool } from './ModbusTool';

interface ModbusToolPageProps {
  isActive?: boolean;
}

export const ModbusToolPage: React.FC<ModbusToolPageProps> = ({ isActive: _isActive = true }) => {
  const { t } = useTranslation();
  return (
    <div className="modbus-tool-page-root">
      <PageContainer title={t('tools.modbusTool.name', 'Modbus Tool')}>
        <ModbusTool />
      </PageContainer>
    </div>
  );
};
