import React from 'react';
import { useTranslation } from 'react-i18next';

interface TestControlProps {
  testing: boolean;
  disabled: boolean;
  onRunTest: () => void;
}

export const TestControl: React.FC<TestControlProps> = ({ testing, disabled, onRunTest }) => {
  const { t } = useTranslation();

  return (
    <div className="dram-section">
      <div className="section-header">{t('dramTunning.testControl', 'Test')}</div>
      <div className="section-body">
        <button
          onClick={onRunTest}
          disabled={disabled || testing}
          className="dram-btn dram-btn-primary dram-btn-block"
        >
          {testing
            ? t('dramTunning.testing', 'Testing...')
            : t('dramTunning.runTest', 'Run DRAM Test')}
        </button>
      </div>
    </div>
  );
};
