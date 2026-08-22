import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MbrBuilder } from '../../../FlashConfig';
import { LogEntry, FlashDevice, formatErrorForLog } from '../../../FlashManager';
import { Partition } from '../../../Library/DshanPIIMG';
import { flashManager } from '../../../FlashManager';
import { hotPlugService } from '../../../Services';

export interface FlashProgress {
  percent: number;
  stage: string;
  currentPartition?: string;
  completedPartitions?: string[];
  partitionPercent?: number;
  indeterminate?: boolean;
}

export interface FlashFirmwareState {
  isFlashing: boolean;
  progress: FlashProgress;
}

export interface FlashFirmwareActions {
  handleFlashFirmware: () => Promise<void>;
}

export interface UseFlashFirmwareProps {
  mbrBuilder: MbrBuilder | null;
  selectedDevice: FlashDevice | null;
  imagePath: string | null;
  partitionConfig: Partition[];
  addLog: (level: LogEntry['level'], message: string) => void;
  onFlashComplete: () => void;
  releaseImage: () => Promise<void>;
}

export function useFlashFirmware({
  mbrBuilder,
  selectedDevice,
  imagePath,
  partitionConfig,
  addLog,
  onFlashComplete,
  releaseImage,
}: UseFlashFirmwareProps): FlashFirmwareState & FlashFirmwareActions {
  const { t } = useTranslation();
  const activeTaskIdRef = useRef<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [progress, setProgress] = useState<FlashProgress>({ percent: 0, stage: '' });

  const applyTaskCompletion = useCallback(
    (taskId: number, success: boolean) => {
      if (taskId !== activeTaskIdRef.current) return;
      activeTaskIdRef.current = null;
      setIsFlashing(false);
      hotPlugService.resume();
      if (success) {
        setProgress({ percent: 100, stage: t('sectorFlash.flashComplete') });
        onFlashComplete();
      } else {
        setProgress({ percent: 0, stage: '' });
      }
    },
    [onFlashComplete, t]
  );

  useEffect(() => {
    const unsubProgress = flashManager.onProgress((payload) => {
      if (payload.taskId !== activeTaskIdRef.current) return;
      setProgress({
        percent: Math.round(payload.percent),
        stage: payload.stage,
        currentPartition: payload.currentPartition,
        completedPartitions: payload.completedPartitions,
        partitionPercent: payload.partitionPercent,
        indeterminate: payload.indeterminate,
      });
    });

    const unsubLog = flashManager.onLog((log) => {
      if (log.taskId !== undefined && log.taskId !== activeTaskIdRef.current) return;
      addLog(log.level, log.message);
    });

    const unsubComplete = flashManager.onComplete(({ taskId, success }) => {
      applyTaskCompletion(taskId, success);
    });

    return () => {
      unsubProgress();
      unsubLog();
      unsubComplete();
    };
  }, [addLog, applyTaskCompletion, onFlashComplete, t]);

  const handleFlashFirmware = useCallback(async () => {
    if (!mbrBuilder || !selectedDevice || !imagePath) {
      addLog('error', t('sectorFlash.noDeviceOrImage'));
      return;
    }

    await releaseImage();

    setIsFlashing(true);
    setProgress({ percent: 0, stage: t('sectorFlash.preparingFlash') });
    hotPlugService.pause();

    try {
      const mbrData = await mbrBuilder.serializeWithCopies();
      const taskId = await flashManager.start(selectedDevice, imagePath, {
        mode: 'full_erase',
        verifyDownload: true,
        postFlashAction: 'reboot',
        mbrData,
        partitionConfig,
      });
      activeTaskIdRef.current = taskId;
      const immediateResult = flashManager.consumeTaskResult(taskId);
      if (immediateResult) {
        applyTaskCompletion(taskId, immediateResult.success);
      }
    } catch (err) {
      addLog('error', t('sectorFlash.flashFailed', { error: formatErrorForLog(err) }));
      activeTaskIdRef.current = null;
      setIsFlashing(false);
      hotPlugService.resume();
    }
  }, [
    mbrBuilder,
    selectedDevice,
    imagePath,
    partitionConfig,
    addLog,
    t,
    releaseImage,
    applyTaskCompletion,
  ]);

  return {
    isFlashing,
    progress,
    handleFlashFirmware,
  };
}
