import { useState, useCallback } from 'react';
import { LogEntry, LogLevel } from '../FlashManager';

/**
 * Configuration options for the useLogger hook.
 */
export interface UseLoggerOptions {
  /** Maximum number of log entries to retain (default 500) */
  maxLogs?: number;
}

/**
 * React hook for managing log entries with size limit.
 *
 * Provides a simple logging system for components that need
 * to track operations, errors, and status messages. Logs are
 * capped at maxLogs entries to prevent memory growth.
 *
 * Example usage:
 * ```typescript
 * const { logs, addLog, clearLogs } = useLogger({ maxLogs: 100 });
 * addLog('info', 'Starting operation...');
 * addLog('error', 'Operation failed');
 * ```
 *
 * @param options - Configuration options
 * @returns Object with logs array, addLog, clearLogs, and setLogs functions
 */
export function useLogger(options?: UseLoggerOptions) {
  const maxLogs = options?.maxLogs ?? 500;
  const [logs, setLogs] = useState<LogEntry[]>([]);

  /**
   * Adds a new log entry to the log list.
   *
   * Appends new entry and removes oldest entries if exceeding maxLogs.
   *
   * @param level - Log level (info, warn, error, success)
   * @param message - Log message content
   */
  const addLog = useCallback(
    (level: LogLevel, message: string) => {
      setLogs((prev) => [
        ...prev.slice(-maxLogs),
        {
          timestamp: new Date(),
          level,
          message,
        },
      ]);
    },
    [maxLogs]
  );

  /**
   * Clears all log entries.
   */
  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, addLog, clearLogs, setLogs };
}