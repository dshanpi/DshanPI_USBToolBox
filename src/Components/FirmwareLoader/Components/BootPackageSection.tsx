import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { save, message } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { BootPackage, Toc1Item, BootPackageParser } from '../../../FlashConfig';
import { formatSize, formatHex } from '../../../Utils';

interface BootPackageSectionProps {
  bootPackage: BootPackage;
  bootPackageData: Uint8Array;
}

export const BootPackageSection: React.FC<BootPackageSectionProps> = ({
  bootPackage,
  bootPackageData,
}) => {
  const { t } = useTranslation();

  const handleExtractItem = useCallback(
    async (item: Toc1Item) => {
      // Get item data
      const itemData = await BootPackageParser.getItemDataByIndex(
        bootPackageData,
        bootPackage.items.indexOf(item)
      );

      if (!itemData) {
        await message(t('firmwareLoader.bootPackage.extractFailed'), {
          title: t('common.error'),
          kind: 'error',
        });
        return;
      }

      // Determine file extension using existing utilities
      const baseName = BootPackageParser.getBaseItemName(item.name);
      const compression = BootPackageParser.getCompressionType(item.name);
      const extension = compression ? `.bin.${compression}` : '.bin';
      const defaultName = `${baseName}${extension}`;

      const savePath = await save({
        defaultPath: defaultName,
        filters: [
          {
            name: 'Binary Files',
            extensions: ['bin', 'gz', 'lz4', 'lzma', 'zstd'],
          },
        ],
      });

      if (!savePath) {
        return;
      }

      try {
        await writeFile(savePath, itemData);
        await message(t('firmwareLoader.bootPackage.saved', { path: savePath }), {
          title: t('firmwareLoader.bootPackage.saveComplete'),
          kind: 'info',
        });
      } catch (err) {
        await message(`${t('firmwareLoader.bootPackage.saveFailed')}: ${err}`, {
          title: t('common.error'),
          kind: 'error',
        });
      }
    },
    [bootPackageData, bootPackage, t]
  );

  const getItemTypeName = (type: number): string => {
    switch (type) {
      case 0:
        return t('firmwareLoader.bootPackage.typeNormal', '普通文件');
      case 1:
        return t('firmwareLoader.bootPackage.typeKeyCert', '密钥证书');
      case 2:
        return t('firmwareLoader.bootPackage.typeSignCert', '签名证书');
      case 3:
        return t('firmwareLoader.bootPackage.typeBin', '可执行文件');
      default:
        return t('common.unknown', '未知');
    }
  };

  return (
    <div className="boot-package-section">
      <h3>{t('firmwareLoader.bootPackage.title', 'Boot Package (TOC1)')}</h3>

      <div className="boot-package-header">
        <div className="info-row">
          <span className="label">{t('firmwareLoader.bootPackage.name', '名称')}:</span>
          <span className="value">{bootPackage.name}</span>
        </div>
        <div className="info-row">
          <span className="label">{t('firmwareLoader.bootPackage.magic', 'Magic')}:</span>
          <span className="value">{formatHex(bootPackage.magic)}</span>
        </div>
        <div className="info-row">
          <span className="label">{t('firmwareLoader.bootPackage.itemsCount', '项目数量')}:</span>
          <span className="value">{bootPackage.items_nr}</span>
        </div>
        <div className="info-row">
          <span className="label">{t('firmwareLoader.bootPackage.validLen', '有效长度')}:</span>
          <span className="value">{formatSize(bootPackage.valid_len)}</span>
        </div>
      </div>

      <h4>{t('firmwareLoader.bootPackage.items', '项目列表')}</h4>
      <table className="boot-package-items-table">
        <thead>
          <tr>
            <th>{t('firmwareLoader.bootPackage.itemName', '名称')}</th>
            <th>{t('firmwareLoader.bootPackage.itemType', '类型')}</th>
            <th>{t('firmwareLoader.bootPackage.size', '大小')}</th>
            <th>{t('firmwareLoader.bootPackage.offset', '偏移')}</th>
            <th>{t('firmwareLoader.bootPackage.runAddr', '运行地址')}</th>
            <th>{t('firmwareLoader.bootPackage.compressed', '压缩')}</th>
            <th>{t('firmwareLoader.bootPackage.encrypted', '加密')}</th>
            <th>{t('firmwareLoader.bootPackage.action', '操作')}</th>
          </tr>
        </thead>
        <tbody>
          {bootPackage.items.map((item: Toc1Item, index: number) => {
            const isCompressed = BootPackageParser.isCompressed(item.name);
            const compressionType = BootPackageParser.getCompressionType(item.name);
            const isExtractable = BootPackageParser.isExtractable(item);
            const description = BootPackageParser.getItemDescription(item.name);

            return (
              <tr key={index}>
                <td title={description}>
                  {item.name}
                  {isCompressed && (
                    <span className="compression-badge">
                      {compressionType?.toUpperCase()}
                    </span>
                  )}
                </td>
                <td>{getItemTypeName(item.item_type)}</td>
                <td>{formatSize(item.data_len)}</td>
                <td>{formatHex(item.data_offset)}</td>
                <td>{item.run_addr ? formatHex(item.run_addr) : '-'}</td>
                <td>{isCompressed ? compressionType?.toUpperCase() : '-'}</td>
                <td>{item.encrypt ? t('common.yes') : t('common.no')}</td>
                <td>
                  {isExtractable ? (
                    <button
                      onClick={() => handleExtractItem(item)}
                      className="extract-button"
                      disabled={item.encrypt === 1}
                      title={
                        item.encrypt === 1
                          ? t('firmwareLoader.bootPackage.encryptedCannotExtract')
                          : t('firmwareLoader.bootPackage.extractItem')
                      }
                    >
                      {t('common.extract')}
                    </button>
                  ) : (
                    <span className="not-extractable">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default BootPackageSection;