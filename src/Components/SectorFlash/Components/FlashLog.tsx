import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogEntry } from '../../../FlashManager';
import { formatLogTime, getLogLevelDisplay } from '../../../Utils';

interface FlashLogProps {
  logs: LogEntry[];
}

export const FlashLog: React.FC<FlashLogProps> = ({ logs }) => {
  const { t } = useTranslation();
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="sf-log-container">
      <div className="sf-section-header">{t('sectorFlash.flashControl.logTitle', '日志')}</div>
      <div className="sf-log" ref={logContainerRef}>
        {logs.length === 0 ? (
          <div className="sf-empty">{t('firmwareDownloader.flashLog.noLog', '暂无日志')}</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`sf-log-entry log-${log.level}`}>
              <span className="log-time">[{formatLogTime(log.timestamp)}]</span>
              <span className="log-level">[{getLogLevelDisplay(log.level)}]</span>
              <span className="log-msg">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
