import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getChipName } from '../../../Utils/Chips';
import { adbService, efexService, type EfexContext } from '../../../Services';
import type { FlashDevice } from '../../../FlashManager';

export interface UseDRAMContextReturn {
  context: EfexContext | null;
  isContextReady: boolean;
  contextMode: string | undefined;
  initContext: (device: FlashDevice) => Promise<boolean>;
  setContext: (ctx: EfexContext | null) => void;
  closeContext: () => Promise<void>;
}

function matchesContextDevice(context: EfexContext, device: FlashDevice): boolean {
  return (
    device.mode !== 'adb' &&
    device.deviceId !== undefined &&
    device.bus !== undefined &&
    device.port !== undefined &&
    context.deviceId === device.deviceId &&
    context.bus === device.bus &&
    context.port === device.port
  );
}

export const useDRAMContext = (
  addLog: (level: string, message: string) => void,
  showPopup?: (
    type: 'error' | 'warning' | 'info' | 'success',
    title: string,
    message: string
  ) => void
): UseDRAMContextReturn => {
  const { t } = useTranslation();
  const [context, setContextState] = useState<EfexContext | null>(null);
  const [contextMode, setContextMode] = useState<string | undefined>(undefined);
  const contextRef = useRef<EfexContext | null>(null);
  const initRequestRef = useRef(0);

  const setContext = useCallback((ctx: EfexContext | null) => {
    contextRef.current = ctx;
    setContextState(ctx);
    setContextMode(ctx?.modeStr);
  }, []);

  const closeContext = useCallback(async () => {
    initRequestRef.current += 1;
    const activeContext = contextRef.current;
    if (activeContext) {
      await activeContext.close().catch(() => {});
    }
    setContext(null);
  }, [setContext]);

  const initContext = useCallback(
    async (device: FlashDevice): Promise<boolean> => {
      const requestId = ++initRequestRef.current;

      if (device.mode === 'adb') {
        addLog('INFO', t('dramTunning.logMessages.adbRebootFel', 'Rebooting to FEL mode...'));
        try {
          await adbService.reboot(device.serial || null, 'bootloader');
          addLog('INFO', t('dramTunning.logMessages.waitingFel', 'Waiting for device to enter FEL...'));
          if (initRequestRef.current === requestId) {
            await closeContext();
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          addLog(
            'ERRO',
            t('dramTunning.logMessages.adbRebootFailed', 'Reboot failed: {{error}}', {
              error: error.message,
            })
          );
        }
        return false;
      }

      if (device.deviceId === undefined || device.bus === undefined || device.port === undefined) {
        addLog(
          'ERRO',
          t('dramTunning.logMessages.deviceNotReady', 'Device not ready for context initialization')
        );
        return false;
      }

      try {
        const activeContext = contextRef.current;
        if (activeContext && matchesContextDevice(activeContext, device)) {
          await efexService.refreshMode(activeContext);
          if (initRequestRef.current !== requestId) {
            return false;
          }
          setContextMode(activeContext.modeStr);
          return activeContext.mode === 'fel';
        }

        if (activeContext) {
          await activeContext.close().catch(() => {});
          if (contextRef.current === activeContext) {
            setContext(null);
          }
        }

        const efexDevice = {
          deviceId: device.deviceId,
          chip_version: device.chipVersion ?? 0,
          mode: device.mode,
          mode_str: device.modeStr,
          bus: device.bus,
          port: device.port,
        };

        const ctx = await efexService.createContextAndOpen(efexDevice);
        if (initRequestRef.current !== requestId) {
          await ctx.close().catch(() => {});
          return false;
        }

        setContext(ctx);
        addLog(
          'OKAY',
          t('dramTunning.logMessages.contextInitialized', 'Context initialized: {{name}} [{{mode}}]', {
            name: getChipName(device.chipVersion ?? 0),
            mode: ctx.modeStr,
          })
        );
        return ctx.mode === 'fel';
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setContext(null);
        addLog(
          'ERRO',
          t('dramTunning.logMessages.initFailed', 'Initialization failed: {{error}}', {
            error: error.message,
          })
        );
        if (showPopup) {
          showPopup(
            'error',
            t('dramTunning.popup.initFailedTitle', 'Initialization Failed'),
            t('dramTunning.popup.initFailedMsg', 'Failed to initialize device context: {{error}}', {
              error: error.message,
            })
          );
        }
        return false;
      }
    },
    [addLog, closeContext, setContext, showPopup, t]
  );

  useEffect(() => {
    if (context) {
      setContextMode(context.modeStr);
    } else {
      setContextMode(undefined);
    }
  }, [context]);

  const isContextReady = context !== null && context.mode === 'fel';

  return {
    context,
    isContextReady,
    contextMode,
    initContext,
    setContext,
    closeContext,
  };
};