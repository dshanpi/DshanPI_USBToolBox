import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FdtInfo, parseFdtFromData, generateFdtDts } from '../../../Library/FDT';
import { DtbViewerModal } from './DtbViewerModal';

interface DtbSectionProps {
  fdtData: Uint8Array;
}

export const DtbSection: React.FC<DtbSectionProps> = ({ fdtData }) => {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const [dtsContent, setDtsContent] = useState('');
  const [fdtInfo, setFdtInfo] = useState<FdtInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleOpenViewer = useCallback(async () => {
    if (!fdtData) return;

    setIsLoading(true);
    try {
      const fdt = await parseFdtFromData(fdtData);
      setFdtInfo(fdt);
      const dts = await generateFdtDts(fdtData);
      setDtsContent(dts);
      setShowModal(true);
    } catch (err) {
      console.error('Failed to parse DTB:', err);
    } finally {
      setIsLoading(false);
    }
  }, [fdtData]);

  const handleCloseViewer = useCallback(() => {
    setShowModal(false);
  }, []);

  return (
    <div className="dtb-section">
      <div className="dtb-section-header">
        <div className="dtb-model-info">
          <span className="dtb-label">{t('firmwareLoader.dtb.model')}</span>
          <span className="dtb-value">{fdtInfo?.root.model || '-'}</span>
        </div>
        <button className="dtb-open-btn" onClick={handleOpenViewer} disabled={isLoading}>
          {isLoading
            ? t('firmwareLoader.dtb.loading', '加载中...')
            : t('firmwareLoader.dtb.openTree', '打开设备树')}
        </button>
      </div>

      <DtbViewerModal visible={showModal} dtsContent={dtsContent} onClose={handleCloseViewer} />
    </div>
  );
};

export default DtbSection;
