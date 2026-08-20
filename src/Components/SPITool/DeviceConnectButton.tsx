import React, { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlug, faRotate } from '@fortawesome/free-solid-svg-icons';
import { invokeCommand } from '../../Platform/IPC';
import { sharedDevice } from './sharedDevice';
import './DeviceConnectButton.css';

/**
 * 侧边栏 CH347 设备连接按钮（全局）。
 *
 * I2C / SPI / SPI 点屏三个工具共享同一台 CH347 设备（sharedDevice 单例），
 * 因此设备连接状态全局唯一 -- 用这一个按钮统一展示与控制，替代原先散落在
 * 各工具顶栏的"状态灯 + 设备下拉 + 刷新 + 打开/关闭"那一排。
 *
 * 按钮展示：
 *   - 已连接：绿色高亮 + 当前设备名，点击断开。
 *   - 未连接但有可用设备：中性灰 + 设备名，点击连接。
 *   - 未连接且无设备：中性灰 + "无设备"，连接按钮置灰，旁边可手动刷新。
 *
 * 自动连接（sharedDevice 热插拔事件扫描）会在设备出现时自动打开；本按钮在此基础上
 * 提供手动开/关：手动关闭后 sharedDevice.autoDisconnected=false，不会立即重连，
 * 直到设备重新插拔。详见 sharedDevice.ts。
 */
export const DeviceConnectButton: React.FC = () => {
  const { t } = useTranslation();
  const deviceState = useSyncExternalStore(sharedDevice.subscribe, sharedDevice.getState);

  const online = deviceState.online;
  // 当前选中的设备（deviceIndex 可能指向一个已消失的设备，此时 current 为 null）
  const current = deviceState.devices.find((d) => d.index === deviceState.deviceIndex) ?? null;
  const hasDevice = deviceState.devices.length > 0;

  const handleClick = async () => {
    if (online) {
      // 断开：手动关闭（autoDisconnected=false，不会立即重连）
      if (deviceState.deviceIndex !== null) {
        try {
          await invokeCommand('ch347_close', { index: deviceState.deviceIndex });
        } catch {
          /* ignore */
        }
      }
      sharedDevice.setOnline(false);
    } else {
      // 连接：优先当前选中的设备，否则第一个可用设备
      const target = current?.index ?? deviceState.devices[0]?.index ?? null;
      if (target === null) return;
      try {
        await invokeCommand('ch347_open', { index: target });
        if (deviceState.deviceIndex !== target) sharedDevice.setDeviceIndex(target);
        sharedDevice.clearAutoDisconnected();
        sharedDevice.setOnline(true);
      } catch (e) {
        console.error('Connect failed:', e);
      }
    }
  };

  const handleRefresh = async () => {
    try {
      await sharedDevice.rescan();
    } catch (e) {
      console.error('Device rescan failed:', e);
    }
  };

  // 文案：有当前设备就显示设备名；否则有可用设备显示第一个；都没有显示"无设备"。
  const displayDevice = current ?? deviceState.devices[0] ?? null;
  const label = displayDevice
    ? displayDevice.friendlyName?.trim() || displayDevice.name
    : t('serialTool.deviceConnect.noDevice');

  const disabled = !online && !hasDevice;

  const title = online
    ? t('serialTool.deviceConnect.tooltipConnected')
    : hasDevice
      ? t('serialTool.deviceConnect.tooltipDisconnected')
      : t('serialTool.deviceConnect.tooltipNoDevice');

  return (
    <div
      className={`device-connect-control ${!online && !hasDevice ? 'device-connect-control--empty' : ''}`}
    >
      <motion.button
        type="button"
        className={`device-connect-btn ${online ? 'device-connect-btn--online' : ''} ${
          disabled ? 'device-connect-btn--disabled' : ''
        }`}
        onClick={handleClick}
        title={title}
        disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.02 }}
        whileTap={{ scale: disabled ? 1 : 0.97 }}
        transition={{ duration: 0.12 }}
      >
        <FontAwesomeIcon icon={faPlug} className="device-connect-btn-icon" />
        <span className="device-connect-btn-label">{label}</span>
      </motion.button>
      {!online && !hasDevice && (
        <button
          type="button"
          className="device-refresh-btn"
          onClick={handleRefresh}
          disabled={deviceState.scanning}
          title={
            deviceState.scanning
              ? t('serialTool.deviceConnect.scanning')
              : t('serialTool.deviceConnect.refresh')
          }
          aria-label={
            deviceState.scanning
              ? t('serialTool.deviceConnect.scanning')
              : t('serialTool.deviceConnect.refresh')
          }
        >
          <FontAwesomeIcon
            icon={faRotate}
            className={deviceState.scanning ? 'device-refresh-icon--spinning' : ''}
          />
        </button>
      )}
    </div>
  );
};
