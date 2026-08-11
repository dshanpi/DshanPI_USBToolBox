import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashDevice, LogEntry, FlashProgress, flashManager } from '../../../FlashManager';
import { PopupType } from '../../../CoreUI';
import { PartitionInfo, MbrBuilder } from '../../../FlashConfig';
import { LogicOffsetConfig } from '../../../Library/FDT';
import { hotPlugService } from '../../../Services';

export interface LogicOffsetModeFlashParams {
  enabled: boolean;
  addLog: (level: LogEntry['level'], message: string) => void;
  selectedDevice: FlashDevice | null;
  bootImagePath: string | null;
  bootPacker: React.RefObject<unknown>;
  genericImagePath: string | null;
  genericImageSize: number | null;
  logicOffsetConfig: LogicOffsetConfig;
  mbrCopy: number;
  isDeviceReady: (device: FlashDevice | null) => boolean;
  showPopup: (type: PopupType, title: string, message: string) => void;
}

export function useLogicOffsetModeFlash(params: LogicOffsetModeFlashParams) {
  const {
    enabled,
    addLog,
    selectedDevice,
    bootImagePath,
    genericImagePath,
    genericImageSize,
    logicOffsetConfig,
    mbrCopy,
    isDeviceReady,
    showPopup,
  } = params;

  const { t } = useTranslation();
  const activeTaskIdRef = useRef<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [progress, setProgress] = useState<FlashProgress | null>(null);

  const applyTaskCompletion = useCallback(
    (taskId: number, success: boolean) => {
      if (taskId !== activeTaskIdRef.current) return;
      activeTaskIdRef.current = null;
      setIsFlashing(false);
      setIsCancelling(false);
      hotPlugService.resume();
      if (success) {
        setProgress({ taskId, percent: 100, stage: t('flashManager.flashComplete') });
        addLog('success', t('genericFlash.flashComplete'));
      } else {
        setProgress(null);
      }
    },
    [addLog, t]
  );

  useEffect(() => {
    if (!enabled) return;
    if (!selectedDevice && activeTaskIdRef.current === null) {
      activeTaskIdRef.current = null;
      setProgress(null);
      setIsFlashing(false);
      setIsCancelling(false);
    }
  }, [enabled, selectedDevice]);

  useEffect(() => {
    if (!enabled) {
      activeTaskIdRef.current = null;
      setIsFlashing(false);
      setIsCancelling(false);
      setProgress(null);
      return;
    }

    const unsubProgress = flashManager.onProgress((value) => {
      if (value.taskId !== activeTaskIdRef.current) return;
      setProgress(value);
    });
    const unsubLog = flashManager.onLog((log) => {
      if (log.taskId !== undefined && log.taskId !== activeTaskIdRef.current) return;
      addLog(log.level, log.message);
    });
    const unsubComplete = flashManager.onComplete(({ taskId, success }) => {
      applyTaskCompletion(taskId, success);
    });
    const unsubPopup = flashManager.onShowPopup((taskId, type, title, message) => {
      if (taskId !== activeTaskIdRef.current) return;
      showPopup(type, title, message);
    });

    return () => {
      unsubProgress();
      unsubLog();
      unsubComplete();
      unsubPopup();
    };
  }, [enabled, addLog, applyTaskCompletion, showPopup, t]);

  const handleStartFlash = useCallback(async () => {
    if (!selectedDevice) {
      addLog('error', t('flashManager.errors.selectDeviceFirst'));
      return;
    }
    if (!bootImagePath) {
      addLog('error', t('genericFlash.errors.selectBootImage'));
      return;
    }
    if (!genericImagePath) {
      addLog('error', t('genericFlash.errors.selectGenericImage'));
      return;
    }
    if (!genericImageSize) {
      addLog('error', t('genericFlash.errors.genericImageNotLoaded'));
      return;
    }
    if (!isDeviceReady(selectedDevice)) {
      addLog('error', t('flashManager.errors.deviceNotReady'));
      return;
    }

    const imageSizeSectors = Math.ceil(genericImageSize / 512);
    const startSector = BigInt(0x100000000 - logicOffsetConfig.logicOffset);
    const mbrBuilder = await MbrBuilder.create();
    await mbrBuilder.setCopy(mbrCopy);

    const rawPartition: PartitionInfo = {
      name: 'raw',
      classname: 'DISK',
      address: startSector,
      length: BigInt(imageSizeSectors),
      user_type: 0,
      keydata: 0,
      readonly: false,
    };

    await mbrBuilder.addPartitionRaw(rawPartition);
    const mbrData = await mbrBuilder.serializeWithCopies();

    setIsFlashing(true);
    setIsCancelling(false);
    setProgress({ percent: 0, stage: t('flashManager.preparingFlash') });
    hotPlugService.pause();

    try {
      const taskId = await flashManager.start(selectedDevice, bootImagePath, {
        mode: 'full_erase',
        verifyDownload: false,
        postFlashAction: 'reboot',
        mbrData,
        partitionConfig: [
          {
            name: 'raw',
            size: imageSizeSectors,
            downloadfile: '',
            user_type: 0,
            keydata: false,
            encrypt: false,
            verify: false,
            ro: false,
            customFilePath: genericImagePath,
          },
        ],
      });
      activeTaskIdRef.current = taskId;
      const immediateResult = flashManager.consumeTaskResult(taskId);
      if (immediateResult) {
        applyTaskCompletion(taskId, immediateResult.success);
      }
    } catch (error) {
      if (!isCancelling) {
        addLog('error', t('flashManager.flashFailed', { error: String(error) }));
      }
      activeTaskIdRef.current = null;
      setIsFlashing(false);
      setIsCancelling(false);
      hotPlugService.resume();
    }
  }, [
    selectedDevice,
    bootImagePath,
    genericImagePath,
    genericImageSize,
    logicOffsetConfig,
    mbrCopy,
    isDeviceReady,
    addLog,
    isCancelling,
    t,
    applyTaskCompletion,
  ]);

  const handleCancelFlash = useCallback(() => {
    if (activeTaskIdRef.current === null) return;
    setIsCancelling(true);
    flashManager.cancel(activeTaskIdRef.current);
  }, []);

  return {
    isFlashing,
    isCancelling,
    progress,
    handleStartFlash,
    handleCancelFlash,
  };
}
