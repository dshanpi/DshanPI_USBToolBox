/**
 * ADB Explorer component for file system navigation on ADB-connected devices.
 *
 * This component provides a file explorer interface similar to Nautilus/GNOME Files:
 * - Browse device file system with grid/list view modes
 * - Navigate directories with breadcrumb path
 * - Copy, cut, paste, rename, delete operations
 * - Upload/download files and folders
 * - Create new folders
 * - Edit text files with Monaco editor
 * - View file properties
 * - Root access switching for system directories
 *
 * Supports drag-and-drop file upload from the host system.
 */
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { downloadDir } from '@tauri-apps/api/path';
import { save } from '@tauri-apps/plugin-dialog';
import { adbService, type AdbFileInfo } from '../../Services';
import { normalizeIpcError } from '../../Platform/IPC/Client';
import {
  useAdbServer,
  useDeviceManager,
  useClipboard,
  useContextMenu,
  useNewFolder,
  useNavigationActions,
  useFileActions,
  useClipboardActions,
  useFolderActions,
  useDeviceActions,
  useUploadActions,
  TransferState,
} from './Hooks';
import {
  ServerWarning,
  HeaderBar,
  ToolBar,
  FileGrid,
  FileList,
  FileContextMenu,
  BackgroundContextMenu,
  PropertiesModal,
  TextEditor,
  TextEditorRef,
} from './Components';
import './ADBExplorer.css';

/**
 * ADB Explorer component for file system navigation on Android devices.
 *
 * Provides a comprehensive file management interface with:
 * - Toolbar: Device selection, scan, root toggle
 * - Header: Path navigation, refresh, paste, view mode toggle
 * - Content: Grid or list view of files/folders
 * - Status bar: File/folder counts and clipboard status
 * - Context menus: File and background operations
 *
 * @param props - Component props
 * @param props.isActive - Whether the component is currently active/visible
 * @returns The ADBExplorer component
 */
