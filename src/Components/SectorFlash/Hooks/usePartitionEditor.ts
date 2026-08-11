import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MbrInfo, PartitionInfo, MbrBuilder } from '../../../FlashConfig';
import { LogEntry } from '../../../FlashManager';
import { formatErrorForLog } from '../../../FlashManager';

export interface PartitionEditorState {
  mbrInfo: MbrInfo | null;
  mbrModified: boolean;
}

export interface PartitionEditorActions {
  handleAddPartition: (partition: PartitionInfo, beforeIndex?: number) => Promise<void>;
  handleUpdatePartition: (index: number, partition: PartitionInfo) => Promise<void>;
  handleDeletePartition: (index: number) => Promise<void>;
  handleMovePartition: (fromIndex: number, toIndex: number) => Promise<void>;
  handleClearAllPartitions: () => Promise<void>;
  resetMbrModified: () => void;
}

export interface UsePartitionEditorProps {
  mbrBuilder: MbrBuilder | null;
  addLog: (level: LogEntry['level'], message: string) => void;
}

export function usePartitionEditor({
  mbrBuilder,
  addLog,
}: UsePartitionEditorProps): PartitionEditorState & PartitionEditorActions {
  const { t } = useTranslation();
  const [mbrInfo, setMbrInfo] = useState<MbrInfo | null>(null);
  const [mbrModified, setMbrModified] = useState(false);
  const [mbrVersion, setMbrVersion] = useState(0);
  const lastMbrBuilderRef = useRef<MbrBuilder | null>(null);

  useEffect(() => {
    if (mbrBuilder !== lastMbrBuilderRef.current) {
      lastMbrBuilderRef.current = mbrBuilder;
      setMbrModified(false);
      setMbrVersion((v) => v + 1);
    }
  }, [mbrBuilder]);

  useEffect(() => {
    let active = true;
    if (!mbrBuilder) {
      setMbrInfo(null);
      return;
    }
    mbrBuilder.getMbrInfo().then((info) => {
      if (active) {
        setMbrInfo(info);
      }
    });
    return () => {
      active = false;
    };
  }, [mbrBuilder, mbrVersion]);

  const resetMbrModified = useCallback(() => {
    setMbrModified(false);
  }, []);

  const handleAddPartition = useCallback(
    async (partition: PartitionInfo, beforeIndex?: number) => {
      if (!mbrBuilder) return;

      try {
        if (beforeIndex !== undefined && beforeIndex >= 0) {
          await mbrBuilder.addPartitionAt(beforeIndex, partition);
        } else {
          await mbrBuilder.addPartition(partition);
        }
        setMbrModified(true);
        setMbrVersion((v) => v + 1);
        addLog('info', t('sectorFlash.partitionAdded', { name: partition.name }));
      } catch (err) {
        addLog('error', t('sectorFlash.addPartitionFailed', { error: formatErrorForLog(err) }));
      }
    },
    [mbrBuilder, addLog, t]
  );

  const handleUpdatePartition = useCallback(
    async (index: number, partition: PartitionInfo) => {
      if (!mbrBuilder) return;

      try {
        const success = await mbrBuilder.updatePartition(index, partition);
        if (success) {
          setMbrModified(true);
          setMbrVersion((v) => v + 1);
          addLog('info', t('sectorFlash.partitionUpdated', { name: partition.name }));
        } else {
          addLog('error', t('sectorFlash.updatePartitionFailed'));
        }
      } catch (err) {
        addLog('error', t('sectorFlash.updatePartitionFailed', { error: formatErrorForLog(err) }));
      }
    },
    [mbrBuilder, addLog, t]
  );

  const handleDeletePartition = useCallback(
    async (index: number) => {
      if (!mbrBuilder) return;

      try {
        const partitionName = (await mbrBuilder.getPartitionInfo(index))?.name || `#${index}`;
        const success = await mbrBuilder.removePartition(index);
        if (success) {
          setMbrModified(true);
          setMbrVersion((v) => v + 1);
          addLog('info', t('sectorFlash.partitionDeleted', { name: partitionName }));
        } else {
          addLog('error', t('sectorFlash.deletePartitionFailed'));
        }
      } catch (err) {
        addLog('error', t('sectorFlash.deletePartitionFailed', { error: formatErrorForLog(err) }));
      }
    },
    [mbrBuilder, addLog, t]
  );

  const handleMovePartition = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!mbrBuilder) return;

      try {
        const success = await mbrBuilder.movePartition(fromIndex, toIndex);
        if (success) {
          setMbrModified(true);
          setMbrVersion((v) => v + 1);
          addLog('info', t('sectorFlash.partitionMoved', { from: fromIndex, to: toIndex }));
        } else {
          addLog('error', t('sectorFlash.movePartitionFailed'));
        }
      } catch (err) {
        addLog('error', t('sectorFlash.movePartitionFailed', { error: formatErrorForLog(err) }));
      }
    },
    [mbrBuilder, addLog, t]
  );

  const handleClearAllPartitions = useCallback(async () => {
    if (!mbrBuilder) return;

    await mbrBuilder.clearPartitions();
    setMbrModified(true);
    setMbrVersion((v) => v + 1);
    addLog('info', t('sectorFlash.allPartitionsCleared'));
  }, [mbrBuilder, addLog, t]);

  return {
    mbrInfo,
    mbrModified,
    handleAddPartition,
    handleUpdatePartition,
    handleDeletePartition,
    handleMovePartition,
    handleClearAllPartitions,
    resetMbrModified,
  };
}
