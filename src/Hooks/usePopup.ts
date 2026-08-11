import { useState, useCallback } from 'react';
import { PopupType } from '../CoreUI';

/**
 * State for a popup dialog.
 *
 * Contains visibility, type, content, and optional confirm callback.
 */
export interface PopupState {
  /** Whether the popup is currently visible */
  visible: boolean;
  /** Popup type determining visual style */
  type: PopupType;
  /** Popup title text */
  title: string;
  /** Popup message/body text */
  message: string;
  /** Optional callback when user confirms */
  onConfirm?: () => void;
}

/**
 * React hook for managing popup dialogs.
 *
 * Provides simple popup management for showing notifications,
 * errors, warnings, and confirmation dialogs. Includes both
 * imperative showPopup and Promise-based showConfirm methods.
 *
 * Example usage:
 * ```typescript
 * const { popup, showPopup, hidePopup, showConfirm } = usePopup();
 *
 * // Show error popup
 * showPopup('error', 'Failed', 'Operation failed due to...');
 *
 * // Show confirmation and await response
 * const confirmed = await showConfirm('Proceed?', 'Are you sure?');
 * if (confirmed) { ... }
 * ```
 *
 * @returns Object with popup state and control functions
 */
export function usePopup() {
  const [popup, setPopup] = useState<PopupState>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  /**
   * Shows a popup with specified type and content.
   *
   * @param type - Popup type (error, warning, info, success, confirm)
   * @param title - Popup title
   * @param message - Popup message content
   * @param onConfirm - Optional callback for confirm action
   */
  const showPopup = useCallback(
    (type: PopupType, title: string, message: string, onConfirm?: () => void) => {
      setPopup({
        visible: true,
        type,
        title,
        message,
        onConfirm,
      });
    },
    []
  );

  /**
   * Hides the current popup.
   *
   * Preserves other popup state for potential reuse.
   */
  const hidePopup = useCallback(() => {
    setPopup((prev) => ({ ...prev, visible: false }));
  }, []);

  /**
   * Shows a confirmation dialog and returns Promise with result.
   *
   * Creates a Promise that resolves when user confirms or cancels.
   * Uses window.__confirmCancelHandler for cancel button handling.
   *
   * @param title - Confirmation dialog title
   * @param message - Confirmation dialog message
   * @returns Promise resolving to true (confirmed) or false (cancelled)
   */
  const showConfirm = useCallback((title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setPopup({
        visible: true,
        type: 'confirm',
        title,
        message,
        onConfirm: () => {
          resolve(true);
          setPopup((prev) => ({ ...prev, visible: false }));
        },
      });

      // Register cancel handler for external access
      const handleCancel = () => {
        resolve(false);
        setPopup((prev) => ({ ...prev, visible: false }));
      };

      window.__confirmCancelHandler = handleCancel;
    });
  }, []);

  return { popup, showPopup, hidePopup, showConfirm };
}