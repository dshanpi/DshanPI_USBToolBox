import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogEntry } from '../../../FlashManager';
import { formatLogTime, getLogClassName, getLogLevelDisplay } from '../../../Utils';
import { useLogContainerSize } from '../Hooks';

interface FlashLogProps {
  logs: LogEntry[];
}

export const FlashLog: React.FC<FlashLogProps> = ({ logs }) => {
  const { t } = useTranslation();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const { maxHeight } = useLogContainerSize(sectionRef);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="fd-section fd-section-log" ref={sectionRef}>
      <h3>{t('firmwareDownloader.flashLog.title', '烧录日志')}</h3>
      <div
        className="fd-log-container"
        ref={logContainerRef}
        style={{ minHeight: `${maxHeight}px`, maxHeight: `${maxHeight}px` }}
      >
        {logs.length === 0 ? (
          <div className="fd-empty-state">
            <span>{t('firmwareDownloader.flashLog.noLog', '暂无日志')}</span>
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={getLogClassName(log.level)}>
              <span className="log-time">[{formatLogTime(log.timestamp)}]</span>
              <span className="log-level">[{getLogLevelDisplay(log.level)}]</span>
              <span className="log-message">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
