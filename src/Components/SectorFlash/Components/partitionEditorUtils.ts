import { stat } from '@tauri-apps/plugin-fs';
import { open, confirm } from '@tauri-apps/plugin-dialog';
import { PartitionInfo, MbrInfo } from '../../../FlashConfig';
import { MBR_MAX_PART_CNT } from '../../../FlashConfig/Constants';
import { LogEntry } from '../../../FlashManager';
import { formatErrorForLog } from '../../../FlashManager';

export type AlignMode = '_64k' | '_4k';

export const ALIGN_SECTORS: Record<AlignMode, number> = {
  _64k: 128,
  _4k: 8,
};

export const getImageFileName = (imagePath: string | null): string => {
  if (!imagePath) return 'firmware';
  const fileName = imagePath.split(/[/\\]/).pop() || 'firmware';
  return fileName.replace(/\.[^.]+$/, '');
};

export const parseSectorCount = (value: string): bigint => {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('0x')) {
    return BigInt(trimmed);
  }
  return BigInt(trimmed || '0');
};

export const alignSectors = (sectors: bigint, align: number): bigint => {
  const alignBig = BigInt(align);
  const remainder = sectors % alignBig;
  if (remainder === BigInt(0)) {
    return sectors;
  }
  return sectors + alignBig - remainder;
};

export const calculateAddresses = (mbrInfo: MbrInfo | null): Map<number, bigint> => {
  if (!mbrInfo) return new Map<number, bigint>();

  const addresses = new Map<number, bigint>();

  for (let i = 0; i < mbrInfo.partCount; i++) {
    const partition = mbrInfo.partitions[i];
    addresses.set(i, partition.address);
  }

  return addresses;
};

export const findUdiskIndex = (mbrInfo: MbrInfo | null): number => {
  if (!mbrInfo) return -1;
  return mbrInfo.partitions.findIndex((p) => p.name.toUpperCase() === 'UDISK');
};

export const calculateNewPartitionAddress = (
  mbrInfo: MbrInfo | null,
  udiskIndex: number
): bigint => {
  if (!mbrInfo) return BigInt(0);

  if (udiskIndex > 0) {
    return mbrInfo.partitions[udiskIndex].address;
  }

  let maxEnd = BigInt(0);
  for (const partition of mbrInfo.partitions) {
    const end = partition.address + partition.length;
    if (end > maxEnd) {
      maxEnd = end;
    }
  }
  return maxEnd;
};

export const canAddPartition = (mbrInfo: MbrInfo | null): boolean => {
  return mbrInfo !== null && mbrInfo.partCount < MBR_MAX_PART_CNT;
};

export interface FileSelectResult {
  filePath: string;
  fileSizeSectors: number;
  alignedSectors: bigint;
}

export const selectAndProcessFile = async (
  alignSize: number,
  addLog: (level: LogEntry['level'], message: string) => void,
  t: (key: string, options?: Record<string, unknown>) => string
): Promise<FileSelectResult | null> => {
  try {
    const selected = await open({
      multiple: false,
    });

    if (!selected) return null;

    const filePath = selected as string;
    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;
    const fileSizeSectors = Math.ceil(fileSize / 512);
    const alignedSectorsValue = alignSectors(BigInt(fileSizeSectors), alignSize);

    addLog(
      'info',
      t('sectorFlash.partitionAutoAligned', {
        path: filePath,
        size: alignedSectorsValue.toString(),
      })
    );

    return {
      filePath,
      fileSizeSectors,
      alignedSectors: alignedSectorsValue,
    };
  } catch (err) {
    addLog('error', formatErrorForLog(err));
    return null;
  }
};

export interface EditFileSelectResult {
  filePath: string;
  newLength?: bigint;
  shouldUpdateLength: boolean;
}

export const selectFileForEdit = async (
  currentLength: number,
  alignSize: number,
  addLog: (level: LogEntry['level'], message: string) => void,
  t: (key: string, options?: Record<string, unknown>) => string
): Promise<EditFileSelectResult | null> => {
  try {
    const selected = await open({
      multiple: false,
    });

    if (!selected) return null;

    const filePath = selected as string;
    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;
    const fileSizeSectors = Math.ceil(fileSize / 512);

    if (fileSizeSectors > currentLength) {
      const newLength = alignSectors(BigInt(fileSizeSectors), alignSize);
      addLog(
        'info',
        t('sectorFlash.partitionAutoExpanded', {
          path: filePath,
          oldSize: currentLength.toString(),
          newSize: newLength.toString(),
        })
      );
      return {
        filePath,
        newLength,
        shouldUpdateLength: true,
      };
    } else if (fileSizeSectors < currentLength) {
      const confirmed = await confirm(
        t('sectorFlash.confirmResizePartition', {
          path: filePath,
          oldSize: currentLength.toString(),
          newSize: fileSizeSectors.toString(),
        }),
        {
          title: t('sectorFlash.partitionEditor.title'),
          kind: 'info',
        }
      );

      if (confirmed) {
        const newLength = alignSectors(BigInt(fileSizeSectors), alignSize);
        return {
          filePath,
          newLength,
          shouldUpdateLength: true,
        };
      } else {
        return {
          filePath,
          shouldUpdateLength: false,
        };
      }
    }

    return {
      filePath,
      shouldUpdateLength: false,
    };
  } catch (err) {
    addLog('error', formatErrorForLog(err));
    return null;
  }
};

export const createPartitionInfo = (
  name: string,
  address: bigint,
  length: bigint,
  originalPartition?: PartitionInfo
): PartitionInfo => {
  return {
    name,
    classname: originalPartition?.classname || 'DISK',
    address,
    length,
    user_type: originalPartition?.user_type || 0,
    keydata: originalPartition?.keydata || 0,
    readonly: originalPartition?.readonly || false,
  };
};

export const confirmDelete = async (
  t: (key: string, options?: Record<string, unknown>) => string
): Promise<boolean> => {
  return await confirm(t('sectorFlash.confirmDelete'), {
    title: t('sectorFlash.flashControl.title'),
    kind: 'warning',
  });
};

export const confirmReload = async (
  mbrModified: boolean,
  t: (key: string, options?: Record<string, unknown>) => string
): Promise<boolean> => {
  if (mbrModified) {
    return await confirm(t('sectorFlash.partitionEditor.confirmReload'), {
      title: t('sectorFlash.partitionEditor.title'),
      kind: 'warning',
    });
  }
  return true;
};

export const confirmClearAll = async (
  mbrInfo: MbrInfo | null,
  t: (key: string, options?: Record<string, unknown>) => string
): Promise<boolean> => {
  if (!mbrInfo || mbrInfo.partCount === 0) return false;

  return await confirm(t('sectorFlash.partitionEditor.confirmClearAll'), {
    title: t('sectorFlash.partitionEditor.title'),
    kind: 'warning',
  });
};
