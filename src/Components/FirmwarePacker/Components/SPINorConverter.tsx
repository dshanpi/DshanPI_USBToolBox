import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import {
  OpenixPacker,
  Partition,
  getPartitionData,
  OpenixPartition,
  getDtb,
  getUboot,
} from '../../../Library/OpenixIMG';
import { getFlashMap, extractDtbFromUboot, FlashMapInfo } from '../../../Library/FDT';
import { LogEntry } from '../Types';
import { formatSize } from '../Utils';
import { Popup, PopupType } from '../../../CoreUI';
import { invokeCommand } from '../../../Platform/IPC';

interface SPINorConverterProps {
  addLog: (level: LogEntry['level'], message: string) => void;
}

interface PartitionEntry {
  name: string;
  size: number;
  download_file: string;
  user_type: number;
  keydata: boolean;
  encrypt: boolean;
  verify: boolean;
  ro: boolean;
}

interface SpinorMergeConfig {
  output_path: string;
  logic_start: number;
  uboot_start: number;
  partitions: PartitionEntry[];
  firmware_path: string;
  nor_size: number;
}

interface SpinorMergeResult {
  success: boolean;
  message: string;
  output_size: number;
}

function generateOutputPath(inputPath: string): string {
  const lastDot = inputPath.lastIndexOf('.');
  if (lastDot === -1) {
    return `${inputPath}_full_img.bin`;
  }
  const basePath = inputPath.substring(0, lastDot);
  return `${basePath}_full_img.bin`;
}

