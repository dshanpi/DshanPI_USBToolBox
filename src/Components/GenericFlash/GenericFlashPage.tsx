import React from 'react';
import { GenericFlash } from './GenericFlash';

interface GenericFlashPageProps {
  isActive?: boolean;
}

export const GenericFlashPage: React.FC<GenericFlashPageProps> = ({ isActive = true }) => {
  return <GenericFlash isActive={isActive} />;
};

export default GenericFlashPage;
