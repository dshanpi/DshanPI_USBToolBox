import React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageInfo, DshanPIPacker, checkSecureFirmware } from '../../../Library/DshanPIIMG';
import { SysConfig } from '../../../FlashConfig';
import { SunxiSysConfigParser } from '../../../FlashConfig';
import { formatSize } from '../../../Utils';

interface FirmwareInfoProps {
  imagePath: string | null;
  imageInfo: ImageInfo | null;
  sysConfig: SysConfig | null;
  packer: DshanPIPacker | null;
  loading: boolean;
  isFlashing: boolean;
  onOpenFile: () => void;
}

export const FirmwareInfo: React.FC<FirmwareInfoProps> = ({
  imagePath,
  imageInfo,
  sysConfig,
  packer,
  loading,
  isFlashing,
  onOpenFile,
}) => {
  const { t } = useTranslation();

  const isSecureFirmware = packer ? checkSecureFirmware(packer) : null;

  return (
    <div className="fd-section fd-section-firmware">
      <div className="fd-section-header">
        <h3>{t('firmwareDownloader.firmwareInfo.title', '固件选择')}</h3>
        <div className="fd-section-header-actions">
          {imagePath && (
            <span className="fd-firmware-filename">{imagePath.split(/[/\\]/).pop()}</span>
          )}
          <button
            onClick={onOpenFile}
            disabled={loading || isFlashing}
            className="fd-button fd-button-primary"
          >
            {loading
              ? t('common.loading', '加载中...')
              : t('firmwareDownloader.firmwareInfo.selectFirmware', '选择固件')}
          </button>
        </div>
      </div>
      <div className="fd-info-card">
        <div className="fd-info-row fd-info-row-path">
          <span className="fd-info-label">
            {t('firmwareDownloader.firmwareInfo.filePath', '文件路径')}
          </span>
          <span className="fd-info-value fd-info-value-scrollable">
            {imagePath ?? t('common.notSelected', '未选择')}
          </span>
        </div>
        <div className="fd-info-row">
          <span className="fd-info-label">
            {t('firmwareDownloader.firmwareInfo.imageSize', '镜像大小')}
          </span>
          <span className="fd-info-value">
            {imageInfo ? formatSize(imageInfo.header.image_size) : '-'}
          </span>
          <span className="fd-info-label">
            {t('firmwareDownloader.firmwareInfo.storageType', '存储类型')}
          </span>
          <span className="fd-info-value">
            {sysConfig ? SunxiSysConfigParser.getStorageType(sysConfig) : '-'}
          </span>
          <span className="fd-info-label">
            {t('firmwareDownloader.firmwareInfo.debugPrint', '调试打印')}
          </span>
          <span className="fd-info-value">
            {sysConfig
              ? sysConfig.debug_mode > 0
                ? t('firmwareDownloader.firmwareInfo.debugOn', '开启')
                : t('firmwareDownloader.firmwareInfo.debugOff', '关闭')
              : '-'}
          </span>
          <span className="fd-info-label">
            {t('firmwareDownloader.firmwareInfo.secureFirmware', '安全固件')}
          </span>
          <span className="fd-info-value">
            {isSecureFirmware === null
              ? '-'
              : isSecureFirmware
                ? t('firmwareDownloader.firmwareInfo.secureOn', '是')
                : t('firmwareDownloader.firmwareInfo.secureOff', '否')}
          </span>
        </div>
        <div className="fd-info-row">
          <span className="fd-info-label">
            {t('firmwareDownloader.firmwareInfo.uartPort', 'UART IO')}
          </span>
          <span className="fd-info-value">
            {sysConfig
              ? `${SunxiSysConfigParser.getGpioString(sysConfig.uart_para.uart_debug_tx)}|${SunxiSysConfigParser.getGpioString(sysConfig.uart_para.uart_debug_rx)}`
              : '-'}
          </span>
          <span className="fd-info-label">
            {t('firmwareDownloader.firmwareInfo.uartBaudRate', 'UART 波特率')}
          </span>
          <span className="fd-info-value">
            {sysConfig ? sysConfig.uart_para.uart_baud_rate : '-'}
          </span>
          <span className="fd-info-label">
            {t('firmwareDownloader.firmwareInfo.twiPort', 'TWI 端口')}
          </span>
          <span className="fd-info-value">{sysConfig ? sysConfig.twi_para.twi_port : '-'}</span>
          <span className="fd-info-label">
            {t('firmwareDownloader.firmwareInfo.twi', 'TWI IO')}
          </span>
          <span className="fd-info-value">
            {sysConfig
              ? `${SunxiSysConfigParser.getGpioString(sysConfig.twi_para.twi_scl)}|${SunxiSysConfigParser.getGpioString(sysConfig.twi_para.twi_sda)}`
              : '-'}
          </span>
        </div>
      </div>
    </div>
  );
};
