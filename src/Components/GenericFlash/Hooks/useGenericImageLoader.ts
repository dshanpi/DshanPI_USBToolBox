import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';
import { LogEntry } from '../../../FlashManager';
import { formatSize } from '../../../Utils';
import { parseDiskFromFile, DiskInfo, DiskPartition } from '../../../Library/DiskParser';
import { formatErrorMessage } from '../../../Utils/Error';

export interface GenericImageInfo {
  size: number;
  lastModified?: number;
  diskInfo?: DiskInfo;
}

export function useGenericImageLoader(addLog: (level: LogEntry['level'], message: string) => void) {
  const { t } = useTranslation();
  const [genericImagePath, setGenericImagePath] = useState<string | null>(null);
  const [genericImageInfo, setGenericImageInfo] = useState<GenericImageInfo | null>(null);
  const [partitions, setPartitions] = useState<DiskPartition[]>([]);
  const [diskType, setDiskType] = useState<'gpt' | 'mbr' | 'raw'>('raw');
  const [loading, setLoading] = useState(false);

  const loadGenericImage = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        setLoading(true);
        setGenericImageInfo(null);
        setPartitions([]);
        setDiskType('raw');

        const fileStat = await stat(path);

        const info: GenericImageInfo = {
          size: fileStat.size,
          lastModified: fileStat.mtime?.getTime(),
        };

        addLog('info', t('genericFlash.parsingDisk'));

        const diskInfo = await parseDiskFromFile(path, 512);

        info.diskInfo = diskInfo;
        setDiskType(diskInfo.type);
        setPartitions(diskInfo.partitions);

        if (diskInfo.type === 'gpt') {
          addLog('success', t('genericFlash.gptParsed', { count: diskInfo.partitions.length }));
        } else if (diskInfo.type === 'mbr') {
          addLog('success', t('genericFlash.mbrParsed', { count: diskInfo.partitions.length }));
        } else {
          addLog('info', t('genericFlash.rawImageDetected'));
        }

        setGenericImageInfo(info);
        setGenericImagePath(path);

        addLog(
          'success',
          t('genericFlash.genericImage.loaded', {
            path,
            size: formatSize(info.size),
          })
        );

        setLoading(false);
        return true;
      } catch (err) {
        addLog('error', t('imageLoader.fileLoadFailed', { error: formatErrorMessage(err) }));
        setLoading(false);
        return false;
      }
    },
    [addLog, t]
  );

  const handleOpenGenericFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
      });

      if (!selected) {
        return;
      }

      const path = selected as string;
      await loadGenericImage(path);
    } catch (err) {
      addLog('error', t('imageLoader.openFileFailed', { error: formatErrorMessage(err) }));
    }
  }, [addLog, loadGenericImage, t]);

  return {
    genericImagePath,
    genericImageInfo,
    partitions,
    diskType,
    loading,
    handleOpenGenericFile,
    loadGenericImage,
  };
}
