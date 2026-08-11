import React from 'react';
import './PageContainer.css';

/**
 * PageContainer component props.
 *
 * Configuration for the page wrapper including title,
 * optional description, and content children.
 */
interface PageContainerProps {
  /** Page title displayed in header */
  title: string;
  /** Optional page description text */
  description?: string;
  /** Page content children */
  children: React.ReactNode;
}

/**
 * Page container wrapper component.
 *
 * PageContainer provides a consistent layout wrapper for tool pages,
 * including a header section with title and optional description,
 * followed by a content area for the tool's main interface.
 *
 * This component ensures visual consistency across all tool pages
 * by applying standard styling and structure.
 *
 * Example usage:
 * ```tsx
 * <PageContainer
 *   title="Firmware Loader"
 *   description="Load and parse firmware images for flashing."
 * >
 *   <FirmwareLoaderContent />
 * </PageContainer>
 * ```
 */
export const PageContainer: React.FC<PageContainerProps> = ({ title, description, children }) => {
  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">{title}</h2>
        {description && <p className="page-description">{description}</p>}
      </div>
      <div className="page-content">{children}</div>
    </div>
  );
};

export default PageContainer;