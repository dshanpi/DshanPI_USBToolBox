import React from 'react';
import { DRAMTunning } from './DRAMTunning';

interface DRAMTunningPageProps {
  isActive?: boolean;
}

export const DRAMTunningPage: React.FC<DRAMTunningPageProps> = ({ isActive = true }) => {
  return <DRAMTunning isActive={isActive} />;
};
