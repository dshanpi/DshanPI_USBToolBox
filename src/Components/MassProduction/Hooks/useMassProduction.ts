import { useState, useCallback, useEffect } from 'react';
import type { FlashMode, PostFlashAction } from '../../../Domain/flash';
import type { LogLevel } from '../../../FlashManager';
import type { AppSettings } from '../../../Settings/settingsStore';
import { invokeCommand } from '../../../Platform/IPC/Client';
import {
  subscribeMassSlotUpdate,
  subscribeMassLog,
  subscribeMassState,
} from '../../../Platform/IPC/Events';
import type { DeviceSlot, FlashStats } from '../Types';
import { MAX_SLOTS, createEmptySlots } from '../Types';

interface UseMassProductionOptions {
  addLog: (level: LogLevel, message: string, slotId?: number) => void;
  settings: AppSettings | null;
  onSettingsChange: (updates: Partial<AppSettings>) => void;
}

export function useMassProduction({
  addLog,
  settings,
  onSettingsChange,
}: UseMassProductionOptions) {
  const [slots, setSlots] = useState<DeviceSlot[]>(createEmptySlots());
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<FlashStats>({
    total: 0,
    success: 0,
    failed: 0,
    inProgress: 0,
  });
  const [postFlashAction, setPostFlashActionState] = useState<PostFlashAction>(
    settings?.postFlashAction ?? 'none'
  );
  const [flashMode, setFlashModeState] = useState<FlashMode>(
    settings?.defaultFlashMode ?? 'full_erase'
  );

  useEffect(() => {
    if (settings) {
      setFlashModeState(settings.defaultFlashMode);
      setPostFlashActionState(settings.postFlashAction);
    }
  }, [settings]);

  const setFlashMode = useCallback(
    (mode: FlashMode) => {
      setFlashModeState(mode);
      onSettingsChange({ defaultFlashMode: mode });
    },
    [onSettingsChange]
  );

  const setPostFlashAction = useCallback(
    (action: PostFlashAction) => {
      setPostFlashActionState(action);
      onSettingsChange({ postFlashAction: action });
    },
    [onSettingsChange]
  );

  // Subscribe to mass production events from Rust
  useEffect(() => {
    const unsubs: Promise<() => void>[] = [];

    unsubs.push(
      subscribeMassSlotUpdate((payload) => {
        setSlots((prev) => {
          const next = [...prev];
          const idx = next.findIndex((s) => s.id === payload.slotId);
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              status: payload.status,
              progress: payload.progress,
              stage: payload.stage,
              speed: payload.speed,
              error: payload.error,
              bus: payload.bus,
              port: payload.port,
              startTime: payload.startTime,
              endTime: payload.endTime,
            };
          }
          return next;
        });
      })
    );

    unsubs.push(
      subscribeMassLog((payload) => {
        addLog(
          payload.level as LogLevel,
          payload.slotId != null ? `[#${payload.slotId + 1}] ${payload.message}` : payload.message,
          payload.slotId ?? undefined
        );
      })
    );

    unsubs.push(
      subscribeMassState((payload) => {
        setIsRunning(payload.state === 'running');
        setStats({
          total: payload.total,
          success: payload.success,
          failed: payload.failed,
          inProgress: payload.inProgress,
        });
      })
    );

    return () => {
      unsubs.forEach((p) => p.then((fn) => fn()));
    };
  }, [addLog]);

  const resetLocalState = useCallback(() => {
    setSlots(createEmptySlots());
    setIsRunning(false);
    setStats({
      total: 0,
      success: 0,
      failed: 0,
      inProgress: 0,
    });
  }, []);

  const start = useCallback(
    async (imagePath: string) => {
      await invokeCommand('mass_stop');
      resetLocalState();
      await invokeCommand('mass_start', {
        imagePath,
        options: {
          mode: flashMode,
          verifyDownload: false,
          postFlashAction,
        },
        maxSlots: MAX_SLOTS,
      });
      setIsRunning(true);
    },
    [flashMode, postFlashAction, resetLocalState]
  );

  const stop = useCallback(async () => {
    await invokeCommand('mass_stop');
    resetLocalState();
  }, [resetLocalState]);

  return {
    slots,
    isRunning,
    stats,
    flashMode,
    setFlashMode,
    postFlashAction,
    setPostFlashAction,
    start,
    stop,
  };
}
