import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AdbFileInfo } from '../../../Services';
import { getFileIconEmoji } from '../../../Library/ICONs/fileIcons';
import { formatSize } from '../../../Utils';

interface FileGridProps {
  files: AdbFileInfo[];
  newFolderName: string | null;
  renamingItem: AdbFileInfo | null;
  loading: boolean;
  selectedDevice: string | null;
  devicesLength: number;
  newFolderInputRef: React.RefObject<HTMLInputElement | null>;
  onFileDoubleClick: (item: AdbFileInfo) => void;
  onContextMenu: (e: React.MouseEvent, item: AdbFileInfo) => void;
  onRenameFolder: (oldName: string, newName: string) => void;
  onRenameItem: (newName: string) => void;
  onCancelNewFolder: () => void;
  onCancelRename: () => void;
}

const FileIcon: React.FC<{ item: AdbFileInfo }> = ({ item }) => {
  const icon = getFileIconEmoji(item.name, item.is_directory);
  return <div className="nautilus-file-icon">{icon}</div>;
};

export const FileGrid: React.FC<FileGridProps> = ({
  files,
  newFolderName,
  renamingItem,
  loading,
  selectedDevice,
  devicesLength,
  newFolderInputRef,
  onFileDoubleClick,
  onContextMenu,
  onRenameFolder,
  onRenameItem,
  onCancelNewFolder,
  onCancelRename,
}) => {
  const { t } = useTranslation();

  if (!selectedDevice || devicesLength === 0) {
    return (
      <div className="nautilus-empty">
        <div className="nautilus-empty-icon">📱</div>
        <span>{t('adbExplorer.noDeviceSelected', '未选择设备')}</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="nautilus-loading">
        <div className="nautilus-spinner"></div>
        <span>{t('common.loading', '加载中...')}</span>
      </div>
    );
  }

  if (files.length === 0 && !newFolderName) {
    return (
      <div className="nautilus-empty">
        <div className="nautilus-empty-icon">📂</div>
        <span>{t('adbExplorer.emptyDirectory', '目录为空')}</span>
      </div>
    );
  }

  return (
    <div className="nautilus-file-grid">
      {newFolderName && (
        <div className="nautilus-file-item selected" onClick={(e) => e.stopPropagation()}>
          <FileIcon item={{ name: newFolderName, path: '', is_directory: true, size: 0 }} />
          <input
            ref={newFolderInputRef}
            type="text"
            className="nautilus-file-name-input"
            defaultValue={newFolderName}
            onBlur={(e) => onRenameFolder(newFolderName, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onRenameFolder(newFolderName, e.currentTarget.value);
              } else if (e.key === 'Escape') {
                onCancelNewFolder();
              }
            }}
          />
          <div className="nautilus-file-size"></div>
        </div>
      )}
      {files
        .filter((item) => item.name !== newFolderName)
        .map((item) => {
          const isRenaming = renamingItem?.path === item.path;
          return (
            <div
              key={item.path}
              className="nautilus-file-item"
              onDoubleClick={() => onFileDoubleClick(item)}
              onContextMenu={(e) => onContextMenu(e, item)}
            >
              <FileIcon item={item} />
              {isRenaming ? (
                <input
                  ref={newFolderInputRef}
                  type="text"
                  className="nautilus-file-name-input"
                  defaultValue={item.name}
                  onBlur={(e) => onRenameItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onRenameItem(e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      onCancelRename();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="nautilus-file-name">{item.name}</div>
              )}
              <div className="nautilus-file-size">
                {item.is_directory ? '' : formatSize(item.size)}
              </div>
            </div>
          );
        })}
    </div>
  );
};
