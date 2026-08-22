import { useMemo } from 'react';
import { FlashDevice, LogEntry } from '../../../FlashManager';
import { PopupType } from '../../../CoreUI';
import { DshanPIPacker } from '../../../Library/DshanPIIMG';
import { LogicOffsetConfig, GenericFlashMode } from '../../../Library/FDT';
import { useCommandModeFlash, CommandModeFlashParams } from './useCommandModeFlash';
import { useLogicOffsetModeFlash, LogicOffsetModeFlashParams } from './useLogicOffsetModeFlash';

export interface UseFlashStateParams {
  addLog: (level: LogEntry['level'], message: string) => void;
  selectedDevice: FlashDevice | null;
  bootImagePath: string | null;
  bootPacker: React.RefObject<DshanPIPacker>;
  genericImagePath: string | null;
  genericImageSize: number | null;
  logicOffsetConfig: LogicOffsetConfig;
  mbrCopy: number;
  mode: GenericFlashMode;
  isDeviceReady: (device: FlashDevice | null) => boolean;
  showPopup: (type: PopupType, title: string, message: string) => void;
}

export function useFlashState(params: UseFlashStateParams) {
  const {
    addLog,
    selectedDevice,
    bootImagePath,
    bootPacker,
    genericImagePath,
    genericImageSize,
    logicOffsetConfig,
    mbrCopy,
    mode,
    isDeviceReady,
    showPopup,
  } = params;

  const commandModeParams: CommandModeFlashParams = useMemo(
    () => ({
      enabled: mode === 'command',
      addLog,
      selectedDevice,
      bootImagePath,
      bootPacker,
      genericImagePath,
      genericImageSize,
      isDeviceReady,
      showPopup,
    }),
    [
      addLog,
      mode,
      selectedDevice,
      bootImagePath,
      bootPacker,
      genericImagePath,
      genericImageSize,
      isDeviceReady,
      showPopup,
    ]
  );

  const logicOffsetModeParams: LogicOffsetModeFlashParams = useMemo(
    () => ({
      enabled: mode !== 'command',
      addLog,
      selectedDevice,
      bootImagePath,
      bootPacker,
      genericImagePath,
      genericImageSize,
      logicOffsetConfig,
      mbrCopy,
      isDeviceReady,
      showPopup,
    }),
    [
      addLog,
      mode,
      selectedDevice,
      bootImagePath,
      bootPacker,
      genericImagePath,
      genericImageSize,
      logicOffsetConfig,
      mbrCopy,
      isDeviceReady,
      showPopup,
    ]
  );

  const commandModeFlash = useCommandModeFlash(commandModeParams);
  const logicOffsetModeFlash = useLogicOffsetModeFlash(logicOffsetModeParams);

  if (mode === 'command') {
    return commandModeFlash;
  } else {
    return logicOffsetModeFlash;
  }
}
