import { useState, useCallback } from 'react';
import type { AdbFileInfo } from '../../../Services';
import type { ClipboardItem } from '../types';

export function useClipboard() {
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);

  const handleCut = useCallback((item: AdbFileInfo, sourcePath: string) => {
    setClipboard({ type: 'cut', item, sourcePath });
  }, []);

  const handleCopy = useCallback((item: AdbFileInfo, sourcePath: string) => {
    setClipboard({ type: 'copy', item, sourcePath });
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboard(null);
  }, []);

  return { clipboard, handleCut, handleCopy, clearClipboard };
}
