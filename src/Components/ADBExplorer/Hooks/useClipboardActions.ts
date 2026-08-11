import { useCallback } from 'react';
import { adbService } from '../../../Services';
import { normalizeIpcError } from '../../../Platform/IPC/Client';
import type { ClipboardItem } from '../types';
import type { TFunction } from 'i18next';

export function useClipboardActions(
  selectedDevice: string | null,
  currentPath: string,
  clipboard: ClipboardItem | null,
  loadDirectory: (path: string) => void,
  clearClipboard: () => void,
  setError: (error: string | null) => void,
  t: TFunction
) {
  const handlePaste = useCallback(async () => {
    if (!clipboard || !selectedDevice) return;

    const destPath =
      currentPath === '/' ? `/${clipboard.item.name}` : `${currentPath}/${clipboard.item.name}`;

    try {
      if (clipboard.type === 'cut') {
        await adbService.rename(selectedDevice, clipboard.item.path, destPath);
        clearClipboard();
      } else {
        await adbService.copyPath(selectedDevice, clipboard.item.path, destPath);
      }
      loadDirectory(currentPath);
      setError(null);
    } catch (e) {
      setError(`${t('adbExplorer.error.paste', '粘贴失败')}: ${normalizeIpcError(e).message}`);
    }
  }, [clipboard, selectedDevice, currentPath, loadDirectory, t, clearClipboard, setError]);

  return {
    handlePaste,
  };
}
