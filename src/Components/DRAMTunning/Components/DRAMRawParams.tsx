import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatHex } from '../../../Utils/Format';

interface DRAMRawParamsProps {
  dramParams: number[];
  onParamChange: (index: number, value: number) => void;
}

function parseHex(input: string): number | null {
  const cleaned = input.trim().replace(/^0x/i, '');
  const parsed = parseInt(cleaned, 16);
  if (isNaN(parsed)) return null;
  return parsed >>> 0;
}

export const DRAMRawParams: React.FC<DRAMRawParamsProps> = ({ dramParams, onParamChange }) => {
  const { t } = useTranslation();

  return (
    <div className="dram-section dram-raw-params">
      <div className="section-header">{t('dramTunning.rawParams', 'Raw Parameters (Hex)')}</div>
      <div className="section-body">
        <div className="dram-raw-list">
          {dramParams.map((value, index) => (
            <div key={index} className="dram-raw-item">
              <label className="dram-raw-label">[{index}]</label>
              <input
                type="text"
                className="dram-raw-input"
                value={formatHex(value)}
                onChange={(e) => {
                  const parsed = parseHex(e.target.value);
                  if (parsed !== null) {
                    onParamChange(index, parsed);
                  }
                }}
                onBlur={(e) => {
                  const parsed = parseHex(e.target.value);
                  if (parsed !== null && parsed !== value) {
                    onParamChange(index, parsed);
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
