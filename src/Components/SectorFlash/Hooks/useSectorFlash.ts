import { useState, useCallback, useEffect, useRef } from 'react';
import { exists } from '@tauri-apps/plugin-fs';
import { MbrBuilder } from '../../../FlashConfig';
import { Partition } from '../../../Library/DshanPIIMG';
import { loadSettings, saveSettings, AppSettings } from '../../../Settings';
import { useImageLoader } from './useImageLoader';
import { usePartitionEditor } from './usePartitionEditor';
import { useFlashFirmware } from './useFlashFirmware';
import { useMbrExport } from './useMbrExport';
import { useDeviceScanner, useLogger } from '../../../Hooks';

export type { MbrExportOptions } from './useMbrExport';

interface UseSectorFlashOptions {
  isActive?: boolean;
}

export function useSectorFlash(options: UseSectorFlashOptions = {}) {
  const { isActive = true } = options;
  const { logs, addLog } = useLogger();
  const [mbrBuilder, setMbrBuilderState] = useState<MbrBuilder | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [partitionConfig, setPartitionConfig] = useState<Partition[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const hasAutoLoaded = useRef(false);

  const handleImageLoaded = useCallback(
    (builder: MbrBuilder, path: string, config: Partition[]) => {
      setMbrBuilderState(builder);
      setImagePath(path);
      setPartitionConfig(config);
    },
    []
  );

  const handleFlashComplete = useCallback(() => {}, []);

  const handleUpdatePartitionConfig = useCallback((index: number, config: Partial<Partition>) => {
    setPartitionConfig((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const newConfig = [...prev];
      newConfig[index] = { ...newConfig[index], ...config };
      return newConfig;
    });
  }, []);

  const imageLoader = useImageLoader({
    addLog,
    onImageLoaded: handleImageLoaded,
  });

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (settings?.rememberLastImage && settings.lastImagePath && !hasAutoLoaded.current) {
      hasAutoLoaded.current = true;
      const path = settings.lastImagePath;
      exists(path).then((fileExists) => {
        if (fileExists) {
          imageLoader.loadImage(path).then((success) => {
            if (!success && settings) {
              saveSettings({ ...settings, lastImagePath: null });
            }
          });
        } else if (settings) {
          saveSettings({ ...settings, lastImagePath: null });
        }
      });
    } else if (settings && !settings.rememberLastImage) {
      hasAutoLoaded.current = true;
    }
  }, [settings, imageLoader]);

  const handleOpenFile = useCallback(async () => {
    await imageLoader.handleOpenFile();
    if (imageLoader.imagePath && settings?.rememberLastImage) {
      await saveSettings({ ...settings, lastImagePath: imageLoader.imagePath });
    }
  }, [imageLoader, settings]);

  const handleReloadMbr = useCallback(() => {
    if (imagePath) {
      imageLoader.loadImage(imagePath);
    }
  }, [imagePath, imageLoader]);

  const deviceScanner = useDeviceScanner({
    addLog,
    enableHotPlug: true,
    isActive,
  });

  const partitionEditor = usePartitionEditor({
    mbrBuilder,
    addLog,
  });

  const handleAddPartition = useCallback(
    (
      partition: Parameters<typeof partitionEditor.handleAddPartition>[0],
      customFilePath?: string,
      beforeIndex?: number
    ) => {
      partitionEditor.handleAddPartition(partition, beforeIndex);
      if (customFilePath) {
        const newConfigItem: Partition = {
          name: partition.name,
          size: Number(partition.length),
          downloadfile: '',
          user_type: partition.user_type,
          keydata: false,
          encrypt: false,
          verify: false,
          ro: partition.readonly,
          customFilePath,
        };
        setPartitionConfig((prev) => [...prev, newConfigItem]);
      }
    },
    [partitionEditor]
  );

  const flashFirmware = useFlashFirmware({
    mbrBuilder,
    selectedDevice: deviceScanner.selectedDevice,
    imagePath,
    partitionConfig,
    addLog,
    onFlashComplete: handleFlashComplete,
    releaseImage: imageLoader.releaseImage,
  });

  const mbrExport = useMbrExport({
    mbrBuilder,
    addLog,
  });

  return {
    imagePath: imageLoader.imagePath,
    imageInfo: imageLoader.imageInfo,
    mbrInfo: partitionEditor.mbrInfo,
    mbrBuilder,
    mbrModified: partitionEditor.mbrModified,
    partitionConfig,
    loading: imageLoader.loading,
    isFlashing: flashFirmware.isFlashing,
    progress: flashFirmware.progress,
    logs,
    devices: deviceScanner.devices,
    selectedDevice: deviceScanner.selectedDevice,
    scanning: deviceScanner.scanning,
    mbrExportOptions: mbrExport.mbrExportOptions,
    setMbrExportOptions: mbrExport.setMbrExportOptions,
    handleOpenFile,
    handleScanDevices: deviceScanner.handleScanDevices,
    handleSelectDevice: deviceScanner.handleSelectDevice,
    isDeviceReady: deviceScanner.isDeviceReady,
    getDeviceStatusDisplay: deviceScanner.getDeviceStatusDisplay,
    handleAddPartition,
    handleUpdatePartition: partitionEditor.handleUpdatePartition,
    handleDeletePartition: partitionEditor.handleDeletePartition,
    handleMovePartition: partitionEditor.handleMovePartition,
    handleClearAllPartitions: partitionEditor.handleClearAllPartitions,
    handleUpdatePartitionConfig,
    handleReloadMbr,
    handleFlashFirmware: flashFirmware.handleFlashFirmware,
    handleExportMbr: mbrExport.handleExportMbr,
    addLog,
  };
}
