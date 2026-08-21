import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MasterTab } from './Components/MasterTab';
import { SlaveTab } from './Components/SlaveTab';
import { SlaveSimulator } from './lib/SlaveSimulator';
import './ModbusTool.css';

export const ModbusTool: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'master' | 'slave'>('master');
  const [slaveEnabled, setSlaveEnabled] = useState(true);
  const slaveSimRef = useRef<SlaveSimulator>(new SlaveSimulator());

  // Keep slave ref current
  useEffect(() => {
    slaveSimRef.current.enabled = slaveEnabled;
  }, [slaveEnabled]);

  return (
    <div className="proto-tool modbus-workbench">
      <div className="proto-top-bar modbus-workbench-bar">
        <div className="proto-device-area">
          <span className="modbus-workbench-title">{t('modbus.title')}</span>
        </div>
        <div className="proto-tab-bar">
          <button
            className={`proto-tab-btn ${activeTab === 'master' ? 'active' : ''}`}
            onClick={() => setActiveTab('master')}
          >
            {t('modbus.masterTab')}
          </button>
          <button
            className={`proto-tab-btn ${activeTab === 'slave' ? 'active' : ''}`}
            onClick={() => setActiveTab('slave')}
          >
            {t('modbus.slaveTab')}
          </button>
        </div>
      </div>

      <div className="proto-content">
        {activeTab === 'master' ? (
          <MasterTab slaveSimRef={slaveSimRef} slaveEnabled={slaveEnabled} />
        ) : (
          <SlaveTab
            slaveSimRef={slaveSimRef}
            slaveEnabled={slaveEnabled}
            onSlaveEnabledChange={setSlaveEnabled}
          />
        )}
      </div>
    </div>
  );
};
