import React from 'react';
import { formatHex } from '../../../Utils/Format';
import type { DramParamFieldDef } from '../../../Drivers/Types';

interface DRAMParamFieldProps {
  field: DramParamFieldDef;
  value: number;
  onChange: (index: number, value: number) => void;
  onBitfieldChange: (index: number, offset: number, width: number, value: number) => void;
}

function getBitfieldValue(value: number, offset: number, width: number): number {
  return (value >>> offset) & ((1 << width) - 1);
}

export const DRAMParamField: React.FC<DRAMParamFieldProps> = ({
  field,
  value,
  onChange,
  onBitfieldChange,
}) => {
  if (field.type === 'enum' && field.options) {
    return (
      <div className="dram-field-group">
        {field.description && <div className="dram-field-desc">{field.description}</div>}
        <label className="dram-field-label">{field.label}</label>
        <select
          className="dram-select"
          value={value}
          onChange={(e) => onChange(field.index, Number(e.target.value))}
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'bitfield' && field.bits) {
    return (
      <div className="dram-bitfield-card">
        <div className="dram-bitfield-header">
          <div className="dram-bitfield-title">
            {field.description && <div className="dram-field-desc">{field.description}</div>}
            <span className="dram-bitfield-name">{field.label}</span>
          </div>
          <span className="dram-bitfield-hex">{formatHex(value)}</span>
        </div>
        <div className="dram-bitfield-grid">
          {field.bits.map((bit) => {
            const bitValue = getBitfieldValue(value, bit.offset, bit.width);
            return (
              <div key={bit.name} className="dram-bitfield-item">
                <label className="dram-bitfield-label">{bit.label}</label>
                {bit.options ? (
                  <select
                    className="dram-select dram-select-sm"
                    value={bitValue}
                    onChange={(e) =>
                      onBitfieldChange(field.index, bit.offset, bit.width, Number(e.target.value))
                    }
                  >
                    {bit.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    className="dram-input dram-input-sm"
                    value={bitValue}
                    min={0}
                    max={(1 << bit.width) - 1}
                    onChange={(e) =>
                      onBitfieldChange(field.index, bit.offset, bit.width, Number(e.target.value))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="dram-field-group">
      {field.description && <div className="dram-field-desc">{field.description}</div>}
      <label className="dram-field-label">
        {field.label}
        {field.unit && <span className="dram-field-unit">({field.unit})</span>}
      </label>
      {field.hex ? (
        <input
          type="text"
          className="dram-input"
          value={formatHex(value)}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 16);
            if (!isNaN(parsed)) onChange(field.index, parsed >>> 0);
          }}
        />
      ) : (
        <input
          type="number"
          className="dram-input"
          value={value}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => onChange(field.index, Number(e.target.value))}
        />
      )}
    </div>
  );
};
