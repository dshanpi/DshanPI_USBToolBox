import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AdbFileInfo } from '../../../Services';
import { formatSize, formatDateTime } from '../../../Utils';

interface PropertiesModalProps {
  item: AdbFileInfo;
  onClose: () => void;
}

export const PropertiesModal: React.FC<PropertiesModalProps> = ({ item, onClose }) => {
  const { t } = useTranslation();

  return (
    <div className="nautilus-modal-overlay" onClick={onClose}>
      <div className="nautilus-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nautilus-modal-header">
          <h3>{t('adbExplorer.properties', '属性')}</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="nautilus-modal-content">
          <div className="nautilus-property-row">
            <span className="nautilus-property-label">{t('adbExplorer.fileName', '文件名')}</span>
            <span className="nautilus-property-value">{item.name}</span>
          </div>
          <div className="nautilus-property-row">
            <span className="nautilus-property-label">{t('adbExplorer.filePath', '文件路径')}</span>
            <span className="nautilus-property-value">{item.path}</span>
          </div>
          <div className="nautilus-property-row">
            <span className="nautilus-property-label">{t('adbExplorer.type', '类型')}</span>
            <span className="nautilus-property-value">
              {item.is_directory
                ? t('adbExplorer.folder', '文件夹')
                : t('adbExplorer.file', '文件')}
            </span>
          </div>
          {!item.is_directory && (
            <div className="nautilus-property-row">
              <span className="nautilus-property-label">
                {t('adbExplorer.fileSize', '文件大小')}
              </span>
              <span className="nautilus-property-value">{formatSize(item.size)}</span>
            </div>
          )}
          <div className="nautilus-property-row">
            <span className="nautilus-property-label">
              {t('adbExplorer.modifiedTime', '修改时间')}
            </span>
            <span className="nautilus-property-value">{formatDateTime(item.modified_time)}</span>
          </div>
          <div className="nautilus-property-row">
            <span className="nautilus-property-label">
              {t('adbExplorer.filePermissions', '文件权限')}
            </span>
            <span className="nautilus-property-value">{item.permissions || '-'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
