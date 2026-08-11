import React from 'react';
import { useTranslation } from 'react-i18next';
import type { LogEntry } from '../Types';

interface LogPanelProps {
  logs: LogEntry[];
  logContainerRef: React.RefObject<HTMLDivElement | null>;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false });
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs, logContainerRef }) => {
  const { t } = useTranslation();

  return (
    <div className="dram-log-container">
      <div className="section-header">{t('dramTunning.log.title', 'Log')}</div>
      <div className="dram-log" ref={logContainerRef}>
        {logs.length === 0 ? (
          <div className="dram-empty">{t('dramTunning.log.noLog', 'No logs yet')}</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`dram-log-entry log-${log.level.toLowerCase()}`}>
              <span className="log-time">[{formatTime(log.time)}]</span>
              <span className="log-level">[{log.level}]</span>
              <span className="log-msg">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
