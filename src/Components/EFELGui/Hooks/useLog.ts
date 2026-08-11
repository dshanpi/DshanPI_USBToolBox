import { useState, useCallback, useRef, useEffect } from 'react';
import type { LogEntry } from '../Types';

export interface UseLogReturn {
  logs: LogEntry[];
  logContainerRef: React.RefObject<HTMLDivElement | null>;
  addLog: (level: string, message: string) => void;
}

export const useLog = (): UseLogReturn => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = useCallback((level: string, message: string) => {
    setLogs((prev) => [...prev.slice(-200), { time: new Date(), level, message }]);
  }, []);

  return {
    logs,
    logContainerRef,
    addLog,
  };
};