export const SPINorConverter: React.FC<SPINorConverterProps> = ({ addLog }) => {
  const { t } = useTranslation();
  const [firmwarePath, setFirmwarePath] = useState<string>('');
  const [logicStart, setLogicStart] = useState<string>('1024');
  const [ubootStart, setUbootStart] = useState<string>('48');
  const [norSize, setNorSize] = useState<string>('16');
  const [loading, setLoading] = useState(false);
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [flashMap, setFlashMap] = useState<FlashMapInfo | null>(null);
  const [autoDetected, setAutoDetected] = useState(false);
  const [popup, setPopup] = useState<{
    visible: boolean;
    type: PopupType;
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'error',
    title: '',
    message: '',
  });

  const showPopup = useCallback((type: PopupType, title: string, message: string) => {
    setPopup({ visible: true, type, title, message });
  }, []);

  const handleSelectFirmware = useCallback(async () => {
    const selected = await open({
      multiple: false,
      title: t('firmwarePacker.spinor.selectFirmware', '选择固件文件'),
      filters: [{ name: 'Image', extensions: ['img'] }],
    });
    if (selected) {
      setFirmwarePath(selected as string);
      addLog(
        'INFO',
        t('firmwarePacker.spinor.firmwareSelected', '已选择固件: {{path}}', { path: selected })
      );

      const newPacker = new OpenixPacker();
      const success = await newPacker.loadImageFromPath(selected as string);
      if (!success) {
        addLog('ERRO', t('firmwarePacker.spinor.loadFailed', '加载固件失败'));
        showPopup(
          'error',
          t('firmwarePacker.spinor.loadError', '加载错误'),
          t('firmwarePacker.spinor.loadFailed', '加载固件失败')
        );
        return;
      }

      const imageInfo = newPacker.getImageInfo();
      if (imageInfo?.isEncrypted) {
        addLog('ERRO', t('firmwarePacker.spinor.encrypted', '固件已加密，不支持'));
        showPopup(
          'error',
          t('firmwarePacker.spinor.loadError', '加载错误'),
          t('firmwarePacker.spinor.encrypted', '固件已加密，不支持')
        );
        await newPacker.freeImage();
        return;
      }

      addLog(
        'OKAY',
        t('firmwarePacker.spinor.loadSuccess', '固件加载成功，文件数: {{count}}', {
          count: imageInfo?.files.length || 0,
        })
      );

      const partitionData = await getPartitionData(newPacker);
      if (partitionData) {
        const openixPartition = new OpenixPartition();
        await openixPartition.parseFromData(partitionData);
        const parsedPartitions = openixPartition.getPartitions();
        setPartitions(parsedPartitions);
        addLog(
          'INFO',
          t('firmwarePacker.spinor.partitionsFound', '发现 {{count}} 个分区', {
            count: parsedPartitions.length,
          })
        );
      } else {
        setPartitions([]);
        addLog('WARN', t('firmwarePacker.spinor.noPartitions', '未找到分区表'));
      }

      let detectedMap: FlashMapInfo | null = null;
      const dtbData = await getDtb(newPacker);
      if (dtbData) {
        detectedMap = await getFlashMap(dtbData);
      }

      if (!detectedMap) {
        const ubootData = await getUboot(newPacker);
        if (ubootData) {
          const ubootDtbData = extractDtbFromUboot(ubootData);
          if (ubootDtbData) {
            detectedMap = await getFlashMap(ubootDtbData);
          }
        }
      }

      if (detectedMap?.nor_map) {
        setFlashMap(detectedMap);
        const norMap = detectedMap.nor_map;

        if (norMap.logic_offset != null) {
          setLogicStart(String(norMap.logic_offset));
          addLog(
            'INFO',
            t('firmwarePacker.spinor.autoLogicStart', '自动检测 logic_start: {{value}} 扇区', {
              value: norMap.logic_offset,
            })
          );
        }

        if (norMap.uboot_start != null) {
          setUbootStart(String(norMap.uboot_start));
          addLog(
            'INFO',
            t('firmwarePacker.spinor.autoUbootStart', '自动检测 uboot_start: {{value}} 扇区', {
              value: norMap.uboot_start,
            })
          );
        }

        setAutoDetected(true);
      } else {
        setFlashMap(null);
        setAutoDetected(false);
        addLog('WARN', t('firmwarePacker.spinor.noFlashMap', '未找到 flash_map 配置，使用默认值'));
      }

      await newPacker.freeImage();
    }
  }, [addLog, showPopup, t]);

  const handleConvert = useCallback(async () => {
    if (!firmwarePath) {
      addLog('ERRO', t('firmwarePacker.spinor.noFirmware', '请先选择固件文件'));
      return;
    }

    const outputPath = generateOutputPath(firmwarePath);

    setLoading(true);
    addLog('INFO', t('firmwarePacker.spinor.starting', '开始转换...'));
    addLog(
      'INFO',
      t('firmwarePacker.spinor.outputPath', '输出文件: {{path}}', { path: outputPath })
    );

    try {
      const partitionEntries: PartitionEntry[] = [];
      for (const partition of partitions) {
        const downloadFile = partition.downloadfile || partition.customFilePath || '';
        partitionEntries.push({
          name: partition.name,
          size: partition.size * 512,
          download_file: downloadFile,
          user_type: partition.user_type,
          keydata: partition.keydata,
          encrypt: partition.encrypt,
          verify: partition.verify,
          ro: partition.ro,
        });
      }

      const logicStartBytes = parseInt(logicStart, 10) * 512;
      const ubootStartBytes = parseInt(ubootStart, 10) * 512;
      const norSizeBytes = parseInt(norSize, 10) * 1024 * 1024;

      addLog(
        'INFO',
        t(
          'firmwarePacker.spinor.config',
          'logic_start={{logic}} 扇区, uboot_start={{uboot}} 扇区, nor_size={{norSize}}MB',
          {
            logic: logicStart,
            uboot: ubootStart,
            norSize: norSize,
          }
        )
      );

      const config: SpinorMergeConfig = {
        output_path: outputPath,
        logic_start: logicStartBytes,
        uboot_start: ubootStartBytes,
        partitions: partitionEntries,
        firmware_path: firmwarePath,
        nor_size: norSizeBytes,
      };

      const result = (await invokeCommand('spinor_merge_firmware', {
        config,
      })) as SpinorMergeResult;

      if (result.success) {
        addLog(
          'OKAY',
          t('firmwarePacker.spinor.convertSuccess', '转换成功: {{size}}', {
            size: formatSize(result.output_size),
          })
        );
        showPopup('success', t('firmwarePacker.spinor.success', '转换成功'), result.message);
      } else {
        addLog(
          'ERRO',
          t('firmwarePacker.spinor.convertFailed', '转换失败: {{error}}', { error: result.message })
        );
        showPopup('error', t('firmwarePacker.spinor.error', '转换失败'), result.message);
      }
    } catch (error) {
      const errMsg =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String((error as { message: unknown }).message)
            : String(error);
      addLog(
        'ERRO',
        t('firmwarePacker.spinor.convertError', '转换错误: {{error}}', { error: errMsg })
      );
      showPopup('error', t('firmwarePacker.spinor.error', '转换失败'), errMsg);
    } finally {
      setLoading(false);
    }
  }, [firmwarePath, logicStart, ubootStart, norSize, partitions, addLog, showPopup, t]);

  return (
    <div className="fw-packer-panel">
      <div className="fw-packer-panel-header">
        {t('firmwarePacker.spinor.title', 'SPI NOR 烧录器固件转换')}
      </div>

      <div className="fw-packer-form-group">
        <label>{t('firmwarePacker.spinor.firmwareFile', '固件文件')}</label>
        <div className="fw-packer-file-row">
          <input
            type="text"
            value={firmwarePath}
            readOnly
            placeholder={t(
              'firmwarePacker.spinor.selectFirmwarePlaceholder',
              '选择 .img 固件文件...'
            )}
          />
          <button
            onClick={handleSelectFirmware}
            className="fw-packer-btn fw-packer-btn-small fw-packer-btn-primary"
          >
            {t('common.browse', '浏览...')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <div className="fw-packer-form-group" style={{ flex: 1 }}>
          <label>
            {t('firmwarePacker.spinor.logicStart', 'Logic Start (扇区)')}
            {autoDetected && flashMap?.nor_map?.logic_offset != null && (
              <span style={{ fontSize: '0.8em', color: '#4caf50', marginLeft: '8px' }}>
                ({t('firmwarePacker.spinor.autoDetected', '自动检测')})
              </span>
            )}
          </label>
          <input
            type="number"
            value={logicStart}
            onChange={(e) => setLogicStart(e.target.value)}
            placeholder="1024"
            disabled={loading}
          />
        </div>
        <div className="fw-packer-form-group" style={{ flex: 1 }}>
          <label>
            {t('firmwarePacker.spinor.ubootStart', 'U-Boot Start (扇区)')}
            {autoDetected && flashMap?.nor_map?.uboot_start != null && (
              <span style={{ fontSize: '0.8em', color: '#4caf50', marginLeft: '8px' }}>
                ({t('firmwarePacker.spinor.autoDetected', '自动检测')})
              </span>
            )}
          </label>
          <input
            type="number"
            value={ubootStart}
            onChange={(e) => setUbootStart(e.target.value)}
            placeholder="48"
            disabled={loading}
          />
        </div>
        <div className="fw-packer-form-group" style={{ flex: 1 }}>
          <label>{t('firmwarePacker.spinor.norSize', 'NOR 大小')}</label>
          <select value={norSize} onChange={(e) => setNorSize(e.target.value)} disabled={loading}>
            <option value="4">4 MB</option>
            <option value="8">8 MB</option>
            <option value="16">16 MB</option>
            <option value="32">32 MB</option>
            <option value="64">64 MB</option>
            <option value="128">128 MB</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleConvert}
        disabled={loading || !firmwarePath}
        className="fw-packer-btn fw-packer-btn-primary fw-packer-btn-block"
      >
        {loading
          ? t('firmwarePacker.spinor.converting', '转换中...')
          : t('firmwarePacker.spinor.convert', '开始转换')}
      </button>

      {partitions.length > 0 && (
        <div className="fw-packer-form-group fw-packer-partition-group">
          <label>
            {t('firmwarePacker.spinor.partitions', '分区列表 ({{count}})', {
              count: partitions.length,
            })}
          </label>
          <div className="fw-packer-partition-list">
            {partitions.map((partition, index) => (
              <div key={index} className="fw-packer-partition-item">
                <span className="fw-packer-partition-name">{partition.name}</span>
                <span className="fw-packer-partition-size">{formatSize(partition.size * 512)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Popup
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={() => setPopup((prev) => ({ ...prev, visible: false }))}
      />
    </div>
  );
};
