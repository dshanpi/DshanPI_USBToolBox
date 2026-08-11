/**
 * Clipboard item for ADB file operations.
 *
 * Represents a file that has been cut or copied for
 * paste operations in the ADB explorer.
 */
export interface ClipboardItem {
  /** Operation type (cut or copy) */
  type: 'cut' | 'copy';
  /** File information from ADB listing */
  item: import('../../Services').AdbFileInfo;
  /** Source path of the file */
  sourcePath: string;
}

/**
 * Context menu position coordinates.
 *
 * Defines the screen position where context menu
 * should be displayed (typically on right-click).
 */
export interface ContextMenuPosition {
  /** X coordinate (horizontal) */
  x: number;
  /** Y coordinate (vertical) */
  y: number;
}