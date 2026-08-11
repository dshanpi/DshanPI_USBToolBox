import React, { useState, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { MasterTab } from './Components/MasterTab';
import { SlaveTab } from './Components/SlaveTab';
import { sharedDevice } from '../SPITool/sharedDevice';
import type { SlaveEmulator } from './lib/SlaveEmulator';
import './I2CTool.css';

export const I2CTool: React.FC = () => {
  const { t } = useTranslation();
  // 从机模拟器 tab 暂时隐藏（功能代码保留，恢复时将 SHOW_SLAVE_TAB 置 true 即可）
  const SHOW_SLAVE_TAB = false;
  const [activeTab, setActiveTab] = useState<'master' | 'slave'>('master');
  // 从机隐藏时默认关闭：避免 MasterTab/AdvancedPanel 在无 emulator 时尝试软件模拟回退
  const [slaveEnabled, setSlaveEnabled] = useState(SHOW_SLAVE_TAB);
  const [slaveAddr, setSlaveAddr] = useState(0x3c);
  const emulatorRef = useRef<SlaveEmulator | null>(null);

  // 设备连接状态由侧边栏的 DeviceConnectButton 统一管理（sharedDevice 单例），
  // 这里只订阅 online/deviceIndex 供 MasterTab 使用。
  const deviceState = useSyncExternalStore(sharedDevice.subscribe, sharedDevice.getState);

  return (
    <div className="proto-tool">
      {/* 标签栏（Master/Slave 切换）仅在有从机模拟器时显示；从机隐藏时不渲染这一行，
          避免出现只有一个"总线分析工具(Master)"按钮的冗余行。恢复从机时把 SHOW_SLAVE_TAB 置 true 即可。 */}
      {SHOW_SLAVE_TAB && (
        <div className="proto-top-bar">
          <div className="proto-tab-bar">
            <button className={`proto-tab-btn ${activeTab === 'master' ? 'active' : ''}`} onClick={() => setActiveTab('master')}>{t('serialTool.i2c.tabMaster')}</button>
            <button className={`proto-tab-btn ${activeTab === 'slave' ? 'active' : ''}`} onClick={() => setActiveTab('slave')}>{t('serialTool.i2c.tabSlave')}</button>
          </div>
        </div>
      )}

      <div className="proto-content">
        {SHOW_SLAVE_TAB && activeTab === 'slave' ? (
          <SlaveTab emulatorRef={emulatorRef} enabled={slaveEnabled} onEnabledChange={setSlaveEnabled} slaveAddr={slaveAddr} onSlaveAddrChange={setSlaveAddr} />
        ) : (
          <MasterTab emulatorRef={emulatorRef} slaveEnabled={slaveEnabled} slaveAddr={slaveAddr} deviceOnline={deviceState.online} deviceIndex={deviceState.deviceIndex ?? 0} />
        )}
      </div>
    </div>
  );
};
