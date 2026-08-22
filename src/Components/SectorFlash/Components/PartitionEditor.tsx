import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrashAlt } from '@fortawesome/free-solid-svg-icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { MbrInfo, PartitionInfo } from '../../../FlashConfig';
import { MBR_MAX_PART_CNT } from '../../../FlashConfig/Constants';
import { formatHex } from '../../../Utils';
import { LogEntry } from '../../../FlashManager';
import { formatErrorForLog } from '../../../FlashManager';
import { Partition } from '../../../Library/DshanPIIMG';
import { SortableRow, PartitionProgress } from './SortableRow';
import {
  AlignMode,
  ALIGN_SECTORS,
  getImageFileName,
  parseSectorCount,
  alignSectors,
  calculateAddresses,
  findUdiskIndex,
  calculateNewPartitionAddress,
  canAddPartition,
  selectFileForEdit,
  selectAndProcessFile,
  createPartitionInfo,
  confirmDelete,
  confirmReload,
  confirmClearAll,
} from './partitionEditorUtils';

interface PartitionEditorProps {
  mbrInfo: MbrInfo | null;
  partitionConfig: Partition[];
  imagePath: string | null;
  disabled: boolean;
  mbrModified: boolean;
  progress?: PartitionProgress;
  onAddPartition: (partition: PartitionInfo, customFilePath?: string, beforeIndex?: number) => void;
  onUpdatePartition: (index: number, partition: PartitionInfo) => void;
  onDeletePartition: (index: number) => void;
  onMovePartition: (fromIndex: number, toIndex: number) => void;
  onClearAllPartitions: () => void;
  onUpdatePartitionConfig: (index: number, config: Partial<Partition>) => void;
  onReloadMbr: () => void;
  addLog: (level: LogEntry['level'], message: string) => void;
}

