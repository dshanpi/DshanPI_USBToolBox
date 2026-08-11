import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Partition } from '../../../Library/OpenixIMG';
import type { FlashMode } from '../../../Domain/flash';
import { formatSize } from '../../../Utils';
import { getModeLabel } from '../Utils';
import { FlashProgress } from '../../../FlashManager';
import { usePartitionListSize } from '../Hooks';

interface FlashConfigProps {
  flashMode: FlashMode;
  partitions: Partition[];
  selectedPartitions: string[];
  isFlashing: boolean;
  isLoading: boolean;
  progress: FlashProgress | null;
  onFlashModeChange: (mode: FlashMode) => void;
  onPartitionToggle: (partitionName: string) => void;
}

const FLASH_MODES: FlashMode[] = [
  'bootloader',
  'partition',
  'keep_data',
  'partition_erase',
  'full_erase',
  'erase_only',
];

export const FlashConfig: React.FC<FlashConfigProps> = ({
  flashMode,
  partitions,
  selectedPartitions,
  isFlashing,
  isLoading,
  progress,
  onFlashModeChange,
  onPartitionToggle,
}) => {
  const { t } = useTranslation();
  const downloadablePartitions = partitions.filter((p) => p.downloadfile);
  const sectionRef = useRef<HTMLDivElement>(null);
  const partitionListRef = useRef<HTMLDivElement>(null);
  const { maxHeight } = usePartitionListSize(sectionRef);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  useEffect(() => {
    const checkScrollbar = () => {
      if (partitionListRef.current) {
        const { scrollHeight, clientHeight } = partitionListRef.current;
        setHasScrollbar(scrollHeight > clientHeight);
      }
    };

    checkScrollbar();
    window.addEventListener('resize', checkScrollbar);
    return () => window.removeEventListener('resize', checkScrollbar);
  }, [downloadablePartitions, maxHeight]);

  useEffect(() => {
    if (progress?.currentPartition && partitionListRef.current) {
      const currentIndex = downloadablePartitions.findIndex(
        (p) => p.name === progress.currentPartition
      );
      if (currentIndex !== -1) {
        const partitionItems = partitionListRef.current.querySelectorAll('.fd-partition-item');
        const targetItem = partitionItems[currentIndex] as HTMLElement;
        if (targetItem) {
          targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [progress?.currentPartition, downloadablePartitions]);

  const getPartitionStatus = (partition: Partition): { text: string; className: string } => {
    // 先检查是否已完成
    if (progress?.completedPartitions?.includes(partition.name)) {
      return {
        text: t('firmwareDownloader.flashConfig.completed', '已完成'),
        className: 'fd-partition-size-completed',
      };
    }
    // 再检查当前正在烧录的分区（需要 partitionPercent 有值）
    if (
      isFlashing &&
      progress?.currentPartition === partition.name &&
      progress.partitionPercent !== undefined
    ) {
      return {
        text: `${progress.partitionPercent.toFixed(1)}%`,
        className: 'fd-partition-size-progress',
      };
    }
    return { text: formatSize(partition.size * 512), className: '' };
  };

  const isCurrentPartition = (partition: Partition): boolean => {
    return isFlashing && progress?.currentPartition === partition.name;
  };

  return (
    <div className="fd-section fd-section-config" ref={sectionRef}>
      <h3>{t('firmwareDownloader.flashConfig.title', '烧录配置')}</h3>
      <div className="fd-form-group">
        <label className="fd-func-select-item">
          <select
            className="fd-select"
            value={flashMode}
            onChange={(e) => onFlashModeChange(e.target.value as FlashMode)}
            disabled={isFlashing || isLoading}
          >
            {FLASH_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {getModeLabel(mode)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {flashMode !== 'erase_only' && (
        <div className="fd-partition-selector">
          <h4>
            {flashMode === 'partition'
              ? t('firmwareDownloader.flashConfig.selectPartitions', '选择需要烧录的分区')
              : t('firmwareDownloader.flashConfig.partitionsToFlash', '将要烧录分区')}
          </h4>
          <div
            className="fd-partition-list"
            ref={partitionListRef}
            style={{ maxHeight: `${maxHeight}px`, paddingRight: hasScrollbar ? '8px' : '0' }}
          >
            {downloadablePartitions.length > 0 ? (
              downloadablePartitions.map((partition, index) => (
                <div
                  key={index}
                  className={`fd-partition-item ${flashMode === 'partition' && selectedPartitions.includes(partition.name) ? 'fd-partition-selected' : ''} ${isCurrentPartition(partition) ? 'fd-partition-current' : ''}`}
                  onClick={
                    flashMode === 'partition' && !isFlashing
                      ? () => onPartitionToggle(partition.name)
                      : undefined
                  }
                >
                  <div className="fd-partition-item-readonly">
                    <span className="fd-partition-name">{partition.name}</span>
                    <span
                      className={`fd-partition-size ${getPartitionStatus(partition).className}`}
                    >
                      {getPartitionStatus(partition).text}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="fd-empty-state fd-empty-state-small">
                <span>{t('firmwareDownloader.flashConfig.noFirmware', '未加载固件')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
