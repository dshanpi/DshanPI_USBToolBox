import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DisasmArch } from '../Types';

interface EmptyHexViewProps {
  disasmArch: DisasmArch;
}

export const EmptyHexView: React.FC<EmptyHexViewProps> = ({ disasmArch }) => {
  const { t } = useTranslation();

  return (
    <div className="efex-hex-container">
      <div className="section-header hex-header">
        <span>{t('efelGui.memoryView.title', '内存查看')}</span>
        <div className="hex-header-controls">
          <span className="hex-header-label">{t('efelGui.memoryView.disasm', '反汇编')}</span>
          <select
            value={disasmArch}
            onChange={() => {}}
            className="efex-select efex-select-inline"
            disabled
          >
            <option value="off">{t('efelGui.memoryView.off', '关闭')}</option>
          </select>
        </div>
      </div>
      <div className="efex-empty-hex">{t('efelGui.memoryView.placeholder', '请先读取内存')}</div>
    </div>
  );
};
