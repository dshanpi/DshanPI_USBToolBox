import React, { useEffect, useState, useCallback } from 'react';
import './Popup.css';

/**
 * Popup display type enumeration.
 *
 * Defines the visual style and behavior of popup notifications.
 */
export type PopupType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

/**
 * Popup state structure for usePopup hook.
 *
 * Represents the current popup configuration for display
 * through the Popup component.
 */
export interface PopupState {
  /** Whether popup is currently visible */
  visible: boolean;
  /** Popup visual type */
  type: PopupType;
  /** Popup title text */
  title: string;
  /** Popup message content */
  message: string;
  /** Optional callback for confirm type popups */
  onConfirm?: () => void;
}

/**
 * Popup component props.
 *
 * Configuration for popup display including type, content,
 * timing, and action callbacks.
 */
interface PopupProps {
  /** Whether popup is visible */
  visible: boolean;
  /** Popup visual type (default: 'info') */
  type?: PopupType;
  /** Title text to display */
  title?: string;
  /** Message content (supports HTML) */
  message?: string;
  /** Auto-close duration in milliseconds */
  duration?: number;
  /** Callback when popup closes */
  onClose?: () => void;
  /** Callback when confirm button clicked */
  onConfirm?: () => void;
  /** Custom confirm button text */
  confirmText?: string;
  /** Custom cancel button text */
  cancelText?: string;
}

/**
 * Popup notification and confirmation dialog component.
 *
 * Popup provides modal notifications for user feedback and
 * confirmation dialogs for critical actions. It supports
 * multiple visual types (success, error, warning, info, confirm)
 * with appropriate icons and styling.
 *
 * For non-confirm types, popups auto-close on overlay click
 * or after a specified duration. Confirm popups display
 * cancel/confirm buttons and require user interaction.
 *
 * Features:
 * - Auto-dismiss after configurable duration
 * - Click-outside-to-close for non-confirm types
 * - HTML support in message content
 * - Internationalized button text defaults
 * - Animated visibility transitions
 *
 * Example usage:
 * ```tsx
 * // Info notification with auto-close
 * <Popup
 *   visible={showInfo}
 *   type="info"
 *   title="Update Available"
 *   message="A new firmware version is available."
 *   duration={3000}
 *   onClose={() => setShowInfo(false)}
 * />
 *
 * // Confirmation dialog
 * <Popup
 *   visible={showConfirm}
 *   type="confirm"
 *   title="Confirm Flash"
 *   message="This will erase all data on the device."
 *   onConfirm={handleFlash}
 *   onClose={() => setShowConfirm(false)}
 *   confirmText="Flash"
 *   cancelText="Cancel"
 * />
 * ```
 */
export const Popup: React.FC<PopupProps> = ({
  visible,
  type = 'info',
  title,
  message,
  duration,
  onClose,
  onConfirm,
  confirmText,
  cancelText,
}) => {
  const [show, setShow] = useState(visible);

  /**
   * Handles popup close action.
   *
   * Hides popup and invokes onClose callback if provided.
   */
  const handleClose = useCallback(() => {
    setShow(false);
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  /**
   * Handles confirm button action.
   *
   * Hides popup and invokes onConfirm callback if provided.
   */
  const handleConfirm = useCallback(() => {
    setShow(false);
    if (onConfirm) {
      onConfirm();
    }
  }, [onConfirm]);

  // Sync show state with visible prop changes
  useEffect(() => {
    setShow(visible);
  }, [visible]);

  // Auto-close timer for non-confirm types with duration
  useEffect(() => {
    if (visible && duration && duration > 0 && type !== 'confirm') {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, handleClose, type]);

  if (!show) return null;

  const isConfirmType = type === 'confirm';

  return (
    <div className="popup-overlay" onClick={isConfirmType ? undefined : handleClose}>
      <div
        className={`popup popup-${isConfirmType ? 'warning' : type}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="popup-header">
          <div className="popup-icon">
            {type === 'success' && '✓'}
            {type === 'error' && '✕'}
            {type === 'warning' && '!'}
            {type === 'info' && 'i'}
            {type === 'confirm' && '?'}
          </div>
          {title && <div className="popup-title">{title}</div>}
          {!isConfirmType && (
            <button className="popup-close" onClick={handleClose}>
              ✕
            </button>
          )}
        </div>
        {message && <div className="popup-message" dangerouslySetInnerHTML={{ __html: message }} />}
        {isConfirmType && (
          <div className="popup-buttons">
            <button className="popup-btn popup-btn-cancel" onClick={handleClose}>
              {cancelText || '取消'}
            </button>
            <button className="popup-btn popup-btn-confirm" onClick={handleConfirm}>
              {confirmText || '确认'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Popup;