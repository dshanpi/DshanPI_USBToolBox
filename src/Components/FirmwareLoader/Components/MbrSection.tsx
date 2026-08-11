import React from 'react';
import { useTranslation } from 'react-i18next';
import { MbrInfo } from '../../../FlashConfig';
import { formatSize, formatHex } from '../../../Utils';

interface MbrSectionProps {
  mbrInfo: MbrInfo;
}

export const MbrSection: React.FC<MbrSectionProps> = ({ mbrInfo }) => {
  const { t } = useTranslation();

  return (
    <div className="mbr-info">
      <h3>{t('firmwareLoader.mbr.title', 'MBR 信息')}</h3>
      <div className="info-grid">
        <div className="info-item">
          <span className="label">{t('firmwareLoader.mbr.magic', 'Magic')}</span>
          <span className="value">{mbrInfo.magic}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.mbr.version', '版本')}</span>
          <span className="value">{formatHex(mbrInfo.version)}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.mbr.partitionCount', '分区数')}</span>
          <span className="value">{mbrInfo.partCount}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.mbr.crc32', 'CRC32')}</span>
          <span className="value">{formatHex(mbrInfo.crc32)}</span>
        </div>
      </div>
      {mbrInfo.partitions.length > 0 && (
        <div className="mbr-partitions">
          <h4>{t('firmwareLoader.mbr.partitions', 'MBR 分区')}</h4>
          <table className="mbr-table">
            <thead>
              <tr>
                <th>{t('firmwareLoader.mbr.name', '名称')}</th>
                <th>{t('firmwareLoader.mbr.address', '地址')}</th>
                <th>{t('firmwareLoader.mbr.lengthSector', '长度 (扇区)')}</th>
                <th>{t('firmwareLoader.mbr.lengthBytes', '长度 (字节)')}</th>
                <th>{t('firmwareLoader.mbr.readonly', '只读')}</th>
              </tr>
            </thead>
            <tbody>
              {mbrInfo.partitions.map((part, index) => (
                <tr key={index}>
                  <td>{part.name}</td>
                  <td>{formatHex(part.address)}</td>
                  <td>{Number(part.length)}</td>
                  <td>{formatSize(Number(part.length) * 512)}</td>
                  <td>{part.readonly ? t('common.yes', '是') : t('common.no', '否')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MbrSection;
