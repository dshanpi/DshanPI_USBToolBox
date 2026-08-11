import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { OpenixPacker, ImageInfo, hasImageData, getMbr } from '../../../Library/OpenixIMG';
import { LogEntry } from '../../../FlashManager';
import { isValidMbr, MbrBuilder } from '../../../FlashConfig';
import { AppSettings, saveSettings } from '../../../Settings/settingsStore';
import { formatErrorMessage } from '../../../Utils/Error';

export function useBootImageLoader(
  addLog: (level: LogEntry['level'], message: string) => void,
  settings: AppSettings | null
) {
  const { t } = useTranslation();
  const [bootImagePath, setBootImagePath] = useState<string | null>(null);
  const [bootImageInfo, setBootImageInfo] = useState<ImageInfo | null>(null);
  const [mbrCopy, setMbrCopy] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const packer = useRef(new OpenixPacker());

  useEffect(() => {
    if (settings?.rememberLastImage && settings.lastImagePath) {
      loadBootImage(settings.lastImagePath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.rememberLastImage, settings?.lastImagePath]);

  const loadBootImage = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        setLoading(true);
        setBootImageInfo(null);
        setMbrCopy(1);

        const success = await packer.current.loadImageFromPath(path);

        if (!success) {
          if (packer.current.isEncryptedImage()) {
            addLog('error', t('imageLoader.encrypted', '镜像已加密, 不支持'));
          } else {
            const lastError = packer.current.getLastError();
            addLog(
              'error',
              t('imageLoader.loadFailed', '加载镜像失败') + (lastError ? `: ${lastError}` : '')
            );
          }
          setLoading(false);
          return false;
        }

        const info = packer.current.getImageInfo();
        setBootImageInfo(info);
        setBootImagePath(path);

        if (settings?.rememberLastImage && settings.lastImagePath !== path) {
          saveSettings({ ...settings, lastImagePath: path });
        }

        const hasFes = await hasImageData(packer.current, 'fes');
        if (!hasFes) {
          addLog('warn', t('flashManager.felHandler.fesNotFound', '未找到 FES 程序'));
        } else {
          addLog('success', t('genericFlash.bootImage.hasFes', '已找到 FES 程序'));
        }

        const mbrData = await getMbr(packer.current);
        if (mbrData && (await isValidMbr(mbrData))) {
          const mbrBuilder = await MbrBuilder.fromBuffer(mbrData);
          const copyCount = (await mbrBuilder.getMbrInfo()).copy;
          setMbrCopy(copyCount);
          addLog(
            'info',
            t('genericFlash.bootImage.mbrCopy', 'MBR 副本数: {{count}}', { count: copyCount })
          );
        }

        addLog('success', t('genericFlash.bootImage.loaded', '已加载引导固件: {{path}}', { path }));
        setLoading(false);
        return true;
      } catch (err) {
        addLog('error', t('imageLoader.fileLoadFailed', '文件加载失败: {{error}}', { error: formatErrorMessage(err) }));
        setLoading(false);
        return false;
      }
    },
    [addLog, t, settings]
  );

  const handleOpenBootFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
      });

      if (!selected) {
        return;
      }

      const path = selected as string;
      await loadBootImage(path);
    } catch (err) {
      addLog('error', t('imageLoader.openFileFailed', '打开文件失败: {{error}}', { error: formatErrorMessage(err) }));
    }
  }, [addLog, loadBootImage, t]);

  const getPacker = useCallback(() => packer.current, []);

  const releaseImage = useCallback(async () => {
    if (packer.current) {
      await packer.current.freeImage();
    }
  }, []);

  return {
    bootImagePath,
    bootImageInfo,
    mbrCopy,
    loading,
    packer,
    handleOpenBootFile,
    loadBootImage,
    getPacker,
    releaseImage,
  };
}
