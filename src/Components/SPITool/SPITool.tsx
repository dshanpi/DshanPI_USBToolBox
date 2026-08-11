import React, { useState, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { SPIMasterTab } from './Components/SPIMasterTab';
import { SPISlaveTab } from './Components/SPISlaveTab';
import { sharedDevice } from './sharedDevice';
import type { SpiSlaveSim } from './lib/SpiSlaveSim';
import './SPITool.css';

export const SPITool: React.FC = () => {
  const { t } = useTranslation();
  // SPI 从机模拟器 tab 暂时隐藏（功能代码保留，恢复时将 SHOW_SLAVE_TAB 置 true 即可）
  const SHOW_SLAVE_TAB = false;
  const [activeTab, setActiveTab] = useState<'master' | 'slave'>('master');
  const [slaveEnabled, setSlaveEnabled] = useState(SHOW_SLAVE_TAB);
  const slaveRef = useRef<SpiSlaveSim | null>(null);

  // 设备连接状态由侧边栏的 DeviceConnectButton 统一管理（sharedDevice 单例），
  // 这里只订阅 online/deviceIndex 供 SPIMasterTab 使用。
  const deviceState = useSyncExternalStore(sharedDevice.subscribe, sharedDevice.getState);

  return (
    <div className="proto-tool">
      {/* 标签栏（Master/Slave 切换）仅在有从机模拟器时显示；从机隐藏时不渲染这一行，
          避免出现只有一个"SPI主机分析(Master)"按钮的冗余行。恢复从机时把 SHOW_SLAVE_TAB 置 true 即可。 */}
      {SHOW_SLAVE_TAB && (
        <div className="proto-top-bar">
          <div className="proto-tab-bar">
            <button className={`proto-tab-btn ${activeTab === 'master' ? 'active' : ''}`} onClick={() => setActiveTab('master')}>{t('serialTool.spi.tabMaster')}</button>
            <button className={`proto-tab-btn ${activeTab === 'slave' ? 'active' : ''}`} onClick={() => setActiveTab('slave')}>{t('serialTool.spi.tabSlave')}</button>
          </div>
        </div>
      )}

      <div className="proto-content">
        {SHOW_SLAVE_TAB && activeTab === 'slave' ? (
          <SPISlaveTab slaveRef={slaveRef} enabled={slaveEnabled} onEnabledChange={setSlaveEnabled} onCsChange={() => undefined} addLog={() => undefined} />
        ) : (
          <SPIMasterTab connected={deviceState.online} deviceIndex={deviceState.deviceIndex ?? 0} presetVariant="general" />
        )}
      </div>
    </div>
  );
};
