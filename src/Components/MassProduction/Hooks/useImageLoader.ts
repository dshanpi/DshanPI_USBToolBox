import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import {
  OpenixPacker,
  ImageInfo,
  Partition,
  getPartitionData,
  getSysConfig,
} from '../../../Library/OpenixIMG';
import { OpenixPartition } from '../../../Library/OpenixIMG';
import { SunxiSysConfigParser, SysConfig } from '../../../FlashConfig';
import { LogEntry } from '../../../FlashManager';
import { AppSettings, saveSettings } from '../../../Settings/settingsStore';
import { formatErrorMessage } from '../../../Utils/Error';

export function useImageLoader(
  addLog: (level: LogEntry['level'], message: string) => void,
  settings: AppSettings | null
) {
  const { t } = useTranslation();
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [loading, setLoading] = useState(false);
  const [sysConfig, setSysConfig] = useState<SysConfig | null>(null);
  const packer = useRef(new OpenixPacker());
  const hasAutoLoaded = useRef(false);

  const loadImage = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        setLoading(true);
        setSysConfig(null);
        setImageInfo(null);
        setPartitions([]);

        const success = await packer.current.loadImageFromPath(path);

        if (!success) {
          if (packer.current.isEncryptedImage()) {
            addLog('error', t('imageLoader.encrypted', '镜像文件已加密，不支持解密'));
          } else {
            const lastError = packer.current.getLastError();
            addLog(
              'error',
              t('imageLoader.loadFailed', '无法加载镜像文件') + (lastError ? `: ${lastError}` : '')
            );
          }
          setLoading(false);
          return false;
        }

        const info = packer.current.getImageInfo();
        setImageInfo(info);

        const partitionData = await getPartitionData(packer.current);
        if (partitionData) {
          const parser = new OpenixPartition();
          await parser.parseFromData(partitionData);
          setPartitions(parser.getPartitions());
        } else {
          setPartitions([]);
        }

        const sysConfigData = await getSysConfig(packer.current);
        if (sysConfigData) {
          try {
            const config = await SunxiSysConfigParser.parse(sysConfigData);
            setSysConfig(config);
          } catch (err) {
            addLog('error', t('imageLoader.parseSysConfigFailed', { error: formatErrorMessage(err) }));
          }
        }

        setImagePath(path);
        addLog('success', t('imageLoader.loaded', { path }));
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

  // Auto-load last image from settings
  useEffect(() => {
    if (settings?.rememberLastImage && settings.lastImagePath && !hasAutoLoaded.current) {
      hasAutoLoaded.current = true;
      const path = settings.lastImagePath;
      exists(path).then((fileExists) => {
        if (fileExists) {
          loadImage(path).then((success) => {
            if (!success) {
              saveSettings({ ...settings, lastImagePath: null });
            }
          });
        } else {
          saveSettings({ ...settings, lastImagePath: null });
        }
      });
    } else if (settings && !settings.rememberLastImage) {
      hasAutoLoaded.current = true;
    }
  }, [settings, loadImage]);

  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Image Files', extensions: ['img', 'bin'] }],
      });

      if (!selected) return;

      const path = selected as string;
      const success = await loadImage(path);

      if (success && settings?.rememberLastImage) {
        await saveSettings({ ...settings, lastImagePath: path });
      }
    } catch (err) {
      addLog('error', t('imageLoader.openFileFailed', { error: formatErrorMessage(err) }));
    }
  }, [addLog, loadImage, settings, t]);

  return {
    imagePath,
    imageInfo,
    partitions,
    loading,
    sysConfig,
    packer,
    handleOpenFile,
  };
}
