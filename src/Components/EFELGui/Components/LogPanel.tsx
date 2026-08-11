import React from 'react';
import { useTranslation } from 'react-i18next';
import type { LogEntry } from '../Types';
import { formatTime } from '../Utils';

interface LogPanelProps {
  logs: LogEntry[];
  logContainerRef: React.RefObject<HTMLDivElement | null>;
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs, logContainerRef }) => {
  const { t } = useTranslation();

  return (
    <div className="efex-log-container">
      <div className="section-header">{t('efelGui.log.title', '日志')}</div>
      <div className="efex-log" ref={logContainerRef}>
        {logs.length === 0 ? (
          <div className="efex-empty">{t('efelGui.log.noLog', '暂无日志')}</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`efex-log-entry log-${log.level.toLowerCase()}`}>
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
