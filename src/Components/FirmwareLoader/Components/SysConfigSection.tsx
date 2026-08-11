import React from 'react';
import { useTranslation } from 'react-i18next';
import { SysConfig, SunxiSysConfigParser } from '../../../FlashConfig';

interface SysConfigSectionProps {
  sysConfig: SysConfig;
}

export const SysConfigSection: React.FC<SysConfigSectionProps> = ({ sysConfig }) => {
  const { t } = useTranslation();

  return (
    <div className="sysconfig-info">
      <h3>{t('firmwareLoader.sysConfig.title', '系统配置信息')}</h3>
      <div className="info-grid">
        <div className="info-item">
          <span className="label">{t('firmwareLoader.sysConfig.debugPrint', '调试打印')}</span>
          <span className="value">
            {sysConfig.debug_mode > 0 ? t('common.yes', '是') : t('common.no', '否')}
          </span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.sysConfig.storageType', '存储类型')}</span>
          <span className="value">{SunxiSysConfigParser.getStorageType(sysConfig)}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.sysConfig.i2cPort', 'I2C 端口')}</span>
          <span className="value">{sysConfig.twi_para.twi_port}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.sysConfig.uartPort', 'UART 端口')}</span>
          <span className="value">{sysConfig.uart_para.uart_debug_port}</span>
        </div>
      </div>
      {sysConfig.twi_para.twi_scl && (
        <div className="twi-info">
          <h4>{t('firmwareLoader.sysConfig.i2cConfig', 'I2C 配置')}</h4>
          <div className="info-grid">
            <div className="info-item">
              <span className="label">{t('firmwareLoader.sysConfig.sclPin', 'SCL 引脚')}</span>
              <span className="value">
                {sysConfig.twi_para.twi_scl.port}
                {sysConfig.twi_para.twi_scl.bank}
                {sysConfig.twi_para.twi_scl.pin}
              </span>
            </div>
            <div className="info-item">
              <span className="label">{t('firmwareLoader.sysConfig.sdaPin', 'SDA 引脚')}</span>
              <span className="value">
                {sysConfig.twi_para.twi_sda?.port}
                {sysConfig.twi_para.twi_sda?.bank}
                {sysConfig.twi_para.twi_sda?.pin || '-'}
              </span>
            </div>
          </div>
        </div>
      )}
      {sysConfig.uart_para.uart_debug_tx && (
        <div className="uart-info">
          <h4>{t('firmwareLoader.sysConfig.uartConfig', 'UART 配置')}</h4>
          <div className="info-grid">
            <div className="info-item">
              <span className="label">{t('firmwareLoader.sysConfig.baudRate', '波特率')}</span>
              <span className="value">{sysConfig.uart_para.uart_baud_rate}</span>
            </div>
            <div className="info-item">
              <span className="label">{t('firmwareLoader.sysConfig.txPin', 'TX 引脚')}</span>
              <span className="value">
                {sysConfig.uart_para.uart_debug_tx.port}
                {sysConfig.uart_para.uart_debug_tx.bank}
                {sysConfig.uart_para.uart_debug_tx.pin}
              </span>
            </div>
            <div className="info-item">
              <span className="label">{t('firmwareLoader.sysConfig.rxPin', 'RX 引脚')}</span>
              <span className="value">
                {sysConfig.uart_para.uart_debug_rx?.port}
                {sysConfig.uart_para.uart_debug_rx?.bank}
                {sysConfig.uart_para.uart_debug_rx?.pin || '-'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SysConfigSection;
