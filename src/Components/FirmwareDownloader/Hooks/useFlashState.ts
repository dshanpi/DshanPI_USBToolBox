import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { flashManager } from '../../../FlashManager';
import { FlashProgress, LogEntry, FlashDevice, FlashOptions } from '../../../FlashManager';
import type { FlashMode, PostFlashAction } from '../../../Domain/flash';
import { hotPlugService } from '../../../Services';
import { AppSettings, saveSettings } from '../../../Settings/settingsStore';
import { PopupType } from '../../../CoreUI';

export function useFlashState(
  addLog: (level: LogEntry['level'], message: string) => void,
  selectedDevice: FlashDevice | null,
  imagePath: string | null,
  imageInfo: { header: { image_size: number } } | null,
  isDeviceReady: (device: FlashDevice | null) => boolean,
  settings: AppSettings | null,
  showPopup: (type: PopupType, title: string, message: string, onConfirm?: () => void) => void,
  releaseImage: () => Promise<void>,
  reloadImage: () => Promise<boolean>
) {
  const { t } = useTranslation();
  const activeTaskIdRef = useRef<number | null>(null);
  const [flashMode, setFlashMode] = useState<FlashMode>(settings?.defaultFlashMode ?? 'keep_data');
  const [selectedPartitions, setSelectedPartitions] = useState<string[]>([]);
  const [verifyDownload, setVerifyDownload] = useState(settings?.verifyDownload ?? true);
  const [postFlashAction, setPostFlashAction] = useState<PostFlashAction>(
    settings?.postFlashAction ?? 'reboot'
  );
  const [autoFlashOnConnect, setAutoFlashOnConnectState] = useState<boolean>(
    settings?.autoFlashOnConnect ?? false
  );
  const [isFlashing, setIsFlashing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [progress, setProgress] = useState<FlashProgress | null>(null);

  useEffect(() => {
    if (settings) {
      setFlashMode(settings.defaultFlashMode);
      setVerifyDownload(settings.verifyDownload);
      setPostFlashAction(settings.postFlashAction);
      setAutoFlashOnConnectState(settings.autoFlashOnConnect);
    }
  }, [settings]);

  useEffect(() => {
    if (!selectedDevice && activeTaskIdRef.current === null) {
      activeTaskIdRef.current = null;
      setProgress(null);
      setIsFlashing(false);
      setIsCancelling(false);
    }
  }, [selectedDevice]);

  const applyTaskCompletion = useCallback(
    (taskId: number, success: boolean) => {
      if (taskId !== activeTaskIdRef.current) return;
      activeTaskIdRef.current = null;
      setIsFlashing(false);
      setIsCancelling(false);
      hotPlugService.resume();
      if (success) {
        setProgress((current) =>
          current ? { ...current, percent: 100, stage: t('flashManager.flashComplete') } : null
        );
      } else {
        setProgress(null);
      }
    },
    [t]
  );

  useEffect(() => {
    const unsubProgress = flashManager.onProgress((payload) => {
      if (payload.taskId !== activeTaskIdRef.current) return;
      setProgress(payload);
    });

    const unsubLog = flashManager.onLog((log) => {
      if (log.taskId !== undefined && log.taskId !== activeTaskIdRef.current) return;
      addLog(log.level, log.message);
    });

    const unsubComplete = flashManager.onComplete(({ taskId, success }) => {
      applyTaskCompletion(taskId, success);
    });

    const unsubShowPopup = flashManager.onShowPopup((taskId, type, title, message) => {
      if (taskId !== activeTaskIdRef.current) return;
      showPopup(type, title, message);
    });

    const unsubShowConfirm = flashManager.onShowConfirm((taskId, title, message) => {
      if (taskId !== activeTaskIdRef.current) {
        return Promise.resolve(false);
      }
      return new Promise<boolean>((resolve) => {
        showPopup('confirm', title, message, () => {
          resolve(true);
        });
        window.__confirmCancelHandler = () => {
          resolve(false);
        };
      });
    });

    return () => {
      unsubProgress();
      unsubLog();
      unsubComplete();
      unsubShowPopup();
      unsubShowConfirm();
    };
  }, [addLog, applyTaskCompletion, showPopup, t]);

  const handleStartFlash = useCallback(async () => {
    if (!selectedDevice) {
      addLog('error', t('flashManager.errors.selectDeviceFirst'));
      return;
    }

    if (!imagePath || !imageInfo) {
      addLog('error', t('flashManager.errors.selectFirmwareFirst'));
      return;
    }

    if (!isDeviceReady(selectedDevice)) {
      addLog('error', t('flashManager.errors.deviceNotReady'));
      return;
    }

    await releaseImage();

    const reloadSuccess = await reloadImage();
    if (!reloadSuccess) {
      addLog('error', t('flashManager.errors.reloadFirmwareFailed', 'Reload firmware failed'));
      return;
    }

    setIsFlashing(true);
    setIsCancelling(false);
    setProgress({ percent: 0, stage: t('flashManager.preparingFlash') });
    hotPlugService.pause();

    const options: FlashOptions = {
      mode: flashMode,
      partitions: flashMode === 'partition' ? selectedPartitions : undefined,
      verifyDownload,
      postFlashAction,
    };

    try {
      const taskId = await flashManager.start(selectedDevice, imagePath, options);
      activeTaskIdRef.current = taskId;
      const immediateResult = flashManager.consumeTaskResult(taskId);
      if (immediateResult) {
        applyTaskCompletion(taskId, immediateResult.success);
      }
    } catch {
      activeTaskIdRef.current = null;
      setIsFlashing(false);
      setIsCancelling(false);
      hotPlugService.resume();
    }
  }, [
    selectedDevice,
    imagePath,
    imageInfo,
    flashMode,
    selectedPartitions,
    verifyDownload,
    postFlashAction,
    addLog,
    isDeviceReady,
    t,
    releaseImage,
    reloadImage,
    applyTaskCompletion,
  ]);

  const handleCancelFlash = useCallback(() => {
    if (activeTaskIdRef.current === null) return;
    setIsCancelling(true);
    flashManager.cancel(activeTaskIdRef.current);
  }, []);

  const handlePartitionToggle = useCallback(
    (partitionName: string) => {
      const isSelected = selectedPartitions.includes(partitionName);
      if (isSelected) {
        addLog('info', t('flashManager.partitionDeselected', { name: partitionName }));
        setSelectedPartitions((prev) => prev.filter((p) => p !== partitionName));
      } else {
        addLog('info', t('flashManager.partitionSelected', { name: partitionName }));
        setSelectedPartitions((prev) => [...prev, partitionName]);
      }
    },
    [selectedPartitions, addLog, t]
  );

  const setAutoFlashOnConnect = useCallback(
    async (value: boolean) => {
      setAutoFlashOnConnectState(value);
      if (settings) {
        await saveSettings({ ...settings, autoFlashOnConnect: value });
      }
    },
    [settings]
  );

  return {
    flashMode,
    setFlashMode,
    selectedPartitions,
    setSelectedPartitions,
    verifyDownload,
    setVerifyDownload,
    postFlashAction,
    setPostFlashAction,
    autoFlashOnConnect,
    setAutoFlashOnConnect,
    isFlashing,
    setIsFlashing,
    isCancelling,
    progress,
    setProgress,
    handleStartFlash,
    handleCancelFlash,
    handlePartitionToggle,
  };
}
