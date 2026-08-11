import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericImageInfo } from '../Hooks/useGenericImageLoader';
import { DiskPartition, GptPartition, MbrPartition } from '../../../Library/DiskParser';
import { formatSize } from '../../../Utils';

interface ImageInfoProps {
  genericImageInfo: GenericImageInfo | null;
  partitions: DiskPartition[];
  diskType: 'gpt' | 'mbr' | 'raw';
  disabled: boolean;
}

export const ImageInfo: React.FC<ImageInfoProps> = ({
  genericImageInfo,
  partitions,
  diskType,
  disabled: _disabled,
}) => {
  const { t } = useTranslation();

  const renderImageInfo = () => {
    if (!genericImageInfo) return null;

    return (
      <div className="gf-info-grid">
        <div className="gf-info-item">
          <span className="gf-info-label">{t('genericFlash.imageInfo.size', '镜像大小')}</span>
          <span className="gf-info-value">{formatSize(genericImageInfo.size)}</span>
        </div>
        <div className="gf-info-item">
          <span className="gf-info-label">{t('genericFlash.imageInfo.sectors', '扇区数')}</span>
          <span className="gf-info-value">{Math.ceil(genericImageInfo.size / 512)}</span>
        </div>
        <div className="gf-info-item">
          <span className="gf-info-label">{t('genericFlash.imageInfo.type', '镜像类型')}</span>
          <span className="gf-info-value">
            {diskType === 'gpt'
              ? t('genericFlash.imageInfo.gptImage', 'GPT 镜像')
              : diskType === 'mbr'
                ? t('genericFlash.imageInfo.mbrImage', 'MBR 镜像')
                : t('genericFlash.imageInfo.rawImage', '原始镜像')}
          </span>
        </div>
        <div className="gf-info-item">
          <span className="gf-info-label">
            {t('genericFlash.imageInfo.writeAddress', '写入地址')}
          </span>
          <span className="gf-info-value gf-mono">0x00000000</span>
        </div>
      </div>
    );
  };

  const renderDiskGuidInfo = () => {
    if (!genericImageInfo?.diskInfo) return null;

    const { gpt_info, mbr_info } = genericImageInfo.diskInfo;

    if (diskType === 'gpt' && gpt_info) {
      return (
        <div className="gf-disk-info">
          <div className="gf-info-item">
            <span className="gf-info-label">
              {t('genericFlash.imageInfo.diskGuid', '磁盘 GUID')}
            </span>
            <span className="gf-info-value gf-mono gf-guid">{gpt_info.header.disk_guid}</span>
          </div>
          <div className="gf-info-item">
            <span className="gf-info-label">
              {t('genericFlash.imageInfo.partitionCount', '分区数量')}
            </span>
            <span className="gf-info-value">{gpt_info.header.partition_count}</span>
          </div>
        </div>
      );
    }

    if (diskType === 'mbr' && mbr_info) {
      return (
        <div className="gf-disk-info">
          <div className="gf-info-item">
            <span className="gf-info-label">
              {t('genericFlash.imageInfo.diskSignature', '磁盘签名')}
            </span>
            <span className="gf-info-value gf-mono">
              0x{mbr_info.disk_signature.toString(16).padStart(8, '0').toUpperCase()}
            </span>
          </div>
          <div className="gf-info-item">
            <span className="gf-info-label">
              {t('genericFlash.imageInfo.partitionCount', '分区数量')}
            </span>
            <span className="gf-info-value">{mbr_info.partition_count}</span>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderPartitionTable = () => {
    if (partitions.length === 0) return null;

    if (diskType === 'gpt') {
      return (
        <table className="gf-partition-table">
          <thead>
            <tr>
              <th>{t('genericFlash.partitionTable.name', '分区名称')}</th>
              <th>{t('genericFlash.partitionTable.startLba', '起始扇区')}</th>
              <th>{t('genericFlash.partitionTable.size', '大小')}</th>
              <th>{t('genericFlash.partitionTable.typeGuid', '类型 GUID')}</th>
            </tr>
          </thead>
          <tbody>
            {partitions.map((partition, index) => {
              const gptPart = partition as GptPartition;
              return (
                <tr key={index}>
                  <td className="gf-partition-name">{gptPart.name || `Partition ${index}`}</td>
                  <td className="gf-mono">{gptPart.start_lba}</td>
                  <td className="gf-mono">{formatSize(gptPart.size)}</td>
                  <td className="gf-mono gf-guid">{gptPart.partition_type_guid}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }

    if (diskType === 'mbr') {
      return (
        <table className="gf-partition-table mbr-table">
          <thead>
            <tr>
              <th>{t('genericFlash.partitionTable.index', '序号')}</th>
              <th>{t('genericFlash.partitionTable.startLba', '起始扇区')}</th>
              <th>{t('genericFlash.partitionTable.size', '大小')}</th>
              <th>{t('genericFlash.partitionTable.typeName', '类型')}</th>
              <th>{t('genericFlash.partitionTable.bootable', '启动')}</th>
            </tr>
          </thead>
          <tbody>
            {partitions.map((partition, index) => {
              const mbrPart = partition as MbrPartition;
              return (
                <tr key={index}>
                  <td className="gf-mono">{mbrPart.index}</td>
                  <td className="gf-mono">{mbrPart.start_lba}</td>
                  <td className="gf-mono">{formatSize(mbrPart.size)}</td>
                  <td>{mbrPart.partition_type_name}</td>
                  <td className="gf-bootable">{mbrPart.bootable ? '✓' : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }

    return null;
  };

  return (
    <div className="gf-image-info-container">
      <div className="gf-section-header">{t('genericFlash.imageInfo.title', '镜像信息')}</div>
      <div className="gf-image-info-scroll">
        {!genericImageInfo ? (
          <div className="gf-empty-info">
            {t('genericFlash.imageInfo.noImage', '请选择通用固件镜像文件')}
          </div>
        ) : (
          <div className="gf-info-content">
            {renderImageInfo()}
            {renderDiskGuidInfo()}
            {partitions.length > 0 && (
              <div className="gf-partition-section">
                <div className="gf-subsection-header">
                  {diskType === 'gpt'
                    ? t('genericFlash.partitionTable.gptTitle', '分区表 (GPT)')
                    : t('genericFlash.partitionTable.mbrTitle', '分区表 (MBR)')}
                </div>
                {renderPartitionTable()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
