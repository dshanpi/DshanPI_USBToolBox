import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { MbrBuilder, isValidMbr } from '../../../FlashConfig';
import { LogEntry } from '../../../FlashManager';
import { DshanPIPacker, ImageInfo, getMbr, Partition } from '../../../Library/DshanPIIMG';
import { formatSize } from '../../../Utils';
import { formatErrorForLog } from '../../../FlashManager';
import { DshanPIPartition } from '../../../Library/DshanPIIMG/DshanPIPartition';

export interface ImageLoaderState {
  imagePath: string | null;
  imageInfo: ImageInfo | null;
  mbrBuilder: MbrBuilder | null;
  loading: boolean;
}

export interface ImageLoaderActions {
  handleOpenFile: () => Promise<void>;
  loadImage: (path: string) => Promise<boolean>;
  releaseImage: () => Promise<void>;
}

export interface UseImageLoaderProps {
  addLog: (level: LogEntry['level'], message: string) => void;
  onImageLoaded: (mbrBuilder: MbrBuilder, imagePath: string, partitionConfig: Partition[]) => void;
}

export function useImageLoader({
  addLog,
  onImageLoaded,
}: UseImageLoaderProps): ImageLoaderState & ImageLoaderActions {
  const { t } = useTranslation();
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [mbrBuilder, setMbrBuilder] = useState<MbrBuilder | null>(null);
  const [loading, setLoading] = useState(false);
  const packer = useRef(new DshanPIPacker());
  const partitionParser = useRef(new DshanPIPartition());

  const loadImage = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        setLoading(true);

        const success = await packer.current.loadImageFromPath(path);

        if (!success) {
          if (packer.current.isEncryptedImage()) {
            addLog('error', t('imageLoader.encrypted'));
          } else {
            const lastError = packer.current.getLastError();
            addLog('error', t('imageLoader.loadFailed') + (lastError ? `: ${lastError}` : ''));
          }
          setLoading(false);
          return false;
        }

        const info = packer.current.getImageInfo();
        setImageInfo(info);

        const mbrData = await getMbr(packer.current);

        if (!mbrData || !(await isValidMbr(mbrData))) {
          addLog('error', t('sectorFlash.mbrNotFound'));
          setLoading(false);
          return false;
        }

        const builder = await MbrBuilder.fromBuffer(mbrData);
        setMbrBuilder(builder);
        setImagePath(path);

        let partitionData = await packer.current.getFileDataByFilename('sys_partition.bin');
        if (!partitionData) {
          partitionData = await packer.current.getFileDataByFilename('sys_partition.fex');
        }
        let partitionConfig: Partition[] = [];
        if (partitionData) {
          await partitionParser.current.parseFromData(partitionData);
          partitionConfig = partitionParser.current.getPartitions();
        }

        addLog(
          'success',
          t('sectorFlash.imageLoaded', {
            path,
            size: formatSize(info?.header?.image_size ?? 0),
          })
        );
        addLog('info', t('sectorFlash.mbrPartitions', { count: await builder.getPartCount() }));

        onImageLoaded(builder, path, partitionConfig);

        setLoading(false);
        return true;
      } catch (err) {
        addLog('error', t('sectorFlash.loadFailed', { error: formatErrorForLog(err) }));
        setLoading(false);
        return false;
      }
    },
    [addLog, onImageLoaded, t]
  );

  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Image Files', extensions: ['img', 'bin'] }],
      });

      if (!selected) {
        return;
      }

      const path = selected as string;
      await loadImage(path);
    } catch (err) {
      addLog('error', t('imageLoader.openFileFailed', { error: formatErrorForLog(err) }));
    }
  }, [addLog, loadImage, t]);

  const releaseImage = useCallback(async () => {
    if (packer.current) {
      await packer.current.freeImage();
    }
  }, []);

  return {
    imagePath,
    imageInfo,
    mbrBuilder,
    loading,
    handleOpenFile,
    loadImage,
    releaseImage,
  };
}
