import { useState, useCallback, useRef } from 'react';
import { adbService, type AdbFileInfo } from '../../../Services';

export function useNewFolder(
  selectedDevice: string | null,
  currentPath: string,
  files: AdbFileInfo[],
  loadDirectory: (path: string) => Promise<void>
) {
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [renamingItem, setRenamingItem] = useState<AdbFileInfo | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const handleNewFolder = useCallback(async () => {
    if (!selectedDevice || !currentPath) return;

    const defaultName = 'New_Folder';
    let folderName = defaultName;
    let counter = 1;

    while (files.some((f) => f.name === folderName && f.is_directory)) {
      folderName = `${defaultName}_${counter}`;
      counter++;
    }

    const folderPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;

    await adbService.makeDirectory(selectedDevice, folderPath);
    setNewFolderName(folderName);
    setRenamingItem(null);
    await loadDirectory(currentPath);
    setTimeout(() => {
      newFolderInputRef.current?.focus();
      newFolderInputRef.current?.select();
    }, 100);
  }, [selectedDevice, currentPath, files, loadDirectory]);

  const startRename = useCallback((item: AdbFileInfo) => {
    setRenamingItem(item);
    setNewFolderName(null);
    setTimeout(() => {
      newFolderInputRef.current?.focus();
      newFolderInputRef.current?.select();
    }, 100);
  }, []);

  const handleRenameFolder = useCallback(
    async (oldName: string, newName: string) => {
      if (!selectedDevice || !currentPath || !newName.trim()) {
        setNewFolderName(null);
        setRenamingItem(null);
        return;
      }

      const oldPath = currentPath === '/' ? `/${oldName}` : `${currentPath}/${oldName}`;
      const newPath = currentPath === '/' ? `/${newName}` : `${currentPath}/${newName}`;

      try {
        if (oldName !== newName) {
          await adbService.rename(selectedDevice, oldPath, newPath);
        }
      } finally {
        setNewFolderName(null);
        setRenamingItem(null);
        loadDirectory(currentPath);
      }
    },
    [selectedDevice, currentPath, loadDirectory]
  );

  const handleRenameItem = useCallback(
    async (newName: string) => {
      if (!selectedDevice || !currentPath || !renamingItem || !newName.trim()) {
        setNewFolderName(null);
        setRenamingItem(null);
        return;
      }

      const oldPath = renamingItem.path;
      const newPath = currentPath === '/' ? `/${newName}` : `${currentPath}/${newName}`;

      try {
        if (renamingItem.name !== newName) {
          await adbService.rename(selectedDevice, oldPath, newPath);
        }
      } finally {
        setNewFolderName(null);
        setRenamingItem(null);
        loadDirectory(currentPath);
      }
    },
    [selectedDevice, currentPath, renamingItem, loadDirectory]
  );

  return {
    newFolderName,
    setNewFolderName,
    renamingItem,
    setRenamingItem,
    newFolderInputRef,
    handleNewFolder,
    startRename,
    handleRenameFolder,
    handleRenameItem,
  };
}
