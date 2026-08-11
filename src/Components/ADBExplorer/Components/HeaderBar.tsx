import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AdbFileInfo } from '../../../Services';

interface HeaderBarProps {
  parentPath: string | null;
  pathParts: string[];
  loading: boolean;
  hasClipboard: boolean;
  editingFile: AdbFileInfo | null;
  hasUnsavedChanges: boolean;
  viewMode: 'grid' | 'list';
  onGoToParent: () => void;
  onNavigateToPath: (index: number) => void;
  onRefresh: () => void;
  onPaste: () => void;
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onCloseEditor: () => void;
  onSaveFile: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  parentPath,
  pathParts,
  loading,
  hasClipboard,
  editingFile,
  hasUnsavedChanges,
  viewMode,
  onGoToParent,
  onNavigateToPath,
  onRefresh,
  onPaste,
  onViewModeChange,
  onCloseEditor,
  onSaveFile,
}) => {
  const { t } = useTranslation();

  return (
    <div className="nautilus-headerbar">
      <div className="nautilus-headerbar-left">
        <button
          className="nautilus-nav-btn"
          onClick={editingFile ? onCloseEditor : onGoToParent}
          disabled={editingFile ? false : !parentPath || loading}
          title={
            editingFile
              ? t('adbExplorer.closeEditor', '关闭编辑器')
              : t('adbExplorer.goToParent', '返回上级')
          }
        >
          ◀
        </button>
        <div className="nautilus-pathbar">
          {editingFile ? (
            <>
              <button className="nautilus-path-segment" onClick={onCloseEditor} disabled={loading}>
                /
              </button>
              {editingFile.path
                .split('/')
                .filter(Boolean)
                .slice(0, -1)
                .map((part, index, _arr) => (
                  <React.Fragment key={index}>
                    <span className="nautilus-path-arrow">›</span>
                    <button
                      className="nautilus-path-segment"
                      onClick={onCloseEditor}
                      disabled={loading}
                    >
                      {part}
                    </button>
                  </React.Fragment>
                ))}
              <span className="nautilus-path-arrow">›</span>
              <span className="nautilus-path-segment nautilus-edit-indicator">
                ✏️ {t('adbExplorer.edit', '编辑')}: {editingFile.name}
                {hasUnsavedChanges && <span className="nautilus-edit-modified">*</span>}
              </span>
            </>
          ) : (
            <>
              <button
                className="nautilus-path-segment"
                onClick={() => onNavigateToPath(-1)}
                disabled={loading}
              >
                /
              </button>
              {pathParts.map((part, index) => (
                <React.Fragment key={index}>
                  <span className="nautilus-path-arrow">›</span>
                  <button
                    className={`nautilus-path-segment ${index === pathParts.length - 1 ? 'active' : ''}`}
                    onClick={() => onNavigateToPath(index)}
                    disabled={loading}
                  >
                    {part}
                  </button>
                </React.Fragment>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="nautilus-headerbar-right">
        {editingFile ? (
          <>
            <button
              className="nautilus-action-btn nautilus-save-btn"
              onClick={onSaveFile}
              disabled={!hasUnsavedChanges || loading}
              title={t('common.save', '保存')}
            >
              💾
            </button>
            <button
              className="nautilus-action-btn"
              onClick={onCloseEditor}
              disabled={loading}
              title={t('common.cancel', '取消')}
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <div className="nautilus-view-toggle">
              <button
                className={`nautilus-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => onViewModeChange('grid')}
                disabled={loading}
                title={t('adbExplorer.gridView', '网格视图')}
              >
                ⊞
              </button>
              <button
                className={`nautilus-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => onViewModeChange('list')}
                disabled={loading}
                title={t('adbExplorer.listView', '列表视图')}
              >
                ☰
              </button>
            </div>
            {hasClipboard && (
              <button
                className="nautilus-action-btn"
                onClick={onPaste}
                disabled={loading}
                title={t('adbExplorer.paste', '粘贴')}
              >
                📋
              </button>
            )}
            <button
              className="nautilus-action-btn"
              onClick={onRefresh}
              disabled={loading}
              title={t('adbExplorer.refreshFiles', '刷新文件列表')}
            >
              ⟳
            </button>
          </>
        )}
      </div>
    </div>
  );
};
