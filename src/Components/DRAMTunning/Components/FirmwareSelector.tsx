import React from 'react';
import { useTranslation } from 'react-i18next';

interface FirmwareSelectorProps {
  firmwarePath: string | null;
  boot0Header: { ret_addr: number; run_addr: number } | null;
  loading: boolean;
  onSelectFirmware: () => void;
}

export const FirmwareSelector: React.FC<FirmwareSelectorProps> = ({
  firmwarePath,
  boot0Header,
  loading,
  onSelectFirmware,
}) => {
  const { t } = useTranslation();

  return (
    <div className="dram-section">
      <div className="section-header">{t('dramTunning.firmwareSelect', 'Select Firmware')}</div>
      <div className="section-body">
        <button
          onClick={onSelectFirmware}
          disabled={loading}
          className="dram-btn dram-btn-primary dram-btn-block"
        >
          {loading
            ? t('common.loading', 'Loading...')
            : t('dramTunning.openFirmware', 'Open Firmware')}
        </button>
        {firmwarePath && (
          <div className="dram-firmware-info">
            <div className="firmware-path" title={firmwarePath}>
              {firmwarePath.split(/[/\\]/).pop()}
            </div>
            {boot0Header && (
              <div className="firmware-addrs">
                <span>ret: 0x{boot0Header.ret_addr.toString(16)}</span>
                <span>run: 0x{boot0Header.run_addr.toString(16)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