export const PartitionEditor: React.FC<PartitionEditorProps> = ({
  mbrInfo,
  partitionConfig,
  imagePath,
  disabled,
  mbrModified,
  progress,
  onAddPartition,
  onUpdatePartition,
  onDeletePartition,
  onMovePartition,
  onClearAllPartitions,
  onUpdatePartitionConfig,
  onReloadMbr,
  addLog,
}) => {
  const { t } = useTranslation();
  const [alignMode, setAlignMode] = useState<AlignMode>('_64k');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editData, setEditData] = useState({
    length: '0',
    customFilePath: '',
  });
  const [newPartition, setNewPartition] = useState({
    name: '',
    length: '0',
    customFilePath: '',
  });
  const filePathInputRef = useRef<HTMLInputElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const flashingRowRef = useRef<HTMLTableRowElement | null>(null);
  const prevFlashingPartition = useRef<string | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (editingIndex !== null && filePathInputRef.current) {
      filePathInputRef.current.scrollLeft = filePathInputRef.current.scrollWidth;
    }
  }, [editingIndex, editData.customFilePath]);

  useEffect(() => {
    if (progress?.currentPartition && progress.currentPartition !== prevFlashingPartition.current) {
      prevFlashingPartition.current = progress.currentPartition;

      if (flashingRowRef.current && tableScrollRef.current) {
        const row = flashingRowRef.current;
        const container = tableScrollRef.current;

        const rowRect = row.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        const rowTop = rowRect.top - containerRect.top;
        const rowHeight = rowRect.height;
        const containerHeight = containerRect.height;

        const targetScroll = rowTop - containerHeight / 2 + rowHeight / 2;

        container.scrollTo({
          top: container.scrollTop + targetScroll,
          behavior: 'smooth',
        });
      }
    }
  }, [progress?.currentPartition]);

  const alignSize = ALIGN_SECTORS[alignMode];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = active.id as number;
      const newIndex = over.id as number;
      onMovePartition(oldIndex, newIndex);
    }
  };

  const calculatedAddresses = useMemo(() => calculateAddresses(mbrInfo), [mbrInfo]);

  const udiskIndex = useMemo(() => findUdiskIndex(mbrInfo), [mbrInfo]);

  const newPartitionAddress = useMemo(
    () => calculateNewPartitionAddress(mbrInfo, udiskIndex),
    [mbrInfo, udiskIndex]
  );

  const handleStartEdit = (index: number) => {
    if (!mbrInfo?.partitions[index]) return;
    const partition = mbrInfo.partitions[index];
    const configPartition = partitionConfig.find((p) => p.name === partition.name);
    setEditingIndex(index);
    setEditData({
      length: partition.length.toString(),
      customFilePath: configPartition?.customFilePath || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null || !mbrInfo) return;

    try {
      const originalPartition = mbrInfo.partitions[editingIndex];
      const address = calculatedAddresses.get(editingIndex) || BigInt(0);
      const rawLength = parseSectorCount(editData.length);
      const alignedLength = alignSectors(rawLength, alignSize);

      const partition = createPartitionInfo(
        originalPartition.name,
        address,
        alignedLength,
        originalPartition
      );

      onUpdatePartition(editingIndex, partition);

      const configIndex = partitionConfig.findIndex((p) => p.name === partition.name);
      if (configIndex >= 0) {
        onUpdatePartitionConfig(configIndex, { customFilePath: editData.customFilePath });
      } else if (editData.customFilePath) {
        addLog('warn', t('sectorFlash.partitionConfigNotFound', { name: partition.name }));
      }

      if (editData.customFilePath) {
        addLog(
          'info',
          t('sectorFlash.partitionFileSet', {
            name: partition.name,
            path: editData.customFilePath,
          })
        );
      }

      addLog(
        'info',
        t('sectorFlash.partitionAligned', {
          name: partition.name,
          original: rawLength.toString(),
          aligned: alignedLength.toString(),
        })
      );
      handleCancelEdit();
    } catch (err) {
      addLog('error', formatErrorForLog(err));
    }
  };

  const handleAddPartition = () => {
    if (!newPartition.name) return;

    try {
      const rawLength = parseSectorCount(newPartition.length);
      const alignedLength = alignSectors(rawLength, alignSize);

      const partition = createPartitionInfo(newPartition.name, newPartitionAddress, alignedLength);

      const insertIndex = udiskIndex > 0 ? udiskIndex : undefined;
      onAddPartition(partition, newPartition.customFilePath || undefined, insertIndex);
      addLog(
        'info',
        t('sectorFlash.partitionAligned', {
          name: partition.name,
          original: rawLength.toString(),
          aligned: alignedLength.toString(),
        })
      );
      setNewPartition({
        name: '',
        length: '0',
        customFilePath: '',
      });
    } catch (err) {
      addLog('error', formatErrorForLog(err));
    }
  };

  const handleDelete = async (index: number) => {
    const confirmed = await confirmDelete(t);
    if (confirmed) {
      onDeletePartition(index);
    }
  };

  const handleSelectFile = async (index: number, isEdit: boolean) => {
    if (isEdit) {
      const currentLength = parseInt(editData.length) || 0;
      const result = await selectFileForEdit(currentLength, alignSize, addLog, t);

      if (result) {
        const newLength = result.newLength;
        if (result.shouldUpdateLength && newLength !== undefined) {
          setEditData((prev) => ({
            ...prev,
            customFilePath: result.filePath,
            length: newLength.toString(),
          }));
        } else {
          setEditData((prev) => ({ ...prev, customFilePath: result.filePath }));
        }
        addLog('info', t('sectorFlash.partitionFileSelected', { index, path: result.filePath }));
      }
    }
  };

  const handleSelectFileForNew = async () => {
    const result = await selectAndProcessFile(alignSize, addLog, t);
    if (result) {
      setNewPartition((prev) => ({
        ...prev,
        customFilePath: result.filePath,
        length: result.alignedSectors.toString(),
      }));
    }
  };

  const canAdd = canAddPartition(mbrInfo);
  const imageFileName = getImageFileName(imagePath);

  const handleReloadMbr = async () => {
    const confirmed = await confirmReload(mbrModified, t);
    if (confirmed) {
      onReloadMbr();
    }
  };

  const handleClearAll = async () => {
    const confirmed = await confirmClearAll(mbrInfo, t);
    if (confirmed) {
      onClearAllPartitions();
    }
  };

  if (!mbrInfo) {
    return (
      <div className="sf-partition-container">
        <div className="sf-section-header sf-table-header">
          <span>{t('sectorFlash.partitionEditor.title', { defaultValue: '分区编辑器' })}</span>
        </div>
        <div className="sf-empty-table">
          {t('sectorFlash.partitionEditor.noMbr', {
            defaultValue: '请先加载固件文件以获取 MBR 信息',
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="sf-partition-container">
      <div className="sf-section-header sf-table-header">
        <span>{t('sectorFlash.partitionEditor.title', { defaultValue: '分区编辑器' })}</span>
        <div className="sf-mbr-badges">
          {mbrModified && (
            <span className="sf-mbr-modified-badge">
              {t('sectorFlash.partitionEditor.modified', { defaultValue: '已修改' })}
            </span>
          )}
          <span className="sf-mbr-badge">
            {t('sectorFlash.partitionEditor.partitionCount', { defaultValue: '分区数' })}:{' '}
            {mbrInfo.partCount}/{MBR_MAX_PART_CNT}
          </span>
          <select
            className="sf-align-select"
            value={alignMode}
            onChange={(e) => setAlignMode(e.target.value as AlignMode)}
            disabled={disabled}
          >
            <option value="_64k">
              64K ({ALIGN_SECTORS._64k}{' '}
              {t('sectorFlash.partitionEditor.sectorsAlign', { defaultValue: '扇区对齐' })})
            </option>
            <option value="_4k">
              4K ({ALIGN_SECTORS._4k}{' '}
              {t('sectorFlash.partitionEditor.sectorsAlign', { defaultValue: '扇区对齐' })})
            </option>
          </select>
          <button
            className="sf-btn sf-btn-small sf-btn-secondary"
            onClick={handleReloadMbr}
            disabled={disabled || !imagePath}
            title={t('sectorFlash.partitionEditor.reloadMbr', { defaultValue: '重新加载 MBR' })}
          >
            {t('sectorFlash.partitionEditor.reloadMbr', { defaultValue: '重新加载 MBR' })}
          </button>
          <button
            className="sf-btn sf-btn-small sf-btn-danger"
            onClick={handleClearAll}
            disabled={disabled || mbrInfo!.partCount === 0}
            title={t('sectorFlash.partitionEditor.clearAll', { defaultValue: '清空全部分区' })}
          >
            <FontAwesomeIcon icon={faTrashAlt} />
          </button>
        </div>
      </div>
      <div className="sf-table-scroll" ref={tableScrollRef}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="sf-mbr-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: 120 }}>
                  {t('sectorFlash.partitionEditor.name', { defaultValue: '名称' })}
                </th>
                <th style={{ width: 'auto' }}>
                  {t('sectorFlash.partitionEditor.downloadFile', { defaultValue: '下载文件' })}
                </th>
                <th style={{ width: 90 }}>
                  {t('sectorFlash.partitionEditor.address', { defaultValue: '地址' })}
                </th>
                <th style={{ width: 70 }}>
                  {t('sectorFlash.partitionEditor.sectors', { defaultValue: '扇区数' })}
                </th>
                <th style={{ width: 90 }}>
                  {t('sectorFlash.partitionEditor.actions', { defaultValue: '操作' })}
                </th>
              </tr>
            </thead>
            <tbody>
              <SortableContext
                items={mbrInfo.partitions.map((_, index) => index)}
                strategy={verticalListSortingStrategy}
              >
                {mbrInfo.partitions.map((partition, index) => {
                  const configPartition = partitionConfig.find((p) => p.name === partition.name);
                  const isEditing = editingIndex === index;
                  const calculatedAddress = calculatedAddresses.get(index) || BigInt(0);
                  const isFlashing = progress?.currentPartition === partition.name;

                  return (
                    <SortableRow
                      key={index}
                      id={index}
                      partition={partition}
                      configPartition={configPartition}
                      imageFileName={imageFileName}
                      isEditing={isEditing}
                      disabled={disabled}
                      calculatedAddress={calculatedAddress}
                      editData={editData}
                      filePathInputRef={filePathInputRef}
                      onSetEditData={setEditData}
                      onStartEdit={handleStartEdit}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={handleCancelEdit}
                      onDelete={handleDelete}
                      onSelectFile={handleSelectFile}
                      t={t}
                      progress={progress}
                      rowRef={
                        isFlashing
                          ? (node) => {
                              flashingRowRef.current = node;
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </SortableContext>

              {canAdd && (
                <tr className="sf-row-adding">
                  <td>*</td>
                  <td>
                    <input
                      type="text"
                      className="sf-input sf-input-small"
                      value={newPartition.name}
                      onChange={(e) =>
                        setNewPartition((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder={t('sectorFlash.partitionEditor.namePlaceholder', {
                        defaultValue: '输入分区名称',
                      })}
                      maxLength={16}
                      disabled={disabled}
                    />
                  </td>
                  <td>
                    <div className="sf-file-cell">
                      <input
                        type="text"
                        className="sf-input sf-input-small"
                        value={newPartition.customFilePath}
                        onChange={(e) =>
                          setNewPartition((prev) => ({ ...prev, customFilePath: e.target.value }))
                        }
                        placeholder={t('sectorFlash.partitionEditor.selectFile', {
                          defaultValue: '选择文件...',
                        })}
                        disabled={disabled}
                      />
                      <button
                        className="sf-btn sf-btn-small sf-btn-secondary"
                        onClick={handleSelectFileForNew}
                        disabled={disabled}
                      >
                        ...
                      </button>
                    </div>
                  </td>
                  <td className="sf-mono">{formatHex(newPartitionAddress, 8)}</td>
                  <td>
                    <input
                      type="text"
                      className="sf-input sf-input-small"
                      value={newPartition.length}
                      onChange={(e) =>
                        setNewPartition((prev) => ({ ...prev, length: e.target.value }))
                      }
                      placeholder="0"
                      disabled={disabled}
                    />
                  </td>
                  <td>
                    <button
                      className="sf-btn sf-btn-small sf-btn-success sf-btn-icon"
                      onClick={handleAddPartition}
                      disabled={disabled || !newPartition.name}
                      title={t('common.add', { defaultValue: '添加' })}
                    >
                      <FontAwesomeIcon icon={faPlus} />
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </DndContext>
      </div>
    </div>
  );
};
