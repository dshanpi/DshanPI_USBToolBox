import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DramConfig, DramParamFieldDef } from '../../../Drivers/Types';
import { DRAMParamField } from './DRAMParamField';

interface DRAMConfigPanelProps {
  dramConfig: DramConfig | null;
  dramParams: number[];
  onParamChange: (index: number, value: number) => void;
  onBitfieldChange: (index: number, offset: number, width: number, value: number) => void;
}

// Filter fields to show only those with bitfield or enum definitions
function filterParsedFields(fields: DramParamFieldDef[]): DramParamFieldDef[] {
  return fields.filter(
    (field) =>
      field.type === 'bitfield' || field.type === 'enum' || (field.type === 'number' && field.unit) // Include fields with units (like dram_clk)
  );
}

export const DRAMConfigPanel: React.FC<DRAMConfigPanelProps> = ({
  dramConfig,
  dramParams,
  onParamChange,
  onBitfieldChange,
}) => {
  const { t } = useTranslation();

  const parsedFields = useMemo(() => {
    if (!dramConfig) return [];
    return filterParsedFields(dramConfig.fields);
  }, [dramConfig]);

  return (
    <div className="dram-section dram-config-section">
      <div className="section-header">{t('dramTunning.paramConfig', 'DRAM Parameters')}</div>
      <div className="section-body">
        {dramConfig && (
          <div className="dram-fields-grid">
            {parsedFields.map((field) => (
              <DRAMParamField
                key={field.name}
                field={field}
                value={dramParams[field.index]}
                onChange={onParamChange}
                onBitfieldChange={onBitfieldChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
