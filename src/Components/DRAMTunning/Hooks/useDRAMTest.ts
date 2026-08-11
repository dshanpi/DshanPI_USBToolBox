import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { efexService, type EfexContext } from '../../../Services';
import type { DRAMTestResult } from '../Types';

export interface UseDRAMTestReturn {
  testing: boolean;
  result: DRAMTestResult | null;
  error: string | null;
  handleRunTest: () => Promise<void>;
}

export const useDRAMTest = (
  context: EfexContext | null,
  fesData: Uint8Array | null,
  dramParams: number[],
  addLog: (level: string, message: string) => void
): UseDRAMTestReturn => {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<DRAMTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunTest = useCallback(async () => {
    if (!context || !fesData) return;

    setTesting(true);
    setResult(null);
    setError(null);
    addLog('INFO', t('dramTunning.log.startTest', 'Starting DRAM test...'));

    try {
      const initResult = await efexService.initDramWithParams(context, fesData, dramParams);

      const testResult: DRAMTestResult = {
        success: initResult.success,
        dram_init_flag: initResult.dram_init_flag,
        dram_update_flag: initResult.dram_update_flag,
        ret_addr: initResult.ret_addr,
        dram_para: initResult.dram_para,
      };

      setResult(testResult);

      if (testResult.success) {
        addLog(
          'OKAY',
          t('dramTunning.log.testSuccess', 'DRAM test succeeded! init_flag={{flag}}', {
            flag: testResult.dram_init_flag,
          })
        );
      } else {
        const errMsg = t('dramTunning.log.testFailed', 'DRAM test failed. init_flag={{flag}}', {
          flag: testResult.dram_init_flag,
        });
        setError(errMsg);
        addLog('ERRO', errMsg);
      }
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      const errMsg = t('dramTunning.log.testError', 'DRAM test error: {{error}}', {
        error: errObj.message,
      });
      setError(errMsg);
      addLog('ERRO', errMsg);
    } finally {
      setTesting(false);
    }
  }, [context, fesData, dramParams, addLog, t]);

  return { testing, result, error, handleRunTest };
};
