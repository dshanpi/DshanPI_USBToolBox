import React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageInfo, checkSecureFirmware, DshanPIPacker } from '../../../Library/DshanPIIMG';
import { SysConfig, SunxiSysConfigParser } from '../../../FlashConfig';
import { formatSize } from '../../../Utils';

interface FirmwareSelectProps {
  imagePath: string | null;
  imageInfo: ImageInfo | null;
  sysConfig: SysConfig | null;
  packer: React.RefObject<DshanPIPacker>;
  loading: boolean;
  isRunning: boolean;
  onOpenFile: () => void;
}

export const FirmwareSelect: React.FC<FirmwareSelectProps> = ({
  imagePath,
  imageInfo,
  sysConfig,
  packer,
  loading,
  isRunning,
  onOpenFile,
}) => {
  const { t } = useTranslation();
  const isSecureFirmware = packer.current ? checkSecureFirmware(packer.current) : null;

  return (
    <>
      <div className="mp-section">
        <div className="section-header">{t('massProduction.firmwareSelect', '固件选择')}</div>
        <div className="section-body">
          <div className="mp-firmware-name" title={imagePath || ''}>
            {imagePath
              ? imagePath.split(/[/\\]/).pop()
              : t('massProduction.selectFirmwareHint', '请选择固件')}
          </div>
          <button
            className="mp-btn mp-btn-primary mp-btn-block"
            onClick={onOpenFile}
            disabled={loading || isRunning}
          >
            {loading
              ? t('common.loading', '加载中...')
              : t('firmwareDownloader.firmwareInfo.selectFirmware', '选择固件')}
          </button>
        </div>
      </div>

      <div className="mp-section">
        <div className="section-header">{t('massProduction.firmwareInfo', '固件信息')}</div>
        <div className="section-body">
          <div className="mp-info-grid">
            <div className="mp-info-item">
              <span className="mp-info-label">
                {t('firmwareDownloader.firmwareInfo.imageSize', '镜像大小')}
              </span>
              <span className="mp-info-value">
                {imageInfo ? formatSize(imageInfo.header.image_size) : '-'}
              </span>
            </div>
            <div className="mp-info-item">
              <span className="mp-info-label">
                {t('firmwareDownloader.firmwareInfo.storageType', '存储类型')}
              </span>
              <span className="mp-info-value">
                {sysConfig ? SunxiSysConfigParser.getStorageType(sysConfig) : '-'}
              </span>
            </div>
            <div className="mp-info-item">
              <span className="mp-info-label">
                {t('firmwareDownloader.firmwareInfo.debugPrint', '调试打印')}
              </span>
              <span className="mp-info-value">
                {sysConfig
                  ? sysConfig.debug_mode > 0
                    ? t('firmwareDownloader.firmwareInfo.debugOn', '开启')
                    : t('firmwareDownloader.firmwareInfo.debugOff', '关闭')
                  : '-'}
              </span>
            </div>
            <div className="mp-info-item">
              <span className="mp-info-label">
                {t('firmwareDownloader.firmwareInfo.secureFirmware', '安全固件')}
              </span>
              <span className="mp-info-value">
                {isSecureFirmware === null
                  ? '-'
                  : isSecureFirmware
                    ? t('firmwareDownloader.firmwareInfo.secureOn', '是')
                    : t('firmwareDownloader.firmwareInfo.secureOff', '否')}
              </span>
            </div>
            <div className="mp-info-item">
              <span className="mp-info-label">
                {t('firmwareDownloader.firmwareInfo.uartPort', 'UART IO')}
              </span>
              <span className="mp-info-value">
                {sysConfig
                  ? `${SunxiSysConfigParser.getGpioString(sysConfig.uart_para.uart_debug_tx)}|${SunxiSysConfigParser.getGpioString(sysConfig.uart_para.uart_debug_rx)}`
                  : '-'}
              </span>
            </div>
            <div className="mp-info-item">
              <span className="mp-info-label">
                {t('firmwareDownloader.firmwareInfo.uartBaudRate', 'UART 波特率')}
              </span>
              <span className="mp-info-value">
                {sysConfig ? sysConfig.uart_para.uart_baud_rate : '-'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
