import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AdbFileInfo } from '../../../Services';
import { getFileIconEmoji } from '../../../Library/ICONs/fileIcons';
import { formatSize } from '../../../Utils';

interface FileListProps {
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
  return <span className="nautilus-list-icon">{icon}</span>;
};

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '--';
  const date = new Date(timestamp * 1000);
  return (
    date.toLocaleDateString() +
    ' ' +
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
};

export const FileList: React.FC<FileListProps> = ({
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
    <div className="nautilus-file-list">
      <div className="nautilus-list-header">
        <div className="nautilus-list-header-name">{t('adbExplorer.name', '名称')}</div>
        <div className="nautilus-list-header-size">{t('adbExplorer.size', '大小')}</div>
        <div className="nautilus-list-header-modified">{t('adbExplorer.modified', '修改时间')}</div>
      </div>
      <div className="nautilus-list-body">
        {newFolderName && (
          <div className="nautilus-list-item selected" onClick={(e) => e.stopPropagation()}>
            <div className="nautilus-list-item-name">
              <FileIcon item={{ name: newFolderName, path: '', is_directory: true, size: 0 }} />
              <input
                ref={newFolderInputRef}
                type="text"
                className="nautilus-list-name-input"
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
            </div>
            <div className="nautilus-list-item-size">--</div>
            <div className="nautilus-list-item-modified">--</div>
          </div>
        )}
        {files
          .filter((item) => item.name !== newFolderName)
          .map((item) => {
            const isRenaming = renamingItem?.path === item.path;
            return (
              <div
                key={item.path}
                className="nautilus-list-item"
                onDoubleClick={() => onFileDoubleClick(item)}
                onContextMenu={(e) => onContextMenu(e, item)}
              >
                <div className="nautilus-list-item-name">
                  <FileIcon item={item} />
                  {isRenaming ? (
                    <input
                      ref={newFolderInputRef}
                      type="text"
                      className="nautilus-list-name-input"
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
                    <span className="nautilus-list-name-text">{item.name}</span>
                  )}
                </div>
                <div className="nautilus-list-item-size">
                  {item.is_directory ? '--' : formatSize(item.size)}
                </div>
                <div className="nautilus-list-item-modified">{formatDate(item.modified_time)}</div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
