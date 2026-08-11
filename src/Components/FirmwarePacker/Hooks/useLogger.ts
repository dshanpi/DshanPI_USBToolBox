import { useState, useCallback, useRef, useEffect } from 'react';
import { LogEntry } from '../Types';

export const useLogger = (maxLogs: number = 200) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback(
    (level: LogEntry['level'], message: string) => {
      setLogs((prev) => [...prev.slice(-(maxLogs - 1)), { time: new Date(), level, message }]);
    },
    [maxLogs]
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return {
    logs,
    addLog,
    clearLogs,
    logContainerRef,
  };
};
