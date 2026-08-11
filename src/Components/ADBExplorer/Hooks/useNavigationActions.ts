import { useCallback, useMemo } from 'react';
import { openPath } from '@tauri-apps/plugin-opener';
import { join } from '@tauri-apps/api/path';
import { isTextFile } from '../../../CoreUI/';
import { adbService, type AdbFileInfo } from '../../../Services';
import { normalizeIpcError } from '../../../Platform/IPC/Client';
import { getCacheDir } from '../Utils';
import type { TFunction } from 'i18next';

export function useNavigationActions(
  selectedDevice: string | null,
  currentPath: string,
  loadDirectory: (path: string) => void,
  setError: (error: string | null) => void,
  t: TFunction,
  onEditFile?: (item: AdbFileInfo) => void
) {
  const handleFileDoubleClick = useCallback(
    async (item: AdbFileInfo) => {
      if (item.is_directory) {
        loadDirectory(item.path);
      } else if (isTextFile(item.name) && onEditFile) {
        onEditFile(item);
      } else {
        try {
          const cacheDir = await getCacheDir();
          const tempPath = await join(cacheDir, item.name);
          await adbService.pullFile(selectedDevice, item.path, tempPath);
          await openPath(tempPath);
          setError(null);
        } catch (e) {
          setError(`${t('adbExplorer.error.open', '打开失败')}: ${normalizeIpcError(e).message}`);
        }
      }
    },
    [loadDirectory, selectedDevice, t, setError, onEditFile]
  );

  const handleRefresh = useCallback(() => {
    if (currentPath) {
      loadDirectory(currentPath);
    }
  }, [currentPath, loadDirectory]);

  const pathParts = useMemo(
    () => (currentPath === '/' ? [] : currentPath.split('/').filter(Boolean)),
    [currentPath]
  );
  const parentPath = currentPath === '/' ? null : '/' + pathParts.slice(0, -1).join('/') || '/';

  const handleGoToParent = useCallback(() => {
    if (parentPath) {
      loadDirectory(parentPath);
    }
  }, [parentPath, loadDirectory]);

  const handleNavigateToPath = useCallback(
    (index: number) => {
      if (index === -1) {
        loadDirectory('/');
        return;
      }
      const parts = pathParts.slice(0, index + 1);
      const path = '/' + parts.join('/');
      loadDirectory(path);
    },
    [pathParts, loadDirectory]
  );

  return {
    handleFileDoubleClick,
    handleRefresh,
    handleGoToParent,
    handleNavigateToPath,
    pathParts,
    parentPath,
  };
}
