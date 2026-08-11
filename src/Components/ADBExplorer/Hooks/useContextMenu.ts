import { useState, useEffect, useCallback, useRef } from 'react';
import type { AdbFileInfo } from '../../../Services';

export function useContextMenu() {
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    item: AdbFileInfo;
  } | null>(null);
  const [backgroundContextMenu, setBackgroundContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
        setBackgroundContextMenu(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, item: AdbFileInfo) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, item });
  }, []);

  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBackgroundContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenus = useCallback(() => {
    setContextMenu(null);
    setBackgroundContextMenu(null);
  }, []);

  return {
    contextMenuRef,
    contextMenu,
    setContextMenu,
    backgroundContextMenu,
    setBackgroundContextMenu,
    handleContextMenu,
    handleBackgroundContextMenu,
    closeContextMenus,
  };
}
