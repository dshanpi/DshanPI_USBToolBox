import React from 'react';
import { useTranslation } from 'react-i18next';

interface MemoryReadProps {
  address: string;
  length: string;
  memoryData: Uint8Array | null;
  isReady: boolean;
  loading: boolean;
  onAddressChange: (addr: string) => void;
  onLengthChange: (len: string) => void;
  onRead: () => void;
  onSave: () => void;
}

export const MemoryRead: React.FC<MemoryReadProps> = ({
  address,
  length,
  memoryData,
  isReady,
  loading,
  onAddressChange,
  onLengthChange,
  onRead,
  onSave,
}) => {
  const { t } = useTranslation();

  return (
    <div className="efex-section">
      <div className="section-header">{t('efelGui.memoryRead.title', '内存读取')}</div>
      <div className="section-body">
        <div className="efex-form-group">
          <label>{t('efelGui.memoryRead.startAddr', '起始地址')}</label>
          <input
            type="text"
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder="0x00000000"
            disabled={!isReady || loading}
          />
        </div>
        <div className="efex-form-group">
          <label>{t('efelGui.memoryRead.readLength', '读取长度')}</label>
          <input
            type="text"
            value={length}
            onChange={(e) => onLengthChange(e.target.value)}
            placeholder="256"
            disabled={!isReady || loading}
          />
        </div>
        <div className="efex-btn-row">
          <button
            onClick={onRead}
            disabled={!isReady || loading}
            className="efex-btn efex-btn-primary efex-btn-flex-3"
          >
            {loading
              ? t('efelGui.memoryRead.reading', '读取中...')
              : t('efelGui.memoryRead.readMemory', '读取内存')}
          </button>
          <button
            onClick={onSave}
            disabled={!memoryData}
            className="efex-btn efex-btn-primary efex-btn-flex-1"
          >
            {t('efelGui.memoryRead.save', '保存')}
          </button>
        </div>
      </div>
    </div>
  );
};
