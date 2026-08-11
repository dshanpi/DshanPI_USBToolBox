import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SlaveEmulator, type SlaveDeviceType } from '../lib/SlaveEmulator';

interface SlaveTabProps {
  emulatorRef: React.MutableRefObject<SlaveEmulator | null>;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  slaveAddr: number;
  onSlaveAddrChange: (v: number) => void;
}

export const SlaveTab: React.FC<SlaveTabProps> = ({
  emulatorRef,
  enabled,
  onEnabledChange,
  slaveAddr: _slaveAddr,
  onSlaveAddrChange,
}) => {
  const { t } = useTranslation();
  const [deviceType, setDeviceType] = useState<SlaveDeviceType>('memory');
  const [addrInput, setAddrInput] = useState('0x3C');
  const [displayData, setDisplayData] = useState<{ type: SlaveDeviceType; dump?: string; content?: string } | null>(null);

  const refreshDisplay = useCallback(() => {
    if (emulatorRef.current) setDisplayData(emulatorRef.current.getDisplayData());
  }, [emulatorRef]);

  useEffect(() => {
    if (!emulatorRef.current) {
      const emu = new SlaveEmulator('memory', 0x3c);
      emu.setOnUpdate(() => refreshDisplay());
      emulatorRef.current = emu;
    }
    refreshDisplay();
  }, [emulatorRef, refreshDisplay]);

  const handleToggle = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onEnabledChange(e.target.checked);
  }, [onEnabledChange]);

  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as SlaveDeviceType;
    setDeviceType(newType);
    if (emulatorRef.current) {
      emulatorRef.current.setType(newType);
      refreshDisplay();
    }
  }, [emulatorRef, refreshDisplay]);

  const handleAddrChange = useCallback(() => {
    let s = addrInput.trim();
    if (s.toLowerCase().startsWith('0x')) s = s.slice(2);
    const val = parseInt(s, 16);
    if (!isNaN(val)) {
      const addr = val & 0x7f;
      onSlaveAddrChange(addr);
      if (emulatorRef.current) {
        emulatorRef.current.setAddress(addr);
        refreshDisplay();
      }
    }
  }, [addrInput, onSlaveAddrChange, emulatorRef, refreshDisplay]);

  const handleReset = useCallback(() => {
    if (emulatorRef.current) {
      emulatorRef.current.reset();
      refreshDisplay();
    }
  }, [emulatorRef, refreshDisplay]);

  const handleInject = useCallback(() => {
    if (emulatorRef.current) {
      emulatorRef.current.injectTestData();
      refreshDisplay();
    }
  }, [emulatorRef, refreshDisplay]);

  return (
    <div className="i2c-card">
      <div className="i2c-card-header">
        <span className="i2c-card-icon">&#127899;</span>
        {t('serialTool.i2c.slave.title')}
      </div>
      <div className="i2c-card-content">
        <div className="i2c-toggle-row">
          <span>{t('serialTool.i2c.slave.enable')}</span>
          <label className="i2c-switch">
            <input type="checkbox" checked={enabled} onChange={handleToggle} />
            <span className="i2c-slider" />
          </label>
        </div>

        <div className="i2c-param-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="i2c-param-field">
            <label>{t('serialTool.i2c.slave.deviceType')}</label>
            <select className="i2c-select" value={deviceType} onChange={handleTypeChange}>
              <option value="memory">{t('serialTool.i2c.slave.typeMemory')}</option>
              <option value="screen">{t('serialTool.i2c.slave.typeScreen')}</option>
            </select>
          </div>
          <div className="i2c-param-field">
            <label>{t('serialTool.i2c.slave.address')}</label>
            <input
              className="i2c-input"
              type="text"
              value={addrInput}
              onChange={(e) => setAddrInput(e.target.value)}
              onBlur={handleAddrChange}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddrChange(); }}
              placeholder="0x3C"
            />
          </div>
        </div>

        <div className="i2c-device-view">
          {displayData?.type === 'memory' ? (
            <>
              <div className="i2c-device-header">
                <span>{t('serialTool.i2c.slave.memoryContent')}</span>
                <span className="i2c-badge">EEPROM</span>
              </div>
              <pre className="i2c-mem-dump">{displayData.dump}</pre>
              <div className="i2c-device-hint">{t('serialTool.i2c.slave.memoryHint')}</div>
            </>
          ) : (
            <>
              <div className="i2c-device-header">
                <span>{t('serialTool.i2c.slave.screenContent')}</span>
                <span className="i2c-badge">OLED</span>
              </div>
              <pre className="i2c-screen-text">{displayData?.content || t('serialTool.i2c.slave.screenEmpty')}</pre>
              <div className="i2c-device-hint">{t('serialTool.i2c.slave.screenHint')}</div>
            </>
          )}
        </div>

        <div className="i2c-btn-group" style={{ justifyContent: 'space-between', marginTop: 16 }}>
          <button className="i2c-btn" onClick={handleReset}>{t('serialTool.i2c.slave.reset')}</button>
          <button className="i2c-btn" onClick={handleInject}>{t('serialTool.i2c.slave.inject')}</button>
        </div>

        <div className="i2c-slave-status">
          <span className={`status-led ${enabled ? 'active' : ''}`} />
          <span>{enabled ? t('serialTool.i2c.slave.running') : t('serialTool.i2c.slave.stopped')}</span>
          <span className="i2c-slave-info">
            ({deviceType === 'memory' ? t('serialTool.i2c.slave.typeMemory') : t('serialTool.i2c.slave.typeScreen')} @ 0x{(_slaveAddr & 0x7f).toString(16)})
          </span>
        </div>
      </div>
    </div>
  );
};
