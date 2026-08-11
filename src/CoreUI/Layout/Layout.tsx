import React from 'react';
import { Sidebar, ToolItem } from '../Sidebar';
import './Layout.css';

/**
 * Layout component props.
 *
 * Defines the configuration for the main application layout
 * including sidebar state and navigation callbacks.
 */
interface LayoutProps {
  /** Available tool items for sidebar navigation */
  tools: ToolItem[];
  /** Currently active tool ID */
  activeTool: string;
  /** Callback when a tool is selected */
  onToolSelect: (toolId: string) => void;
  /** Whether sidebar is collapsed */
  sidebarCollapsed: boolean;
  /** Callback to toggle sidebar collapse state */
  onToggleSidebar: () => void;
  /** Optional callback for settings button click */
  onSettingsClick?: () => void;
  /** Optional callback for login button click */
  onLoginClick?: () => void;
  /** Optional logged-in user display name (null/undefined shows "登录") */
  authUserName?: string | null;
  /** Whether sidebar interactions are locked */
  sidebarLocked?: boolean;
  /** Optional node rendered in a dedicated sidebar area above the login/settings footer. */
  controlArea?: React.ReactNode;
  /** Main content area children */
  children: React.ReactNode;
}

/**
 * Main application layout component.
 *
 * Layout provides the structural container for the application,
 * combining a collapsible sidebar for tool navigation with
 * a main content area for active tool pages.
 *
 * The sidebar displays the application title, tool navigation
 * buttons, and settings access. The main area renders the
 * active tool's content passed as children.
 *
 * Example usage:
 * ```tsx
 * <Layout
 *   tools={toolItems}
 *   activeTool="firmware-loader"
 *   onToolSelect={handleToolSelect}
 *   sidebarCollapsed={isCollapsed}
 *   onToggleSidebar={toggleSidebar}
 * >
 *   <FirmwareLoader />
 * </Layout>
 * ```
 */
export const Layout: React.FC<LayoutProps> = ({
  tools,
  activeTool,
  onToolSelect,
  sidebarCollapsed,
  onToggleSidebar,
  onSettingsClick,
  onLoginClick,
  authUserName,
  sidebarLocked = false,
  controlArea,
  children,
}) => {
  return (
    <div className="layout">
      <Sidebar
        tools={tools}
        activeTool={activeTool}
        onToolSelect={onToolSelect}
        collapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        onSettingsClick={onSettingsClick}
        onLoginClick={onLoginClick}
        authUserName={authUserName}
        locked={sidebarLocked}
        controlArea={controlArea}
      />
      <main className="layout-main">{children}</main>
    </div>
  );
};

export default Layout;