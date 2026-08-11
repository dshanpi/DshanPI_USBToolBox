import React, { useState, useRef, useEffect } from 'react';
import { MasterTab } from './Components/MasterTab';
import { SlaveTab } from './Components/SlaveTab';
import { SlaveSimulator } from './lib/SlaveSimulator';
import './ModbusTool.css';

export const ModbusTool: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'master' | 'slave'>('master');
  const [slaveEnabled, setSlaveEnabled] = useState(true);
  const slaveSimRef = useRef<SlaveSimulator>(new SlaveSimulator());

  // Keep slave ref current
  useEffect(() => {
    slaveSimRef.current.enabled = slaveEnabled;
  }, [slaveEnabled]);

  return (
    <div className="proto-tool">
      <div className="proto-top-bar">
        <div className="proto-device-area">
          <span className="status-led" />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
            Modbus Tool
          </span>
        </div>
        <div className="proto-tab-bar">
          <button
            className={`proto-tab-btn ${activeTab === 'master' ? 'active' : ''}`}
            onClick={() => setActiveTab('master')}
          >
            Master (Host)
          </button>
          <button
            className={`proto-tab-btn ${activeTab === 'slave' ? 'active' : ''}`}
            onClick={() => setActiveTab('slave')}
          >
            Slave Simulator
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
