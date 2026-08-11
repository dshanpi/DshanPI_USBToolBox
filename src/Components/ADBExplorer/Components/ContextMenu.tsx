import React, { useLayoutEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdbFileInfo } from '../../../Services';
import type { ClipboardItem, ContextMenuPosition } from '../types';
import { isTextFile } from '../../../CoreUI';

interface FileContextMenuProps {
  position: ContextMenuPosition;
  item: AdbFileInfo;
  clipboard: ClipboardItem | null;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  onDownload: (item: AdbFileInfo) => void;
  onDownloadFolder: (item: AdbFileInfo) => void;
  onOpen: (item: AdbFileInfo) => void;
  onEdit: (item: AdbFileInfo) => void;
  onOpenFolder: (path: string) => void;
  onCut: (item: AdbFileInfo) => void;
  onCopy: (item: AdbFileInfo) => void;
  onPaste: () => void;
  onDelete: (item: AdbFileInfo) => void;
  onRename: (item: AdbFileInfo) => void;
  onProperties: (item: AdbFileInfo) => void;
  onClose: () => void;
}

export const FileContextMenu: React.FC<FileContextMenuProps> = ({
  position,
  item,
  clipboard,
  contextMenuRef,
  onDownload,
  onDownloadFolder,
  onOpen,
  onEdit,
  onOpenFolder,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onRename,
  onProperties,
  onClose,
}) => {
  const { t } = useTranslation();
  const [adjustedPosition, setAdjustedPosition] = useState({ x: position.x, y: position.y });
  const innerRef = useRef<HTMLDivElement>(null);
  const menuRef = contextMenuRef || innerRef;
  const canEdit = !item.is_directory && isTextFile(item.name);

  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 8;
      }
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 8;
      }

      x = Math.max(8, x);
      y = Math.max(8, y);

      setAdjustedPosition({ x, y });
    }
  }, [position, menuRef]);

  return (
    <div
      ref={menuRef}
      className="nautilus-context-menu"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {!item.is_directory && (
        <>
          <button
            onClick={() => {
              onClose();
              onDownload(item);
            }}
          >
            ⬇️ {t('adbExplorer.download', '下载')}
          </button>
          <button
            onClick={() => {
              onClose();
              onOpen(item);
            }}
          >
            📂 {t('adbExplorer.open', '打开')}
          </button>
          {canEdit && (
            <button
              onClick={() => {
                onClose();
                onEdit(item);
              }}
            >
              ✏️ {t('adbExplorer.edit', '编辑')}
            </button>
          )}
        </>
      )}
      {item.is_directory && (
        <>
          <button
            onClick={() => {
              onClose();
              onOpenFolder(item.path);
            }}
          >
            📁 {t('adbExplorer.openFolder', '打开文件夹')}
          </button>
          <button
            onClick={() => {
              onClose();
              onDownloadFolder(item);
            }}
          >
            ⬇️ {t('adbExplorer.downloadFolder', '下载文件夹')}
          </button>
        </>
      )}
      <div className="nautilus-context-separator" />
      <button
        onClick={() => {
          onClose();
          onCut(item);
        }}
      >
        ✂️ {t('adbExplorer.cut', '剪切')}
      </button>
      <button
        onClick={() => {
          onClose();
          onCopy(item);
        }}
      >
        📋 {t('adbExplorer.copy', '复制')}
      </button>
      {clipboard && !item.is_directory && (
        <button
          onClick={() => {
            onClose();
            onPaste();
          }}
        >
          📥 {t('adbExplorer.paste', '粘贴')}
        </button>
      )}
      <div className="nautilus-context-separator" />
      <button
        onClick={() => {
          onClose();
          onRename(item);
        }}
      >
        ✏️ {t('adbExplorer.rename', '重命名')}
      </button>
      <button
        onClick={() => {
          onClose();
          onDelete(item);
        }}
        className="danger"
      >
        🗑️ {t('adbExplorer.delete', '删除')}
      </button>
      <div className="nautilus-context-separator" />
      <button
        onClick={() => {
          onClose();
          onProperties(item);
        }}
      >
        ℹ️ {t('adbExplorer.properties', '属性')}
      </button>
    </div>
  );
};

interface BackgroundContextMenuProps {
  position: ContextMenuPosition;
  clipboard: ClipboardItem | null;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  onRefresh: () => void;
  onNewFolder: () => void;
  onPaste: () => void;
  onUploadFile: () => void;
  onUploadFolder: () => void;
  onClose: () => void;
}

export const BackgroundContextMenu: React.FC<BackgroundContextMenuProps> = ({
  position,
  clipboard,
  contextMenuRef,
  onRefresh,
  onNewFolder,
  onPaste,
  onUploadFile,
  onUploadFolder,
  onClose,
}) => {
  const { t } = useTranslation();
  const [adjustedPosition, setAdjustedPosition] = useState({ x: position.x, y: position.y });
  const innerRef = useRef<HTMLDivElement>(null);
  const menuRef = contextMenuRef || innerRef;

  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 8;
      }
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 8;
      }

      x = Math.max(8, x);
      y = Math.max(8, y);

      setAdjustedPosition({ x, y });
    }
  }, [position, menuRef]);

  return (
    <div
      ref={menuRef}
      className="nautilus-context-menu"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          onClose();
          onRefresh();
        }}
      >
        🔄 {t('adbExplorer.refresh', '刷新')}
      </button>
      <div className="nautilus-context-separator" />
      <button
        onClick={() => {
          onClose();
          onNewFolder();
        }}
      >
        📁 {t('adbExplorer.newFolder', '新建文件夹')}
      </button>
      <button
        onClick={() => {
          onClose();
          onUploadFile();
        }}
      >
        📤 {t('adbExplorer.uploadFile', '上传文件')}
      </button>
      <button
        onClick={() => {
          onClose();
          onUploadFolder();
        }}
      >
        📂 {t('adbExplorer.uploadFolder', '上传文件夹')}
      </button>
      {clipboard && (
        <>
          <div className="nautilus-context-separator" />
          <button
            onClick={() => {
              onClose();
              onPaste();
            }}
          >
            📥 {t('adbExplorer.paste', '粘贴')}
          </button>
        </>
      )}
    </div>
  );
};
