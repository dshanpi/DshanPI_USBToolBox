import React from 'react';
import { SectorFlash } from './SectorFlash';

interface SectorFlashPageProps {
  isActive?: boolean;
}

export const SectorFlashPage: React.FC<SectorFlashPageProps> = ({ isActive = true }) => {
  return <SectorFlash isActive={isActive} />;
};

export default SectorFlashPage;
