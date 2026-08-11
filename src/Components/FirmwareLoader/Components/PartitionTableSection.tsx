import React from 'react';
import { useTranslation } from 'react-i18next';
import { Partition } from '../../../Library/OpenixIMG';
import { formatSize, formatHex } from '../../../Utils';

interface PartitionTableSectionProps {
  partitions: Partition[];
  onExtract: (partition: Partition) => void;
}

export const PartitionTableSection: React.FC<PartitionTableSectionProps> = ({
  partitions,
  onExtract,
}) => {
  const { t } = useTranslation();

  const renderFlags = (partition: Partition): string => {
    const flags: string[] = [];
    if (partition.keydata) flags.push('K');
    if (partition.encrypt) flags.push('E');
    if (partition.verify) flags.push('V');
    if (partition.ro) flags.push('R');
    return flags.length > 0 ? flags.join('') : '-';
  };

  return (
    <div className="partitions-section">
      <h3>{t('firmwareLoader.partitionTable.title', '分区表')}</h3>
      <table className="partitions-table">
        <thead>
          <tr>
            <th>{t('firmwareLoader.partitionTable.name', '名称')}</th>
            <th>{t('firmwareLoader.partitionTable.sizeSector', '大小 (扇区)')}</th>
            <th>{t('firmwareLoader.partitionTable.sizeBytes', '大小 (字节)')}</th>
            <th>{t('firmwareLoader.partitionTable.downloadFile', '下载文件')}</th>
            <th>{t('firmwareLoader.partitionTable.userType', '用户类型')}</th>
            <th>{t('firmwareLoader.partitionTable.flags', '标志')}</th>
            <th>{t('firmwareLoader.partitionTable.action', '操作')}</th>
          </tr>
        </thead>
        <tbody>
          {partitions.map((partition, index) => (
            <tr key={index}>
              <td>{partition.name}</td>
              <td>{partition.size}</td>
              <td>{formatSize(partition.size * 512)}</td>
              <td>{partition.downloadfile || '-'}</td>
              <td>{formatHex(partition.user_type)}</td>
              <td>{renderFlags(partition)}</td>
              <td>
                {partition.downloadfile && (
                  <button onClick={() => onExtract(partition)} className="extract-button">
                    {t('common.extract', '提取')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flags-legend">
        <span>{t('firmwareLoader.partitionTable.flagsLegend.K', 'K = KeyData')}</span>
        <span>{t('firmwareLoader.partitionTable.flagsLegend.E', 'E = Encrypt')}</span>
        <span>{t('firmwareLoader.partitionTable.flagsLegend.V', 'V = Verify')}</span>
        <span>{t('firmwareLoader.partitionTable.flagsLegend.R', 'R = Read-Only')}</span>
        <span>{t('firmwareLoader.partitionTable.flagsLegend.none', '- = None')}</span>
      </div>
    </div>
  );
};

export default PartitionTableSection;
