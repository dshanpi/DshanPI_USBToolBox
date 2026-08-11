import React from 'react';
import { useTranslation } from 'react-i18next';
import { MonacoEditor } from '../../../CoreUI/MonacoEditor';

interface DtbViewerModalProps {
  visible: boolean;
  dtsContent: string;
  onClose: () => void;
}

export const DtbViewerModal: React.FC<DtbViewerModalProps> = ({ visible, dtsContent, onClose }) => {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <div className="dtb-modal-overlay" onClick={onClose}>
      <div className="dtb-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="dtb-modal-header">
          <h3>{t('firmwareLoader.dtb.deviceTree', '设备树')}</h3>
          <div className="dtb-modal-actions">
            <button
              className="dtb-modal-copy-btn"
              onClick={() => navigator.clipboard.writeText(dtsContent)}
            >
              {t('common.copy', '复制')}
            </button>
            <button className="dtb-modal-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
        <div className="dtb-modal-content">
          <MonacoEditor value={dtsContent} language="dts" readOnly height="100%" />
        </div>
      </div>
    </div>
  );
};

export default DtbViewerModal;
