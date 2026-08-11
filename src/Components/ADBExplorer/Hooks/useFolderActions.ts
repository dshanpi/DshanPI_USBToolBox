import { useCallback } from 'react';
import { normalizeIpcError } from '../../../Platform/IPC/Client';
import type { AdbFileInfo } from '../../../Services';
import type { TFunction } from 'i18next';

export function useFolderActions(
  startRename: (item: AdbFileInfo) => void,
  handleNewFolder: () => Promise<void>,
  handleRenameItem: (newName: string) => Promise<void>,
  handleRenameFolder: (oldName: string, newName: string) => Promise<void>,
  closeContextMenus: () => void,
  setBackgroundContextMenu: (pos: { x: number; y: number } | null) => void,
  setError: (error: string | null) => void,
  t: TFunction
) {
  const handleNewFolderWrapper = useCallback(async () => {
    setBackgroundContextMenu(null);
    try {
      await handleNewFolder();
      setError(null);
    } catch (e) {
      setError(`${t('adbExplorer.error.createFolder', '创建文件夹失败')}: ${normalizeIpcError(e).message}`);
    }
  }, [handleNewFolder, t, setBackgroundContextMenu, setError]);

  const handleRenameWrapper = useCallback(
    (item: AdbFileInfo) => {
      closeContextMenus();
      startRename(item);
    },
    [startRename, closeContextMenus]
  );

  const handleRenameItemWithError = useCallback(
    async (newName: string) => {
      try {
        await handleRenameItem(newName);
        setError(null);
      } catch (e) {
        setError(`${t('adbExplorer.error.rename', '重命名失败')}: ${normalizeIpcError(e).message}`);
      }
    },
    [handleRenameItem, t, setError]
  );

  const handleRenameFolderWithError = useCallback(
    async (oldName: string, newName: string) => {
      try {
        await handleRenameFolder(oldName, newName);
        setError(null);
      } catch (e) {
        setError(`${t('adbExplorer.error.rename', '重命名失败')}: ${normalizeIpcError(e).message}`);
      }
    },
    [handleRenameFolder, t, setError]
  );

  return {
    handleNewFolderWrapper,
    handleRenameWrapper,
    handleRenameItemWithError,
    handleRenameFolderWithError,
  };
}
