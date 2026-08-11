import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SpiSlaveSim, type SpiSlaveType } from '../lib/SpiSlaveSim';

interface SPISlaveTabProps {
  slaveRef: React.MutableRefObject<SpiSlaveSim | null>;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  onCsChange: (v: number) => void;
  addLog: (msg: string, isErr?: boolean) => void;
}

export const SPISlaveTab: React.FC<SPISlaveTabProps> = ({ slaveRef, enabled, onEnabledChange, onCsChange, addLog }) => {
  const { t } = useTranslation();
  const [deviceType, setDeviceType] = useState<SpiSlaveType>('eeprom');
  const [simCs, setSimCs] = useState('0');
  const [displayData, setDisplayData] = useState<{ type: SpiSlaveType; dump?: string; sensorInfo?: string } | null>(null);

  const refreshUI = useCallback(() => {
    if (slaveRef.current) setDisplayData(slaveRef.current.getDisplayData());
  }, [slaveRef]);

  useEffect(() => {
    if (!slaveRef.current) {
      const slave = new SpiSlaveSim('eeprom');
      slave.setOnUpdate(() => refreshUI());
      slaveRef.current = slave;
    }
    refreshUI();
  }, [slaveRef, refreshUI]);

  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const t = e.target.value as SpiSlaveType;
    setDeviceType(t);
    if (slaveRef.current) { slaveRef.current.setType(t); refreshUI(); }
  }, [slaveRef, refreshUI]);

  const handleCsBlur = useCallback(() => {
    const v = parseInt(simCs, 10);
    if (!isNaN(v)) onCsChange(v & 1);
  }, [simCs, onCsChange]);

  return (
    <div className="i2c-card">
      <div className="i2c-card-header">
        <span className="i2c-card-icon">&#127899;</span>
        {t('serialTool.spi.slave.title')}
      </div>
      <div className="i2c-card-content">
        <div className="i2c-toggle-row">
          <span>{t('serialTool.spi.slave.enable')}</span>
          <label className="i2c-switch">
            <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} />
            <span className="i2c-slider" />
          </label>
        </div>

        <div className="i2c-param-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="i2c-param-field">
            <label>{t('serialTool.spi.slave.deviceType')}</label>
            <select className="i2c-select" value={deviceType} onChange={handleTypeChange}>
              <option value="eeprom">{t('serialTool.spi.slave.typeEeprom')}</option>
              <option value="sensor">{t('serialTool.spi.slave.typeSensor')}</option>
            </select>
          </div>
          <div className="i2c-param-field">
            <label>{t('serialTool.spi.slave.cs')}</label>
            <input className="i2c-input" type="number" value={simCs} onChange={(e) => setSimCs(e.target.value)} onBlur={handleCsBlur} min={0} max={1} />
          </div>
        </div>

        <div className="i2c-device-view">
          {displayData?.type === 'eeprom' ? (
            <>
              <div className="i2c-device-header">
                <span>{t('serialTool.spi.slave.memoryContent')}</span>
                <span className="i2c-badge">25xx EEPROM</span>
              </div>
              <pre className="i2c-mem-dump">{displayData.dump}</pre>
            </>
          ) : (
            <>
              <div className="i2c-device-header">
                <span>{t('serialTool.spi.slave.sensorContent')}</span>
                <span className="i2c-badge">Sensor</span>
              </div>
              <pre className="i2c-screen-text">{displayData?.sensorInfo || ''}</pre>
            </>
          )}
        </div>

        <div className="i2c-btn-group" style={{ justifyContent: 'space-between', marginTop: 16 }}>
          <button className="i2c-btn" onClick={() => { if (slaveRef.current) { slaveRef.current.reset(); refreshUI(); addLog(t('serialTool.spi.logSlaveReset')); } }}>{t('serialTool.spi.slave.reset')}</button>
          <button className="i2c-btn" onClick={() => { if (slaveRef.current) { slaveRef.current.injectTest(); refreshUI(); addLog(t('serialTool.spi.logSlaveInject')); } }}>{t('serialTool.spi.slave.inject')}</button>
        </div>
      </div>
    </div>
  );
};
