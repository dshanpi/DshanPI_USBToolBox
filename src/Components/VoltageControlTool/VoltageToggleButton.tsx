import React, { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt } from '@fortawesome/free-solid-svg-icons';
import { sharedDevice } from '../SPITool/sharedDevice';
import { voltageState } from './voltageState';
import './VoltageToggleButton.css';

/**
 * 侧边栏电压切换按钮（全局）。
 *
 * 通过 voltageState 单例控制 CH347 的 GPIO0 电平：
 *   - 使能（3.3V）：拉高 GPIO0
 *   - 未使能（1.8V）：拉低 GPIO0
 *
 * 按钮内直接显示当前电压值（3.3V / 1.8V），颜色随状态变化，让用户一眼看出电平。
 * 仅在 CH347 设备已连接（sharedDevice.online）时可操作 -- 设备由 I2C/SPI/SPIDisplay
 * 等工具打开，本按钮只负责切换 GPIO0，不负责打开/关闭设备。
 *
 * 放置在侧边栏 footer 顶部（登录按钮之上），因此所有工具界面都能控制电压。
 */
export const VoltageToggleButton: React.FC = () => {
  const { t } = useTranslation();
  const deviceState = useSyncExternalStore(sharedDevice.subscribe, sharedDevice.getState);
  const voltage = useSyncExternalStore(voltageState.subscribe, voltageState.getState);

  const online = deviceState.online;
  const enabled = voltage.enabled;
  const busy = voltage.busy;

  const handleClick = () => {
    void voltageState.toggle();
  };

  // 设备未连接时按钮置灰，但仍显示启动默认电压（3.3V）。
  const disabled = !online || busy;

  const label = enabled
    ? t('serialTool.voltageControl.voltage3v3', '3.3V')
    : t('serialTool.voltageControl.voltage1v8', '1.8V');

  const title = online
    ? t('serialTool.voltageControl.toggleTitle', 'GPIO0 电压切换 (3.3V / 1.8V)')
    : t('serialTool.voltageControl.toggleTitleOffline', 'GPIO0 电压切换（需先连接 CH347 设备）');

  return (
    <motion.button
      type="button"
      className={`voltage-toggle-btn ${enabled ? 'voltage-toggle-btn--on' : ''} ${
        disabled ? 'voltage-toggle-btn--disabled' : ''
      }`}
      onClick={handleClick}
      title={title}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      transition={{ duration: 0.12 }}
      aria-pressed={enabled}
    >
      <FontAwesomeIcon icon={faBolt} className="voltage-toggle-btn-icon" />
      <span className="voltage-toggle-btn-label">{label}</span>
    </motion.button>
  );
};
