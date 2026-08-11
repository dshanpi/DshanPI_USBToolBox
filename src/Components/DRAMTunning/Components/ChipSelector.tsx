import React from 'react';
import { useTranslation } from 'react-i18next';

interface ChipSelectorProps {
  availableChips: { id: string; name: string }[];
  selectedChipId: string | null;
  onSelectChip: (chipId: string) => void;
}

export const ChipSelector: React.FC<ChipSelectorProps> = ({
  availableChips,
  selectedChipId,
  onSelectChip,
}) => {
  const { t } = useTranslation();

  return (
    <div className="dram-section">
      <div className="section-header">{t('dramTunning.chipSelect', 'Select Chip')}</div>
      <div className="section-body">
        <select
          className="dram-select"
          value={selectedChipId ?? ''}
          onChange={(e) => onSelectChip(e.target.value)}
        >
          <option value="" disabled>
            {t('dramTunning.selectChip', '-- Select Chip --')}
          </option>
          {availableChips.map((chip) => (
            <option key={chip.id} value={chip.id}>
              {chip.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};