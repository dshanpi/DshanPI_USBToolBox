import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '../../../Utils';
import type { MassProductionLog } from '../Types';

interface LogPanelProps {
  logs: MassProductionLog[];
}

const LOG_LEVEL_DISPLAYS: Record<string, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERRO',
  success: 'OKAY',
};

export const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelDisplay = (level: string) => LOG_LEVEL_DISPLAYS[level] || level;

  return (
    <div className="mp-log-container">
      <div className="section-header">{t('massProduction.logTitle', '日志')}</div>
      <div className="mp-log" ref={containerRef}>
        {logs.length === 0 ? (
          <div className="mp-empty">{t('massProduction.noLog', '暂无日志')}</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`mp-log-entry log-${getLevelDisplay(log.level).toLowerCase()}`}>
              <span className="log-time">[{formatTime(log.timestamp)}]</span>
              <span className="log-level">[{getLevelDisplay(log.level)}]</span>
              <span className="log-msg">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
