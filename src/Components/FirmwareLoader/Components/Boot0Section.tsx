import React from 'react';
import { useTranslation } from 'react-i18next';
import { BootFileHead } from '../../../FlashConfig';
import { formatSize, formatHex } from '../../../Utils';

interface Boot0SectionProps {
  boot0Header: BootFileHead;
}

export const Boot0Section: React.FC<Boot0SectionProps> = ({ boot0Header }) => {
  const { t } = useTranslation();

  return (
    <div className="boot0-info">
      <h3>{t('firmwareLoader.boot0.title', 'Boot0 信息')}</h3>
      <div className="info-grid">
        <div className="info-item">
          <span className="label">{t('firmwareLoader.boot0.magic', 'Magic')}</span>
          <span className="value">{boot0Header.magic}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.boot0.length', '长度')}</span>
          <span className="value">{formatSize(boot0Header.length)}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.boot0.runAddr', '运行地址')}</span>
          <span className="value">{formatHex(boot0Header.run_addr)}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.boot0.retAddr', '返回地址')}</span>
          <span className="value">{formatHex(boot0Header.ret_addr)}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.boot0.platform', '平台')}</span>
          <span className="value">{boot0Header.platform}</span>
        </div>
        <div className="info-item">
          <span className="label">{t('firmwareLoader.boot0.checksum', '校验和')}</span>
          <span className="value">{formatHex(boot0Header.check_sum)}</span>
        </div>
      </div>
    </div>
  );
};

export default Boot0Section;
