import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  DshanPIPacker,
  Partition,
  getPartitionData,
  DshanPIPartition,
  getDtb,
  getUboot,
  checkSecureFirmware,
} from '../../../Library/DshanPIIMG';
import { getFlashMap, extractDtbFromUboot, FlashMapInfo } from '../../../Library/FDT';
import { LogEntry } from '../Types';
import { formatSize } from '../Utils';
import { Popup, PopupType } from '../../../CoreUI';
import { flashManager } from '../../../FlashManager';
import { invokeCommand, subscribePackerLog, subscribePackerProgress } from '../../../Platform/IPC';

interface BlockDeviceConverterProps {
  addLog: (level: LogEntry['level'], message: string) => void;
  defaultFlashType?: 'emmc' | 'ufs' | 'sdcard' | 'sdnand';
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

interface EmmcUfsMergeConfig {
  output_path: string;
  logic_offset: number;
  partitions: PartitionEntry[];
  firmware_path: string;
  flash_type: string;
  is_secure: boolean;
  storage_size?: string;
}

interface EmmcUfsMergeResult {
  success: boolean;
  message: string;
  output_size: number;
}

interface PackerLogEvent {
  level: string;
  message: string;
}

interface PackerProgressEvent {
  stage: string;
  current: number;
  total: number;
  message: string;
}

type FlashType = 'emmc' | 'ufs' | 'sdcard';

function generateOutputPath(inputPath: string): string {
  const lastDot = inputPath.lastIndexOf('.');
  if (lastDot === -1) {
    return `${inputPath}_programmer.bin`;
  }
  const basePath = inputPath.substring(0, lastDot);
  return `${basePath}_programmer.bin`;
}

const getActualFlashType = (defaultType?: 'emmc' | 'ufs' | 'sdcard' | 'sdnand'): FlashType => {
  if (defaultType === 'sdnand') return 'emmc';
  return defaultType || 'emmc';
};

export const BlockDeviceConverter: React.FC<BlockDeviceConverterProps> = ({
  addLog,
  defaultFlashType,
}) => {
  const { t } = useTranslation();
  const [firmwarePath, setFirmwarePath] = useState<string>('');
  const flashType = getActualFlashType(defaultFlashType);
  const [logicOffset, setLogicOffset] = useState<string>('40960');
  const [storageSizeAuto, setStorageSizeAuto] = useState<boolean>(true);
  const [storageSizeValue, setStorageSizeValue] = useState<string>('16');
  const [storageSizeUnit, setStorageSizeUnit] = useState<'MB' | 'GB'>('GB');
  const [loading, setLoading] = useState(false);
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [flashMap, setFlashMap] = useState<FlashMapInfo | null>(null);
  const [autoDetected, setAutoDetected] = useState(false);
  const [isSecure, setIsSecure] = useState<boolean>(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    message: string;
  } | null>(null);
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

  const addLogRef = useRef(addLog);
  addLogRef.current = addLog;

  const unlistenLogRef = useRef<UnlistenFn | null>(null);
  const unlistenProgressRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    let mounted = true;

    const setupListeners = async () => {
      const unlistenLog = await subscribePackerLog((payload) => {
        const { level, message } = payload as PackerLogEvent;
        const upperLevel = level.toUpperCase();
        const logLevel: LogEntry['level'] =
          upperLevel === 'WARN'
            ? 'WARN'
            : upperLevel === 'ERROR'
              ? 'ERRO'
              : upperLevel === 'OKAY'
                ? 'OKAY'
                : 'INFO';
        addLogRef.current(logLevel, message);
      });

      const unlistenProgress = await subscribePackerProgress((payload) => {
        const { current, total, message } = payload as PackerProgressEvent;
        setProgress({ current, total, message });
      });

      if (mounted) {
        unlistenLogRef.current = unlistenLog;
        unlistenProgressRef.current = unlistenProgress;
      } else {
        unlistenLog();
        unlistenProgress();
      }
    };

    setupListeners();

    return () => {
      mounted = false;
      if (unlistenLogRef.current) {
        unlistenLogRef.current();
        unlistenLogRef.current = null;
      }
      if (unlistenProgressRef.current) {
        unlistenProgressRef.current();
        unlistenProgressRef.current = null;
      }
    };
  }, []);

  const getTitle = useCallback(() => {
    switch (defaultFlashType) {
      case 'ufs':
        return t('firmwarePacker.blockDevice.titleUfs', 'UFS 磁盘镜像转换');
      case 'sdcard':
        return t('firmwarePacker.blockDevice.titleSdcard', 'SD Card 磁盘镜像转换');
      case 'sdnand':
        return t('firmwarePacker.blockDevice.titleSdnand', 'SD Nand 磁盘镜像转换');
      default:
        return t('firmwarePacker.blockDevice.titleEmmc', 'eMMC 磁盘镜像转换');
    }
  }, [defaultFlashType, t]);

  const showPopup = useCallback((type: PopupType, title: string, message: string) => {
    setPopup({ visible: true, type, title, message });
  }, []);

  const handleSelectFirmware = useCallback(async () => {
    const selected = await open({
      multiple: false,
      title: t('firmwarePacker.blockDevice.selectFirmware', '选择固件文件'),
      filters: [{ name: 'Image', extensions: ['img'] }],
    });
    if (selected) {
      setFirmwarePath(selected as string);
      setProgress(null);
      addLog(
        'INFO',
        t('firmwarePacker.blockDevice.firmwareSelected', '已选择固件: {{path}}', { path: selected })
      );

      const newPacker = new DshanPIPacker();
      const success = await newPacker.loadImageFromPath(selected as string);
      if (!success) {
        addLog('ERRO', t('firmwarePacker.blockDevice.loadFailed', '加载固件失败'));
        showPopup(
          'error',
          t('firmwarePacker.blockDevice.loadError', '加载错误'),
          t('firmwarePacker.blockDevice.loadFailed', '加载固件失败')
        );
        return;
      }

      const imageInfo = newPacker.getImageInfo();
      if (imageInfo?.isEncrypted) {
        addLog('ERRO', t('firmwarePacker.blockDevice.encrypted', '固件已加密，不支持'));
        showPopup(
          'error',
          t('firmwarePacker.blockDevice.loadError', '加载错误'),
          t('firmwarePacker.blockDevice.encrypted', '固件已加密，不支持')
        );
        await newPacker.freeImage();
        return;
      }

      addLog(
        'OKAY',
        t('firmwarePacker.blockDevice.loadSuccess', '固件加载成功，文件数: {{count}}', {
          count: imageInfo?.files.length || 0,
        })
      );

      const secureResult = checkSecureFirmware(newPacker);
      if (secureResult === true) {
        setIsSecure(true);
        addLog(
          'INFO',
          t('firmwarePacker.blockDevice.secureFirmware', '检测到安全固件，将使用 TOC0/TOC1')
        );
      } else {
        setIsSecure(false);
        addLog(
          'INFO',
          t('firmwarePacker.blockDevice.normalFirmware', '检测到普通固件，将使用 Boot0/U-Boot')
        );
      }

      const partitionData = await getPartitionData(newPacker);
      if (partitionData) {
        const dshanpiPartition = new DshanPIPartition();
        await dshanpiPartition.parseFromData(partitionData);
        const parsedPartitions = dshanpiPartition.getPartitions();
        setPartitions(parsedPartitions);
        addLog(
          'INFO',
          t('firmwarePacker.blockDevice.partitionsFound', '发现 {{count}} 个分区', {
            count: parsedPartitions.length,
          })
        );
      } else {
        setPartitions([]);
        addLog('WARN', t('firmwarePacker.blockDevice.noPartitions', '未找到分区表'));
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

      if (detectedMap?.sdmmc_map) {
        setFlashMap(detectedMap);
        const storageMap = detectedMap.sdmmc_map;

        if (storageMap?.logic_offset != null) {
          setLogicOffset(String(storageMap.logic_offset));
          addLog(
            'INFO',
            t(
              'firmwarePacker.blockDevice.autoLogicOffset',
              '自动检测 logic_offset: {{value}} 扇区',
              { value: storageMap.logic_offset }
            )
          );
        }

        setAutoDetected(true);
      } else {
        setFlashMap(null);
        setAutoDetected(false);
        addLog(
          'WARN',
          t('firmwarePacker.blockDevice.noFlashMap', '未找到 flash_map 配置，使用默认值')
        );
      }

      await newPacker.freeImage();
    }
  }, [addLog, showPopup, t]);

  const handleConvert = useCallback(async () => {
    if (!firmwarePath) {
      addLog('ERRO', t('firmwarePacker.blockDevice.noFirmware', '请先选择固件文件'));
      return;
    }

    const outputPath = generateOutputPath(firmwarePath);

    setLoading(true);
    flashManager.setExternalWorking(true);
    setProgress(null);

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

      const logicOffsetBytes = parseInt(logicOffset, 10) * 512;

      const storageSize = storageSizeAuto ? 'auto' : `${storageSizeValue}${storageSizeUnit}`;

      const config: EmmcUfsMergeConfig = {
        output_path: outputPath,
        logic_offset: logicOffsetBytes,
        partitions: partitionEntries,
        firmware_path: firmwarePath,
        flash_type: flashType,
        is_secure: isSecure,
        storage_size: storageSize || undefined,
      };

      const result = (await invokeCommand('emmc_ufs_merge_firmware', {
        config,
      })) as EmmcUfsMergeResult;

      if (result.success) {
        showPopup('success', t('firmwarePacker.blockDevice.success', '转换成功'), result.message);
      } else {
        showPopup('error', t('firmwarePacker.blockDevice.error', '转换失败'), result.message);
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
        t('firmwarePacker.blockDevice.convertError', '转换错误: {{error}}', { error: errMsg })
      );
      showPopup('error', t('firmwarePacker.blockDevice.error', '转换失败'), errMsg);
    } finally {
      flashManager.setExternalWorking(false);
      setLoading(false);
    }
  }, [
    firmwarePath,
    flashType,
    logicOffset,
    storageSizeAuto,
    storageSizeValue,
    storageSizeUnit,
    partitions,
    isSecure,
    addLog,
    showPopup,
    t,
  ]);

  return (
    <div className="fw-packer-panel">
      <div className="fw-packer-panel-header">{getTitle()}</div>

      <div className="fw-packer-form-group">
        <label>{t('firmwarePacker.blockDevice.firmwareFile', '固件文件')}</label>
        <div className="fw-packer-file-row">
          <input
            type="text"
            value={firmwarePath}
            readOnly
            placeholder={t(
              'firmwarePacker.blockDevice.selectFirmwarePlaceholder',
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

      <div className="fw-packer-form-group">
        <label>{t('firmwarePacker.blockDevice.firmwareType', '固件类型')}</label>
        <div className="fw-packer-info-row">
          {!firmwarePath ? (
            <span className="fw-packer-unknown-badge">
              {t('firmwarePacker.blockDevice.unknownType', '未选择固件')}
            </span>
          ) : (
            <span className={isSecure ? 'fw-packer-secure-badge' : 'fw-packer-normal-badge'}>
              {isSecure
                ? t('firmwarePacker.blockDevice.secureType', '安全固件 (TOC0/TOC1)')
                : t('firmwarePacker.blockDevice.normalType', '普通固件 (Boot0/U-Boot)')}
            </span>
          )}
        </div>
      </div>

      <div className="fw-packer-form-group">
        <label>
          {t('firmwarePacker.blockDevice.logicOffset', 'Logic Offset (扇区)')}
          {autoDetected && flashMap?.sdmmc_map?.logic_offset != null && (
            <span className="fw-packer-auto-badge">
              ({t('firmwarePacker.blockDevice.autoDetected', '自动检测')})
            </span>
          )}
        </label>
        <input
          type="number"
          value={logicOffset}
          onChange={(e) => setLogicOffset(e.target.value)}
          placeholder="40960"
          disabled={loading}
        />
      </div>

      <div className="fw-packer-form-group">
        <label>{t('firmwarePacker.blockDevice.storageSize', '存储大小')}</label>
        <div className="fw-packer-radio-group">
          <label className="fw-packer-radio-label">
            <input
              type="radio"
              name="storageSizeMode"
              checked={storageSizeAuto}
              onChange={() => setStorageSizeAuto(true)}
              disabled={loading}
            />
            {t('firmwarePacker.blockDevice.storageSizeAuto', '自动 (根据固件大小)')}
          </label>
          <label className="fw-packer-radio-label">
            <input
              type="radio"
              name="storageSizeMode"
              checked={!storageSizeAuto}
              onChange={() => setStorageSizeAuto(false)}
              disabled={loading}
            />
            {t('firmwarePacker.blockDevice.storageSizeManual', '手动指定')}
          </label>
        </div>
        {!storageSizeAuto && (
          <div className="fw-packer-size-input-row">
            <input
              type="number"
              value={storageSizeValue}
              onChange={(e) => setStorageSizeValue(e.target.value)}
              placeholder="16"
              disabled={loading}
              min="1"
            />
            <select
              value={storageSizeUnit}
              onChange={(e) => setStorageSizeUnit(e.target.value as 'MB' | 'GB')}
              disabled={loading}
            >
              <option value="MB">MB</option>
              <option value="GB">GB</option>
            </select>
          </div>
        )}
      </div>

      <div className="fw-packer-form-group">
        <div className="fw-packer-progress-info">
          <span>
            {progress?.message ||
              (loading
                ? t('firmwarePacker.blockDevice.preparing', '准备中...')
                : t('firmwarePacker.blockDevice.ready', '就绪'))}
          </span>
        </div>
        <div className="fw-packer-progress-bar">
          <div
            className="fw-packer-progress-fill"
            style={{
              width: progress
                ? `${Math.min((progress.current / progress.total) * 100, 100)}%`
                : '0%',
            }}
          />
        </div>
      </div>

      <button
        onClick={handleConvert}
        disabled={loading || !firmwarePath}
        className="fw-packer-btn fw-packer-btn-primary fw-packer-btn-block"
      >
        {loading
          ? t('firmwarePacker.blockDevice.converting', '转换中...')
          : t('firmwarePacker.blockDevice.convert', '开始转换')}
      </button>

      {partitions.length > 0 && (
        <div className="fw-packer-form-group fw-packer-partition-group">
          <label>
            {t('firmwarePacker.blockDevice.partitions', '分区列表 ({{count}})', {
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
