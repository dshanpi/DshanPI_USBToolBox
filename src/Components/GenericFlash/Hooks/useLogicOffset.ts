import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlashMapInfo,
  LogicOffsetConfig,
  getFlashMap,
  extractDtbFromUboot,
  GenericFlashMode,
} from '../../../Library/FDT';
import { OpenixPacker, getDtb, getUboot } from '../../../Library/OpenixIMG';
import { LogEntry } from '../../../FlashManager';
import { formatErrorMessage } from '../../../Utils/Error';

export type StorageType = 'sdmmc' | 'nor' | 'ufs';
export type OffsetSource = 'boot_dtb' | 'uboot_dtb' | 'manual';

export interface UseLogicOffsetResult {
  config: LogicOffsetConfig;
  flashMap: FlashMapInfo | null;
  loading: boolean;
  hasValidOffset: boolean;
  mode: GenericFlashMode;
  setMode: (mode: GenericFlashMode) => void;
  setStorageType: (type: StorageType) => void;
  setManualOffset: (offset: number) => void;
  autoDetect: (packer: OpenixPacker) => Promise<boolean>;
  reset: () => void;
}

const DEFAULT_OFFSET = 40960;
const DEFAULT_NOR_OFFSET = 2106;

const getDefaultOffset = (storageType: StorageType): number => {
  switch (storageType) {
    case 'nor':
      return DEFAULT_NOR_OFFSET;
    case 'ufs':
    default:
      return DEFAULT_OFFSET;
  }
};

const hasOffsetForStorageType = (map: FlashMapInfo | null, storageType: StorageType): boolean => {
  if (!map) return false;
  if (storageType === 'sdmmc' || storageType === 'ufs') {
    return map.sdmmc_map?.logic_offset != null;
  }
  return map.nor_map?.logic_offset != null;
};

const formatFlashMapOffsets = (map: FlashMapInfo | null): string => {
  if (!map) return '';
  const parts: string[] = [];
  if (map.sdmmc_map?.logic_offset != null) {
    parts.push(`SDMMC/eMMC/UFS: ${map.sdmmc_map.logic_offset}`);
  }
  if (map.nor_map?.logic_offset != null) {
    parts.push(`NOR: ${map.nor_map.logic_offset}`);
  }
  return parts.length > 0 ? parts.join(', ') : '';
};

export function useLogicOffset(
  addLog: (level: LogEntry['level'], message: string) => void
): UseLogicOffsetResult {
  const { t } = useTranslation();
  const [mode, setMode] = useState<GenericFlashMode>('logic_offset');
  const [config, setConfig] = useState<LogicOffsetConfig>({
    source: 'manual',
    storageType: 'sdmmc',
    logicOffset: DEFAULT_OFFSET,
  });
  const [flashMap, setFlashMap] = useState<FlashMapInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const lastPackerRef = useRef<OpenixPacker | null>(null);

  const updateLogicOffset = useCallback((map: FlashMapInfo | null, storageType: StorageType) => {
    if (!map) {
      setConfig((prev) => ({
        ...prev,
        logicOffset: getDefaultOffset(storageType),
        source: 'manual',
      }));
      return;
    }

    if ((storageType === 'sdmmc' || storageType === 'ufs') && map.sdmmc_map?.logic_offset != null) {
      setConfig((prev) => ({
        ...prev,
        logicOffset: map.sdmmc_map!.logic_offset!,
        source: prev.source === 'manual' ? 'boot_dtb' : prev.source,
      }));
    } else if (storageType === 'nor' && map.nor_map?.logic_offset != null) {
      setConfig((prev) => ({
        ...prev,
        logicOffset: map.nor_map!.logic_offset!,
        source: prev.source === 'manual' ? 'boot_dtb' : prev.source,
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        logicOffset: getDefaultOffset(storageType),
        source: 'manual',
      }));
    }
  }, []);

  const setStorageType = useCallback(
    (type: StorageType) => {
      setConfig((prev) => ({ ...prev, storageType: type }));
      updateLogicOffset(flashMap, type);
    },
    [flashMap, updateLogicOffset]
  );

  const setManualOffset = useCallback((offset: number) => {
    setConfig((prev) => ({
      ...prev,
      source: 'manual',
      logicOffset: offset,
    }));
  }, []);

  const autoDetect = useCallback(
    async (packer: OpenixPacker): Promise<boolean> => {
      if (lastPackerRef.current === packer && flashMap) {
        return true;
      }

      setLoading(true);
      lastPackerRef.current = packer;

      try {
        const dtbData = await getDtb(packer);
        if (dtbData) {
          const map = await getFlashMap(dtbData);
          if (map) {
            setFlashMap(map);
            updateLogicOffset(map, config.storageType);
            const offsets = formatFlashMapOffsets(map);
            if (offsets) {
              addLog(
                'success',
                t(
                  'genericFlash.logicOffset.bootDtbSuccessWithOffsets',
                  '从引导固件 DTB 获取 flash_map 成功: {{offsets}}',
                  { offsets }
                )
              );
            } else {
              addLog(
                'warn',
                t(
                  'genericFlash.logicOffset.noOffsetFound',
                  'flash_map 中未找到偏移信息，使用默认值'
                )
              );
            }
            setLoading(false);
            return true;
          }
        }

        const ubootData = await getUboot(packer);
        if (ubootData) {
          const ubootDtbData = extractDtbFromUboot(ubootData);
          if (ubootDtbData) {
            const map = await getFlashMap(ubootDtbData);
            if (map) {
              setFlashMap(map);
              updateLogicOffset(map, config.storageType);
              const offsets = formatFlashMapOffsets(map);
              if (offsets) {
                addLog(
                  'success',
                  t(
                    'genericFlash.logicOffset.ubootDtbSuccessWithOffsets',
                    '从 U-Boot DTB 获取 flash_map 成功: {{offsets}}',
                    { offsets }
                  )
                );
              } else {
                addLog(
                  'warn',
                  t(
                    'genericFlash.logicOffset.noOffsetFound',
                    'flash_map 中未找到偏移信息，使用默认值'
                  )
                );
              }
              setLoading(false);
              return true;
            }
          }
        }

        addLog(
          'warn',
          t('genericFlash.logicOffset.autoDetectFailed', '无法自动检测偏移补偿，使用默认值')
        );
        setLoading(false);
        return false;
      } catch (err) {
        addLog(
          'error',
          t('genericFlash.logicOffset.detectFailed', '检测失败: {{error}}', { error: formatErrorMessage(err) })
        );
        setLoading(false);
        return false;
      }
    },
    [addLog, config.storageType, t, updateLogicOffset, flashMap]
  );

  const reset = useCallback(() => {
    setMode('logic_offset');
    setConfig({
      source: 'manual',
      storageType: 'sdmmc',
      logicOffset: DEFAULT_OFFSET,
    });
    setFlashMap(null);
    lastPackerRef.current = null;
  }, []);

  useEffect(() => {
    updateLogicOffset(flashMap, config.storageType);
  }, [flashMap, config.storageType, updateLogicOffset]);

  const hasValidOffset = hasOffsetForStorageType(flashMap, config.storageType);

  return {
    config,
    flashMap,
    loading,
    hasValidOffset,
    mode,
    setMode,
    setStorageType,
    setManualOffset,
    autoDetect,
    reset,
  };
}
