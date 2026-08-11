import React from 'react';
import { MassProduction } from './MassProduction';

interface MassProductionPageProps {
  isActive?: boolean;
  onRunningChange?: (running: boolean) => void;
}

export const MassProductionPage: React.FC<MassProductionPageProps> = ({
  isActive = true,
  onRunningChange,
}) => {
  return <MassProduction isActive={isActive} onRunningChange={onRunningChange} />;
};

export default MassProductionPage;