export const ADBExplorer: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const { t } = useTranslation();

  /**
   * Current error message to display.
   */
  const [error, setError] = React.useState<string | null>(null);

  /**
   * File info for properties modal display.
   */
  const [showProperties, setShowProperties] = React.useState<AdbFileInfo | null>(null);

  /**
   * File being edited in text editor.
   */
  const [editingFile, setEditingFile] = React.useState<AdbFileInfo | null>(null);

  /**
   * Whether text editor has unsaved changes.
   */
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  /**
   * Whether directory loading is in progress.
   */
  const [loading, setLoading] = React.useState(false);

  /**
   * Whether drag-drop overlay should be shown.
   */
  const [isDragging, setIsDragging] = useState(false);

  /**
   * Current file transfer state (upload/download).
   */
  const [transferState, setTransferState] = useState<TransferState>({
    active: false,
    type: 'upload',
    fileName: '',
  });

  /**
   * Current view mode (grid or list).
   */
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  /**
   * Ref to track if initial device scan has been performed.
   */
  const scannedRef = React.useRef(false);

  /**
   * Ref to text editor component for save/close operations.
   */
  const editorRef = useRef<TextEditorRef>(null);

  /**
   * ADB server status from custom hook.
   */
  const { serverStatus, checkServerStatus } = useAdbServer();

  /**
   * Device manager state from custom hook.
   * Manages device list and selection with directory loading callback.
   */
  const { devices, selectedDevice, isRoot, handleSelectDevice, scanDevices, handleRoot } =
    useDeviceManager(async (path: string, deviceSerial?: string) => {
      const serial = deviceSerial || selectedDevice;
      if (!serial) return;

      setLoading(true);
      try {
        const listing = await adbService.listDirectory(serial, path);
        const uniqueItems = listing.items.filter(
          (item, index, self) => index === self.findIndex((i) => i.path === item.path)
        );
        const sortedItems = uniqueItems.sort((a, b) => {
          if (a.is_directory && !b.is_directory) return -1;
          if (!a.is_directory && b.is_directory) return 1;
          return a.name.localeCompare(b.name);
        });
        setFiles(sortedItems);
        setCurrentPath(path);
      } catch (e) {
        setError(`${t('adbExplorer.error.listDirectory', '列出目录失败')}: ${normalizeIpcError(e).message}`);
      } finally {
        setLoading(false);
      }
    }, setLoading);

  /**
   * Current directory path being browsed.
   */
  const [currentPath, setCurrentPath] = React.useState('/');

  /**
   * Files in current directory.
   */
  const [files, setFiles] = React.useState<AdbFileInfo[]>([]);

  /**
   * Loads directory contents for the specified path.
   * @param path - Directory path to load
   * @param deviceSerial - Optional device serial (uses selectedDevice if omitted)
   */
  const loadDirectory = useCallback(
    async (path: string, deviceSerial?: string) => {
      const serial = deviceSerial || selectedDevice;
      if (!serial) return;

      setLoading(true);
      try {
        const listing = await adbService.listDirectory(serial, path);
        const uniqueItems = listing.items.filter(
          (item, index, self) => index === self.findIndex((i) => i.path === item.path)
        );
        const sortedItems = uniqueItems.sort((a, b) => {
          if (a.is_directory && !b.is_directory) return -1;
          if (!a.is_directory && b.is_directory) return 1;
          return a.name.localeCompare(b.name);
        });
        setFiles(sortedItems);
        setCurrentPath(path);
        setError(null);
      } catch (e) {
        setError(`${t('adbExplorer.error.listDirectory')}: ${normalizeIpcError(e).message}`);
      } finally {
        setLoading(false);
      }
    },
    [selectedDevice, t]
  );

  /**
   * Clipboard state from custom hook for cut/copy/paste operations.
   */
  const { clipboard, handleCut, handleCopy, clearClipboard } = useClipboard();

  /**
   * Context menu state from custom hook.
   */
  const {
    contextMenuRef,
    contextMenu,
    setContextMenu,
    backgroundContextMenu,
    setBackgroundContextMenu,
    handleContextMenu,
    handleBackgroundContextMenu,
    closeContextMenus,
  } = useContextMenu();

  /**
   * New folder and rename state from custom hook.
   */
  const {
    newFolderName,
    setNewFolderName,
    renamingItem,
    setRenamingItem,
    newFolderInputRef,
    handleNewFolder,
    startRename,
    handleRenameFolder,
    handleRenameItem,
  } = useNewFolder(selectedDevice, currentPath, files, loadDirectory);

  /**
   * Navigation actions from custom hook.
   */
  const {
    handleFileDoubleClick,
    handleRefresh,
    handleGoToParent,
    handleNavigateToPath,
    pathParts,
    parentPath,
  } = useNavigationActions(selectedDevice, currentPath, loadDirectory, setError, t, setEditingFile);

  /**
   * File actions from custom hook (download, open, delete).
   */
  const { handleDownload, handleOpen, handleDelete } = useFileActions(
    selectedDevice,
    currentPath,
    loadDirectory,
    setError,
    t,
    setTransferState
  );

  /**
   * Handler for downloading a folder from the device.
   * @param item - Folder to download
   */
  const handleDownloadFolder = useCallback(
    async (item: AdbFileInfo) => {
      if (!item.is_directory || !selectedDevice) return;

      const defaultPath = await downloadDir();
      const folderPath = await save({
        defaultPath: `${defaultPath}/${item.name}`,
        title: t('adbExplorer.selectExportPath', '选择导出路径'),
      });

      if (folderPath && selectedDevice) {
        setTransferState({ active: true, type: 'download', fileName: item.name });
        try {
          await adbService.pullFolder(selectedDevice, item.path, folderPath);
          setError(null);
        } catch (e) {
          setError(`${t('adbExplorer.error.download', '下载失败')}: ${normalizeIpcError(e).message}`);
        } finally {
          setTransferState({ active: false, type: 'download', fileName: '' });
        }
      }
    },
    [selectedDevice, t, setError]
  );

  /**
   * Clipboard paste action from custom hook.
   */
  const { handlePaste } = useClipboardActions(
    selectedDevice,
    currentPath,
    clipboard,
    loadDirectory,
    clearClipboard,
    setError,
    t
  );

  /**
   * Folder actions (new folder, rename) from custom hook.
   */
  const {
    handleNewFolderWrapper,
    handleRenameWrapper,
    handleRenameItemWithError,
    handleRenameFolderWithError,
  } = useFolderActions(
    startRename,
    handleNewFolder,
    handleRenameItem,
    handleRenameFolder,
    closeContextMenus,
    setBackgroundContextMenu,
    setError,
    t
  );

  /**
   * Device actions (root toggle) from custom hook.
   */
  const { handleRootWrapper } = useDeviceActions(
    selectedDevice,
    isRoot,
    handleRoot,
    scanDevices,
    devices,
    handleSelectDevice,
    currentPath,
    setError,
    t
  );

  /**
   * Upload actions from custom hook.
   */
  const { handleUploadFile, handleUploadFolder, handleDropUpload } = useUploadActions(
    selectedDevice,
    currentPath,
    loadDirectory,
    setError,
    t,
    setTransferState
  );

  /**
   * Handler for cut operation with current path context.
   * @param item - File/folder to cut
   */
  const handleCutWrapper = useCallback(
    (item: AdbFileInfo) => {
      handleCut(item, currentPath);
    },
    [handleCut, currentPath]
  );

  /**
   * Handler for copy operation with current path context.
   * @param item - File/folder to copy
   */
  const handleCopyWrapper = useCallback(
    (item: AdbFileInfo) => {
      handleCopy(item, currentPath);
    },
    [handleCopy, currentPath]
  );

  /**
   * Ref to content area for drag-drop handling.
   */
  const contentRef = useRef<HTMLDivElement>(null);

  /**
   * Effect: Setup drag-drop event listeners for file upload.
   */
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupDragDrop = async () => {
      const webviewWindow = getCurrentWebviewWindow();

      unlisten = await webviewWindow.onDragDropEvent(async ({ payload }) => {
        if (payload.type === 'over') {
          if (contentRef.current) {
            setIsDragging(true);
          }
        } else if (payload.type === 'drop') {
          setIsDragging(false);
          const paths = payload.paths;
          if (paths.length > 0) {
            handleDropUpload(paths);
          }
        } else {
          setIsDragging(false);
        }
      });
    };

    setupDragDrop();
    return () => {
      if (unlisten) unlisten();
    };
  }, [handleDropUpload]);

  /**
   * Effect: Check ADB server status when component becomes active.
   */
  React.useEffect(() => {
    if (isActive) {
      checkServerStatus();
    }
  }, [isActive, checkServerStatus]);

  /**
   * Effect: Perform initial device scan when server is running.
   */
  React.useEffect(() => {
    if (isActive && serverStatus?.running && !scannedRef.current) {
      scannedRef.current = true;
      const timer = setTimeout(() => {
        scanDevices('/');
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, serverStatus?.running]);

  /**
   * Effect: Handle Ctrl+S keyboard shortcut for saving edited file.
   */
  React.useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (editingFile) {
          await editorRef.current?.save();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingFile]);

  // Early return if ADB server is not running
  if (!serverStatus?.running) {
    return <ServerWarning onRetry={checkServerStatus} />;
  }

  return (
    <div
      className="nautilus-container"
      onClick={() => {
        setContextMenu(null);
        setBackgroundContextMenu(null);
      }}
    >
      {/* Toolbar with device selection and controls */}
      <ToolBar
        devices={devices}
        selectedDevice={selectedDevice}
        isRoot={isRoot}
        loading={loading}
        currentPath={currentPath}
        onSelectDevice={handleSelectDevice}
        onScanDevices={scanDevices}
        onRoot={handleRootWrapper}
      />

      {/* Header bar with navigation and view controls */}
      <HeaderBar
        parentPath={parentPath}
        pathParts={pathParts}
        loading={loading}
        hasClipboard={!!clipboard}
        editingFile={editingFile}
        hasUnsavedChanges={hasUnsavedChanges}
        viewMode={viewMode}
        onGoToParent={handleGoToParent}
        onNavigateToPath={handleNavigateToPath}
        onRefresh={handleRefresh}
        onPaste={handlePaste}
        onViewModeChange={setViewMode}
        onCloseEditor={async () => {
          const canClose = await editorRef.current?.close();
          if (canClose) {
            setEditingFile(null);
            setHasUnsavedChanges(false);
          }
        }}
        onSaveFile={async () => {
          await editorRef.current?.save();
        }}
      />

      {/* Error display bar */}
      {error && (
        <div className="nautilus-error-bar">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* File content area */}
      <div
        ref={contentRef}
        className="nautilus-content"
        onContextMenu={(e) => {
          if (!editingFile) {
            handleBackgroundContextMenu(e);
          }
        }}
      >
        {editingFile ? (
          /* Text editor for editing files */
          <TextEditor
            ref={editorRef}
            item={editingFile}
            selectedDevice={selectedDevice}
            onSaveSuccess={() => {
              loadDirectory(currentPath);
              setHasUnsavedChanges(false);
            }}
            setError={setError}
            onChangesChange={setHasUnsavedChanges}
          />
        ) : viewMode === 'grid' ? (
          /* Grid view for files */
          <FileGrid
            files={files}
            newFolderName={newFolderName}
            renamingItem={renamingItem}
            loading={loading}
            selectedDevice={selectedDevice}
            devicesLength={devices.length}
            newFolderInputRef={newFolderInputRef}
            onFileDoubleClick={handleFileDoubleClick}
            onContextMenu={handleContextMenu}
            onRenameFolder={handleRenameFolderWithError}
            onRenameItem={handleRenameItemWithError}
            onCancelNewFolder={() => setNewFolderName(null)}
            onCancelRename={() => setRenamingItem(null)}
          />
        ) : (
          /* List view for files */
          <FileList
            files={files}
            newFolderName={newFolderName}
            renamingItem={renamingItem}
            loading={loading}
            selectedDevice={selectedDevice}
            devicesLength={devices.length}
            newFolderInputRef={newFolderInputRef}
            onFileDoubleClick={handleFileDoubleClick}
            onContextMenu={handleContextMenu}
            onRenameFolder={handleRenameFolderWithError}
            onRenameItem={handleRenameItemWithError}
            onCancelNewFolder={() => setNewFolderName(null)}
            onCancelRename={() => setRenamingItem(null)}
          />
        )}
        {/* Drag-drop overlay */}
        {isDragging && (
          <div className="nautilus-drop-overlay">
            <span className="nautilus-drop-overlay-text">
              {t('adbExplorer.dropToUpload', '拖放文件以上传')}
            </span>
          </div>
        )}
        {/* Transfer progress overlay */}
        {transferState.active && (
          <div className="nautilus-transfer-overlay">
            <div className="nautilus-transfer-content">
              <div className="nautilus-spinner"></div>
              <span className="nautilus-transfer-text">
                {transferState.type === 'upload'
                  ? t('adbExplorer.uploading', '正在上传 {{fileName}}...', {
                      fileName: transferState.fileName,
                    })
                  : t('adbExplorer.downloading', '正在下载 {{fileName}}...', {
                      fileName: transferState.fileName,
                    })}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Status bar showing counts and clipboard */}
      <div className="nautilus-statusbar">
        <span>
          {selectedDevice &&
            files.length > 0 &&
            `${files.filter((f) => f.is_directory).length} ${t('adbExplorer.folders', '文件夹')}, ${files.filter((f) => !f.is_directory).length} ${t('adbExplorer.files', '文件')}`}
          {clipboard && ` | ${t('adbExplorer.clipboard', '剪贴板')}: ${clipboard.item.name}`}
        </span>
      </div>

      {/* File context menu */}
      {contextMenu && (
        <FileContextMenu
          position={contextMenu.position}
          item={contextMenu.item}
          clipboard={clipboard}
          contextMenuRef={contextMenuRef}
          onDownload={handleDownload}
          onDownloadFolder={handleDownloadFolder}
          onOpen={handleOpen}
          onEdit={setEditingFile}
          onOpenFolder={loadDirectory}
          onCut={handleCutWrapper}
          onCopy={handleCopyWrapper}
          onPaste={handlePaste}
          onDelete={handleDelete}
          onRename={handleRenameWrapper}
          onProperties={setShowProperties}
          onClose={closeContextMenus}
        />
      )}

      {/* Background context menu */}
      {backgroundContextMenu && (
        <BackgroundContextMenu
          position={backgroundContextMenu}
          clipboard={clipboard}
          contextMenuRef={contextMenuRef}
          onRefresh={handleRefresh}
          onNewFolder={handleNewFolderWrapper}
          onPaste={handlePaste}
          onUploadFile={handleUploadFile}
          onUploadFolder={handleUploadFolder}
          onClose={closeContextMenus}
        />
      )}

      {/* File properties modal */}
      {showProperties && (
        <PropertiesModal item={showProperties} onClose={() => setShowProperties(null)} />
      )}
    </div>
  );
};