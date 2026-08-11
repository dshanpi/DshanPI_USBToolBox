import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faChevronLeft, faChevronRight, faCircleUser, faCog, faUser } from '@fortawesome/free-solid-svg-icons';
import packageJson from '../../../package.json';
import './Sidebar.css';

/**
 * Tool item configuration for sidebar navigation.
 *
 * Defines a single tool entry in the sidebar navigation,
 * including its identifier, display name, icon, and optional description.
 */
export interface ToolItem {
  /** Unique tool identifier */
  id: string;
  /** Display name shown in sidebar */
  name: string;
  /** FontAwesome icon definition */
  icon: IconDefinition;
  /** Optional tooltip/description text */
  description?: string;
}

/**
 * Sidebar component props.
 *
 * Configuration for the sidebar navigation panel including
 * tool list, active state, and interaction callbacks.
 */
interface SidebarProps {
  /** Available tool items for navigation */
  tools: ToolItem[];
  /** Currently active tool ID */
  activeTool: string;
  /** Callback when a tool is selected */
  onToolSelect: (toolId: string) => void;
  /** Whether sidebar is collapsed */
  collapsed: boolean;
  /** Callback to toggle collapse state */
  onToggleCollapse: () => void;
  /** Optional callback for settings button */
  onSettingsClick?: () => void;
  /** Optional callback for login button */
  onLoginClick?: () => void;
  /** Optional logged-in user display name (null/undefined shows "登录") */
  authUserName?: string | null;
  /** Whether sidebar interactions are locked */
  locked?: boolean;
  /** Optional node rendered in a dedicated area between the nav and the
   *  login/settings footer (e.g. the global device connection button). */
  controlArea?: React.ReactNode;
}

/**
 * Sidebar navigation component.
 *
 * Sidebar provides the main navigation interface for the application,
 * displaying a collapsible list of tool buttons with icons and names.
 * It includes an expand/collapse toggle, version display, and settings access.
 *
 * When collapsed, only icons are shown. When expanded, tool names and
 * application title are visible. The sidebar can be locked to prevent
 * navigation changes during operations like flashing.
 *
 * Features:
 * - Animated tool buttons with hover/tap effects
 * - Version number display from package.json
 * - Internationalized labels via react-i18next
 * - Disabled state when locked
 *
 * Example usage:
 * ```tsx
 * const tools: ToolItem[] = [
 *   { id: 'loader', name: 'Firmware Loader', icon: faDownload },
 *   { id: 'flasher', name: 'Device Flash', icon: faBolt },
 * ];
 * <Sidebar
 *   tools={tools}
 *   activeTool="loader"
 *   onToolSelect={setActiveTool}
 *   collapsed={isCollapsed}
 *   onToggleCollapse={toggleCollapse}
 * />
 * ```
 */
export const Sidebar: React.FC<SidebarProps> = ({
  tools,
  activeTool,
  onToolSelect,
  collapsed,
  onToggleCollapse,
  onSettingsClick,
  onLoginClick,
  authUserName,
  locked = false,
  controlArea,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${locked ? 'sidebar--locked' : ''}`}
    >
      <div className="sidebar-header">
        {!collapsed && (
          <>
            <h1>
              {t('sidebar.title')} <span className="sidebar-version">v{packageJson.version}</span>
            </h1>
            <span className="sidebar-subtitle">{t('sidebar.subtitle')}</span>
          </>
        )}
        <motion.button
          className="sidebar-toggle"
          onClick={onToggleCollapse}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          disabled={locked}
          whileHover={{ scale: locked ? 1 : 1.05 }}
          whileTap={{ scale: locked ? 1 : 0.95 }}
          transition={{ duration: 0.1 }}
        >
          <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} />
        </motion.button>
      </div>
      <nav className="sidebar-nav">
        {tools.map((tool) => {
          const isActive = activeTool === tool.id;
          const isDisabled = locked && !isActive;
          return (
            <motion.button
              key={tool.id}
              className={`sidebar-item ${isActive ? 'active' : ''} ${isDisabled ? 'sidebar-item--disabled' : ''}`}
              onClick={() => !isDisabled && onToolSelect(tool.id)}
              title={collapsed ? tool.name : tool.description}
              disabled={isDisabled}
              whileHover={{ scale: isDisabled ? 1 : 1.02 }}
              whileTap={{ scale: isDisabled ? 1 : 0.98 }}
              transition={{ duration: 0.1 }}
            >
              <span className="sidebar-item-icon">
                <FontAwesomeIcon icon={tool.icon} />
              </span>
              {!collapsed && <span className="sidebar-item-name">{tool.name}</span>}
            </motion.button>
          );
        })}
      </nav>
      {controlArea && <div className="sidebar-control-area">{controlArea}</div>}
      <div className="sidebar-footer">
        {onLoginClick && (
          <motion.button
            className="sidebar-footer-btn"
            onClick={onLoginClick}
            title={authUserName ? authUserName : t('sidebar.login')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.1 }}
          >
            <FontAwesomeIcon icon={authUserName ? faCircleUser : faUser} />
            {!collapsed && <span>{authUserName ? authUserName : t('sidebar.login')}</span>}
          </motion.button>
        )}
        {onSettingsClick && (
          <motion.button
            className="sidebar-footer-btn"
            onClick={onSettingsClick}
            title={t('sidebar.settings')}
            disabled={locked}
            whileHover={{ scale: locked ? 1 : 1.02 }}
            whileTap={{ scale: locked ? 1 : 0.98 }}
            transition={{ duration: 0.1 }}
          >
            <FontAwesomeIcon icon={faCog} />
            {!collapsed && <span>{t('sidebar.settings')}</span>}
          </motion.button>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
