import { useCallback } from 'react';
import { openPath } from '@tauri-apps/plugin-opener';
import { save } from '@tauri-apps/plugin-dialog';
import { downloadDir, join } from '@tauri-apps/api/path';
import { adbService, type AdbFileInfo } from '../../../Services';
import { normalizeIpcError } from '../../../Platform/IPC/Client';
import { getCacheDir } from '../Utils';
import type { TFunction } from 'i18next';
import type { TransferState } from './useUploadActions';

export function useFileActions(
  selectedDevice: string | null,
  currentPath: string,
  loadDirectory: (path: string) => void,
  setError: (error: string | null) => void,
  t: TFunction,
  setTransferState: (state: TransferState) => void
) {
  const handleDownload = useCallback(
    async (item: AdbFileInfo) => {
      if (item.is_directory) return;

      const defaultPath = await downloadDir();
      const defaultFilePath = await join(defaultPath, item.name);
      const filePath = await save({
        defaultPath: defaultFilePath,
        filters: [{ name: t('adbExplorer.allFiles', '所有文件'), extensions: ['*'] }],
      });

      if (filePath && selectedDevice) {
        setTransferState({ active: true, type: 'download', fileName: item.name });
        try {
          await adbService.pullFile(selectedDevice, item.path, filePath);
          setError(null);
        } catch {
          setError(t('adbExplorer.error.download', '下载失败'));
        } finally {
          setTransferState({ active: false, type: 'download', fileName: '' });
        }
      }
    },
    [selectedDevice, t, setError, setTransferState]
  );

  const handleOpen = useCallback(
    async (item: AdbFileInfo) => {
      if (item.is_directory) return;

      setTransferState({ active: true, type: 'download', fileName: item.name });
      try {
        const cacheDir = await getCacheDir();
        const tempPath = await join(cacheDir, item.name);
        await adbService.pullFile(selectedDevice, item.path, tempPath);
        await openPath(tempPath);
        setError(null);
      } catch {
        setError(t('adbExplorer.error.open', '打开失败'));
      } finally {
        setTransferState({ active: false, type: 'download', fileName: '' });
      }
    },
    [selectedDevice, t, setError, setTransferState]
  );

  const handleDelete = useCallback(
    async (item: AdbFileInfo) => {
      if (selectedDevice) {
        try {
          await adbService.deleteFile(selectedDevice, item.path);
          loadDirectory(currentPath);
          setError(null);
        } catch (e) {
          setError(`${t('adbExplorer.error.delete', '删除失败')}: ${normalizeIpcError(e).message}`);
        }
      }
    },
    [selectedDevice, currentPath, loadDirectory, t, setError]
  );

  return {
    handleDownload,
    handleOpen,
    handleDelete,
  };
}
