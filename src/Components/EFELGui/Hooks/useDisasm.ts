import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisasmArch, DisasmInstruction, DisasmResult } from '../Types';
import { invokeCommand } from '../../../Platform/IPC';

export interface UseDisasmReturn {
  disasmResult: DisasmInstruction[];
  runDisasm: () => Promise<void>;
}

export const useDisasm = (
  disasmArch: DisasmArch,
  memoryData: Uint8Array | null,
  memoryBaseAddr: number,
  addLog: (level: string, message: string) => void
): UseDisasmReturn => {
  const { t } = useTranslation();
  const [disasmResult, setDisasmResult] = useState<DisasmInstruction[]>([]);

  const runDisasm = useCallback(async () => {
    if (!memoryData) {
      setDisasmResult([]);
      return;
    }

    if (disasmArch === 'off') {
      setDisasmResult([]);
      return;
    }

    try {
      const result = (await invokeCommand('disassemble', {
        data: Array.from(memoryData),
        address: memoryBaseAddr,
        arch: disasmArch,
      })) as DisasmResult;

      if (result.error) {
        addLog(
          'WARN',
          t('efelGui.logMessages.disasmWarning', '反汇编失败：{error}', { error: result.error })
        );
      } else {
        setDisasmResult(result.instructions);
      }
    } catch (e) {
      addLog(
        'WARN',
        t('efelGui.logMessages.disasmFailed', '反汇编失败：{error}', { error: String(e) })
      );
    }
  }, [disasmArch, memoryData, memoryBaseAddr, addLog, t]);

  useEffect(() => {
    runDisasm();
  }, [runDisasm]);

  return { disasmResult, runDisasm };
};
