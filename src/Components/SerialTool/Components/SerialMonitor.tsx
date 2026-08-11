import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LogDirectionFilter, LogExportFormat, LogTimeFilter } from '../serialFeatures';

interface SerialMonitorProps {
  text: string;
  errorMsg?: string;
  onSend: (data: number[], skipEcho?: boolean, requestLocalEcho?: boolean) => void;
  onClear: () => void;
  onExportLog: (format: LogExportFormat) => void;
  canRestore: boolean;
  onRestore: () => void;
  onDeleteLastChar: () => void;
  connected: boolean;
  connecting: boolean;
  showTimestamp: boolean;
  paused: boolean;
  pausedBytes: number;
  onTogglePause: () => void;
  lockToBottom: boolean;
  onToggleLockToBottom: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  directionFilter: LogDirectionFilter;
  onDirectionFilterChange: (filter: LogDirectionFilter) => void;
  timeFilter: LogTimeFilter;
  onTimeFilterChange: (filter: LogTimeFilter) => void;
  visibleEntryCount: number;
  totalEntryCount: number;
}

export const SerialMonitor: React.FC<SerialMonitorProps> = ({
  text,
  errorMsg,
  onSend,
  onClear,
  onExportLog,
  canRestore,
  onRestore,
  onDeleteLastChar,
  connected,
  connecting,
  showTimestamp,
  paused,
  pausedBytes,
  onTogglePause,
  lockToBottom,
  onToggleLockToBottom,
  searchQuery,
  onSearchQueryChange,
  directionFilter,
  onDirectionFilterChange,
  timeFilter,
  onTimeFilterChange,
  visibleEntryCount,
  totalEntryCount,
}) => {
  const { t } = useTranslation();
  const [appendNewline, setAppendNewline] = useState(true);
  const [localEcho, setLocalEcho] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const [exportFormat, setExportFormat] = useState<LogExportFormat>('txt');
  const displayRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const savedSelectionRef = useRef('');

  // Auto-scroll when new text arrives
  useEffect(() => {
    if (lockToBottom && !paused && displayRef.current) {
      displayRef.current.scrollTop = displayRef.current.scrollHeight;
    }
  }, [lockToBottom, paused, text]);

  // Focus the display area so it can receive keyboard input
  useEffect(() => {
    if (connected) {
      displayRef.current?.focus();
    }
  }, [connected]);

  const sendText = useCallback(
    (text: string, skipEcho?: boolean) => {
      const bytes = Array.from(new TextEncoder().encode(text));
      onSend(bytes, skipEcho, !skipEcho && localEcho && !showTimestamp);
    },
    [localEcho, onSend, showTimestamp]
  );

  const sendKey = useCallback((key: string) => sendText(key), [sendText]);

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if (!connected) return;

      // Ctrl+V: paste clipboard text as serial input
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        try {
          const clipText = await navigator.clipboard.readText();
          if (clipText) sendText(clipText);
        } catch {
          // Clipboard access denied
        }
        return;
      }

      // Allow other system shortcuts to pass through (Ctrl+C copy, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        sendKey(appendNewline ? '\n' : '\r');
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        sendText('\x7f', true); // send DEL, skip local echo
        onDeleteLastChar(); // remove last char from display
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        sendKey('\x1b');
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        sendKey('\t');
        return;
      }

      // Printable single characters
      if (e.key.length === 1) {
        e.preventDefault();
        sendKey(e.key);
      }
    },
    [connected, appendNewline, sendKey, sendText, onDeleteLastChar]
  );

  // Right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Save current selection before showing menu (click on menu item may clear selection)
    const sel = window.getSelection();
    if (sel && sel.toString()) {
      savedSelectionRef.current = sel.toString();
    } else {
      savedSelectionRef.current = '';
    }
    setContextMenu({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  }, []);

  const handleContextCopy = useCallback(async () => {
    setContextMenu(null);
    const text = savedSelectionRef.current || window.getSelection()?.toString() || '';
    if (text) {
      await navigator.clipboard.writeText(text);
    }
  }, []);

  const changeFontSize = useCallback((delta: number) => {
    setFontSize((prev) => Math.max(8, Math.min(36, prev + delta)));
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        changeFontSize(e.deltaY < 0 ? 1 : -1);
      }
    },
    [changeFontSize]
  );

  const handleContextPaste = useCallback(async () => {
    setContextMenu(null);
    if (!connected) return;
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) sendText(clipText);
    } catch {
      // Clipboard access denied
    }
  }, [connected, sendText]);

  const statusText = connecting
    ? t('serialTool.status.connecting')
    : connected
      ? t('serialTool.status.connected')
      : t('serialTool.status.disconnected');

  return (
    <div className="serial-monitor">
      <div className="serial-monitor-toolbar">
        <span className="serial-monitor-title">
          <span className={`status-led ${connected ? 'active' : ''}`} />
          {statusText}
        </span>
        <div className="serial-monitor-actions">
          <label className="serial-option-inline" title="Echo typed characters locally">
            <input
              type="checkbox"
              checked={localEcho}
              onChange={(e) => setLocalEcho(e.target.checked)}
            />
            Echo
          </label>
          <label className="serial-option-inline" title="Append newline on Enter">
            <input
              type="checkbox"
              checked={appendNewline}
              onChange={(e) => setAppendNewline(e.target.checked)}
            />
            +\\n
          </label>
          <button
            className={`serial-action-btn ${paused ? 'active warning' : ''}`}
            onClick={onTogglePause}
          >
            {paused
              ? t('serialTool.monitor.resume', { bytes: pausedBytes })
              : t('serialTool.monitor.pause')}
          </button>
          <button
            className={`serial-action-btn ${lockToBottom ? 'active' : ''}`}
            onClick={onToggleLockToBottom}
          >
            {t('serialTool.monitor.lockToBottom')}
          </button>
          <button className="serial-action-btn" onClick={onClear}>
            {t('serialTool.monitor.clear')}
          </button>
          {canRestore && (
            <button
              className="serial-action-btn"
              onClick={onRestore}
              title={t('serialTool.monitor.restore')}
            >
              {t('serialTool.monitor.restore')}
            </button>
          )}
        </div>
      </div>
      <div className="serial-log-tools">
        <input
          type="search"
          className="serial-log-search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder={t('serialTool.monitor.searchPlaceholder')}
          aria-label={t('serialTool.monitor.searchPlaceholder')}
        />
        <select
          className="serial-log-select"
          value={directionFilter}
          onChange={(event) => onDirectionFilterChange(event.target.value as LogDirectionFilter)}
          aria-label={t('serialTool.monitor.directionFilter')}
        >
          <option value="all">{t('serialTool.monitor.directions.all')}</option>
          <option value="received">{t('serialTool.monitor.directions.received')}</option>
          <option value="sent">{t('serialTool.monitor.directions.sent')}</option>
        </select>
        <select
          className="serial-log-select"
          value={timeFilter}
          onChange={(event) => onTimeFilterChange(event.target.value as LogTimeFilter)}
          aria-label={t('serialTool.monitor.timeFilter')}
        >
          <option value="all">{t('serialTool.monitor.times.all')}</option>
          <option value="1m">{t('serialTool.monitor.times.1m')}</option>
          <option value="5m">{t('serialTool.monitor.times.5m')}</option>
          <option value="30m">{t('serialTool.monitor.times.30m')}</option>
        </select>
        <span className="serial-log-count">
          {t('serialTool.monitor.logCount', {
            visible: visibleEntryCount,
            total: totalEntryCount,
          })}
        </span>
        <span className="serial-log-export">
          <select
            className="serial-log-select"
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value as LogExportFormat)}
            aria-label={t('serialTool.monitor.exportFormat')}
          >
            <option value="txt">TXT</option>
            <option value="hex">HEX</option>
            <option value="csv">CSV</option>
          </select>
          <button className="serial-action-btn" onClick={() => onExportLog(exportFormat)}>
            {t('serialTool.monitor.export')}
          </button>
        </span>
      </div>
      <div
        className={`serial-monitor-display interactive ${paused ? 'paused' : ''}`}
        ref={displayRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        onClick={() => {
          displayRef.current?.focus();
          setContextMenu(null);
        }}
      >
        {paused && (
          <div className="serial-paused-banner">
            {t('serialTool.monitor.pausedHint', { bytes: pausedBytes })}
          </div>
        )}
        {errorMsg && <div className="serial-error">{errorMsg}</div>}
        {text ? (
          <pre
            className="serial-output"
            style={{ fontSize: `${fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: text }}
          />
        ) : (
          <div className="serial-placeholder">
            {connected
              ? t('serialTool.monitor.waitingForData')
              : t('serialTool.monitor.openToBegin')}
          </div>
        )}
        {contextMenu && (
          <div className="serial-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button className="context-menu-item" onClick={handleContextCopy}>
              {t('serialTool.contextMenu.copy')}
            </button>
            <button
              className="context-menu-item"
              onClick={handleContextPaste}
              disabled={!connected}
            >
              {t('serialTool.contextMenu.paste')}
            </button>
            <div className="context-menu-sep" />
            <button
              className="context-menu-item"
              onClick={() => {
                setContextMenu(null);
                onExportLog(exportFormat);
              }}
            >
              {t('serialTool.contextMenu.saveLog')}
            </button>
            <div className="context-menu-sep" />
            <button
              className="context-menu-item"
              onClick={() => {
                setContextMenu(null);
                changeFontSize(1);
              }}
            >
              {t('serialTool.contextMenu.fontIncrease')}
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                setContextMenu(null);
                changeFontSize(-1);
              }}
            >
              {t('serialTool.contextMenu.fontDecrease')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
