import { useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { adbService } from '../../../Services';
import { normalizeIpcError } from '../../../Platform/IPC/Client';
import type { TFunction } from 'i18next';

export interface TransferState {
  active: boolean;
  type: 'upload' | 'download';
  fileName: string;
}

export function useUploadActions(
  selectedDevice: string | null,
  currentPath: string,
  loadDirectory: (path: string) => void,
  setError: (error: string | null) => void,
  t: TFunction,
  setTransferState: (state: TransferState) => void
) {
  const handleUploadFile = useCallback(async () => {
    if (!selectedDevice) return;

    const selected = await open({
      multiple: false,
      title: t('adbExplorer.selectFile', '选择文件'),
    });

    if (selected) {
      const filePath = selected as string;
      const fileName = filePath.split(/[/\\]/).pop() || 'file';
      const remotePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;

      setTransferState({ active: true, type: 'upload', fileName });
      try {
        await adbService.pushFile(selectedDevice, filePath, remotePath);
        loadDirectory(currentPath);
        setError(null);
      } catch (e) {
        setError(`${t('adbExplorer.error.upload', '上传失败')}: ${normalizeIpcError(e).message}`);
      } finally {
        setTransferState({ active: false, type: 'upload', fileName: '' });
      }
    }
  }, [selectedDevice, currentPath, loadDirectory, t, setError, setTransferState]);

  const handleUploadFolder = useCallback(async () => {
    if (!selectedDevice) return;

    const selected = await open({
      directory: true,
      multiple: false,
      title: t('adbExplorer.selectFolder', '选择文件夹'),
    });

    if (selected) {
      const folderPath = selected as string;
      const folderName = folderPath.split(/[/\\]/).pop() || 'folder';
      const remotePath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;

      setTransferState({ active: true, type: 'upload', fileName: folderName });
      try {
        await adbService.pushFile(selectedDevice, folderPath, remotePath);
        loadDirectory(currentPath);
        setError(null);
      } catch (e) {
        setError(`${t('adbExplorer.error.upload', '上传失败')}: ${normalizeIpcError(e).message}`);
      } finally {
        setTransferState({ active: false, type: 'upload', fileName: '' });
      }
    }
  }, [selectedDevice, currentPath, loadDirectory, t, setError, setTransferState]);

  const handleDropUpload = useCallback(
    async (localPaths: string[]) => {
      if (!selectedDevice || localPaths.length === 0) return;

      setTransferState({
        active: true,
        type: 'upload',
        fileName:
          localPaths.length > 1
            ? `${localPaths.length} files`
            : localPaths[0].split(/[/\\]/).pop() || 'file',
      });
      try {
        for (const localPath of localPaths) {
          const fileName = localPath.split(/[/\\]/).pop() || 'file';
          const remotePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;
          await adbService.pushFile(selectedDevice, localPath, remotePath);
        }
        loadDirectory(currentPath);
        setError(null);
      } catch (e) {
        setError(`${t('adbExplorer.error.upload', '上传失败')}: ${normalizeIpcError(e).message}`);
      } finally {
        setTransferState({ active: false, type: 'upload', fileName: '' });
      }
    },
    [selectedDevice, currentPath, loadDirectory, t, setError, setTransferState]
  );

  return {
    handleUploadFile,
    handleUploadFolder,
    handleDropUpload,
  };
}
