import React, { useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash, faSave, faTimes } from '@fortawesome/free-solid-svg-icons';
import { useSortable } from '@dnd-kit/sortable';
import { PartitionInfo } from '../../../FlashConfig';
import { formatHex } from '../../../Utils';
import { Partition } from '../../../Library/OpenixIMG';

export interface PartitionProgress {
  percent: number;
  stage: string;
  currentPartition?: string;
  completedPartitions?: string[];
  partitionPercent?: number;
}

const FileDisplay: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollLeft = ref.current.scrollWidth;
    }
  }, [children]);

  return (
    <div ref={ref} className="sf-file-display-inner">
      {children}
    </div>
  );
};

export interface SortableRowProps {
  id: number;
  partition: PartitionInfo;
  configPartition: Partition | undefined;
  imageFileName: string;
  isEditing: boolean;
  disabled: boolean;
  calculatedAddress: bigint;
  editData: { length: string; customFilePath: string };
  filePathInputRef: React.RefObject<HTMLInputElement | null>;
  onSetEditData: React.Dispatch<React.SetStateAction<{ length: string; customFilePath: string }>>;
  onStartEdit: (index: number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (index: number) => void;
  onSelectFile: (index: number, isEditing: boolean) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  progress?: PartitionProgress;
  rowRef?: (node: HTMLTableRowElement | null) => void;
}

export const SortableRow: React.FC<SortableRowProps> = ({
  id,
  partition,
  configPartition,
  imageFileName,
  isEditing,
  disabled,
  calculatedAddress,
  editData,
  filePathInputRef,
  onSetEditData,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onSelectFile,
  t,
  progress,
  rowRef,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id,
    transition: null,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const downloadFile = configPartition?.downloadfile || '';
  const customFilePath = configPartition?.customFilePath || '';

  const isFlashing = progress?.currentPartition === partition.name;
  const isCompleted = progress?.completedPartitions?.includes(partition.name);

  const getActionDisplay = (): { text: string; className: string } => {
    if (isFlashing) {
      const displayPercent = progress?.partitionPercent ?? 0;
      return { text: `${displayPercent.toFixed(1)}%`, className: 'sf-partition-progress' };
    }
    if (isCompleted) {
      return {
        text: t('sectorFlash.partitionEditor.completed', { defaultValue: '已烧录' }),
        className: 'sf-partition-completed',
      };
    }
    return { text: '', className: '' };
  };

  const actionDisplay = getActionDisplay();

  return (
    <tr
      ref={(node) => {
        setNodeRef(node);
        rowRef?.(node);
      }}
      style={style}
      className={`${isDragging ? 'sf-row-dragging' : ''} ${isFlashing ? 'sf-row-flashing' : ''} ${isCompleted ? 'sf-row-completed' : ''}`}
    >
      {isEditing ? (
        <>
          <td>{id}</td>
          <td className="sf-partition-name">{partition.name}</td>
          <td>
            <div className="sf-file-cell">
              <input
                ref={filePathInputRef}
                type="text"
                className="sf-input sf-input-small sf-file-path-input"
                value={
                  editData.customFilePath ||
                  (downloadFile ? `${imageFileName}/${downloadFile}` : '')
                }
                onChange={(e) =>
                  onSetEditData((prev) => ({ ...prev, customFilePath: e.target.value }))
                }
                placeholder={
                  downloadFile
                    ? `${imageFileName}/${downloadFile}`
                    : t('sectorFlash.partitionEditor.selectFile', { defaultValue: '选择文件...' })
                }
                disabled={disabled}
              />
              <button
                className="sf-btn sf-btn-small sf-btn-secondary"
                onClick={() => onSelectFile(id, true)}
                disabled={disabled}
              >
                ...
              </button>
            </div>
          </td>
          <td className="sf-mono">{formatHex(calculatedAddress, 8)}</td>
          <td>
            <input
              type="text"
              className="sf-input sf-input-small"
              value={editData.length}
              onChange={(e) => onSetEditData((prev) => ({ ...prev, length: e.target.value }))}
            />
          </td>
          <td>
            <div className="sf-action-buttons">
              <button
                className="sf-btn sf-btn-small sf-btn-success sf-btn-icon"
                onClick={onSaveEdit}
                disabled={disabled}
                title={t('common.save', { defaultValue: '保存' })}
              >
                <FontAwesomeIcon icon={faSave} />
              </button>
              <button
                className="sf-btn sf-btn-small sf-btn-secondary sf-btn-icon"
                onClick={onCancelEdit}
                disabled={disabled}
                title={t('common.cancel', { defaultValue: '取消' })}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
          </td>
        </>
      ) : (
        <>
          <td className="sf-drag-handle" {...attributes} {...listeners}>
            {id}
          </td>
          <td className="sf-partition-name">{partition.name}</td>
          <td className="sf-file-cell-display">
            <FileDisplay>
              {customFilePath ? (
                <span className="sf-custom-file" title={customFilePath}>
                  {customFilePath}
                </span>
              ) : downloadFile ? (
                `${imageFileName}/${downloadFile}`
              ) : (
                <span className="sf-no-file">-</span>
              )}
            </FileDisplay>
          </td>
          <td className="sf-mono">{formatHex(calculatedAddress, 8)}</td>
          <td className="sf-mono">{partition.length.toString()}</td>
          <td>
            {actionDisplay.text ? (
              <span className={actionDisplay.className}>{actionDisplay.text}</span>
            ) : (
              <div className="sf-action-buttons">
                <button
                  className="sf-btn sf-btn-small sf-btn-secondary sf-btn-icon"
                  onClick={() => onStartEdit(id)}
                  disabled={disabled}
                  title={t('common.edit', { defaultValue: '编辑' })}
                >
                  <FontAwesomeIcon icon={faEdit} />
                </button>
                <button
                  className="sf-btn sf-btn-small sf-btn-danger sf-btn-icon"
                  onClick={() => onDelete(id)}
                  disabled={disabled}
                  title={t('common.delete', { defaultValue: '删除' })}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            )}
          </td>
        </>
      )}
    </tr>
  );
};
