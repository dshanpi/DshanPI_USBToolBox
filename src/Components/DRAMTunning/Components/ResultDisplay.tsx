import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatHex } from '../../../Utils/Format';
import type { DRAMTestResult } from '../Types';
import type { DramConfig } from '../../../Drivers/Types';

interface ResultDisplayProps {
  result: DRAMTestResult | null;
  error: string | null;
  inputParams: number[];
  dramConfig: DramConfig | null;
}

export const ResultDisplay: React.FC<ResultDisplayProps> = ({
  result,
  error,
  inputParams,
  dramConfig,
}) => {
  const { t } = useTranslation();

  if (!result && !error) {
    return null;
  }

  if (error && !result) {
    return (
      <div className="dram-result-error">
        <div className="result-header result-header-error">
          {t('dramTunning.result.error', 'Error')}
        </div>
        <div className="result-error-msg">{error}</div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className={`dram-result ${result.success ? 'dram-result-success' : 'dram-result-fail'}`}>
      <div
        className={`result-header ${result.success ? 'result-header-success' : 'result-header-error'}`}
      >
        {result.success
          ? t('dramTunning.result.success', 'DRAM Test Passed')
          : t('dramTunning.result.failed', 'DRAM Test Failed')}
      </div>
      <div className="result-meta">
        <span>init_flag: {result.dram_init_flag}</span>
        <span>update_flag: {result.dram_update_flag}</span>
        <span>ret_addr: 0x{result.ret_addr.toString(16)}</span>
      </div>
      <div className="result-table-container">
        <table className="result-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('dramTunning.result.paramName', 'Parameter')}</th>
              <th>{t('dramTunning.result.input', 'Input')}</th>
              <th>{t('dramTunning.result.output', 'Output')}</th>
            </tr>
          </thead>
          <tbody>
            {result.dram_para.map((val, idx) => {
              const fieldDef = dramConfig?.fields.find((f) => f.index === idx);
              const changed = inputParams[idx] !== val;
              return (
                <tr key={idx} className={changed ? 'result-changed' : ''}>
                  <td>{idx}</td>
                  <td>{fieldDef?.name ?? `dram_para[${idx}]`}</td>
                  <td>{formatHex(inputParams[idx])}</td>
                  <td>{formatHex(val)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
