import React, { useState, useCallback, useRef, useEffect, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

interface SendItem {
  id: number;
  text: string;
}

interface MultiSendPanelProps {
  onSend: (data: number[]) => void;
  connected: boolean;
  active: boolean;
  sessionId: string;
}

export interface MultiSendPanelHandle {
  stopScheduledSends: () => void;
}

const DEFAULT_ITEMS: SendItem[] = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  text: '',
}));

let nextId = 10;

const LEGACY_STORAGE_KEY = 'serial-multi-send-items';
const SESSION_STORAGE_PREFIX = 'serial-multi-send-items:';

export const MultiSendPanel = React.forwardRef<MultiSendPanelHandle, MultiSendPanelProps>(
  ({ onSend, connected, active, sessionId }, ref) => {
    const { t } = useTranslation();
    const storageKey = `${SESSION_STORAGE_PREFIX}${sessionId}`;
    const [items, setItems] = useState<SendItem[]>(() => {
      try {
        const saved = localStorage.getItem(storageKey) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch {
        /* ignore */
      }
      return DEFAULT_ITEMS;
    });
    const [cycleEnabled, setCycleEnabled] = useState(false);
    const [cycleDelay, setCycleDelay] = useState(500);
    const [currentCycleIdx, setCurrentCycleIdx] = useState(-1);
    const [appendNewline, setAppendNewline] = useState(true);
    const [hexMode, setHexMode] = useState(false);
    const [collapsed, setCollapsed] = useState(true);
    const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const batchTimerRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
    const cycleIdxRef = useRef(0);
    const itemsRef = useRef(items);
    const onSendRef = useRef(onSend);
    const connectedRef = useRef(connected);
    const activeRef = useRef(active);
    itemsRef.current = items;
    onSendRef.current = onSend;
    connectedRef.current = connected;
    activeRef.current = active;

    // Persist items to localStorage
    useEffect(() => {
      localStorage.setItem(storageKey, JSON.stringify(items));
    }, [items, storageKey]);

    const clearBatchTimers = useCallback(() => {
      batchTimerRefs.current.forEach((timer) => clearTimeout(timer));
      batchTimerRefs.current.clear();
    }, []);

    const stopScheduledSends = useCallback(() => {
      if (cycleTimerRef.current) {
        clearInterval(cycleTimerRef.current);
        cycleTimerRef.current = null;
      }
      clearBatchTimers();
      cycleIdxRef.current = 0;
      setCycleEnabled(false);
      setCurrentCycleIdx(-1);
    }, [clearBatchTimers]);

    useImperativeHandle(ref, () => ({ stopScheduledSends }), [stopScheduledSends]);

    useEffect(() => {
      if (!connected || !active) stopScheduledSends();
    }, [active, connected, stopScheduledSends]);

    useEffect(() => {
      const batchTimers = batchTimerRefs.current;
      return () => {
        if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
        batchTimers.forEach((timer) => clearTimeout(timer));
        batchTimers.clear();
      };
    }, []);

    const updateItem = useCallback((id: number, text: string) => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, text } : item)));
    }, []);

    const addItem = useCallback(() => {
      setItems((prev) => [...prev, { id: nextId++, text: '' }]);
    }, []);

    const removeItem = useCallback((id: number) => {
      setItems((prev) => {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item.id !== id);
      });
    }, []);

    const buildData = useCallback(
      (text: string): number[] => {
        if (hexMode) {
          const hex = text.replace(/\s/g, '');
          const bytes: number[] = [];
          for (let i = 0; i < hex.length; i += 2) {
            const byte = parseInt(hex.substring(i, i + 2), 16);
            if (!isNaN(byte)) bytes.push(byte);
          }
          return bytes;
        }
        const str = appendNewline ? text + '\n' : text;
        return Array.from(new TextEncoder().encode(str));
      },
      [appendNewline, hexMode]
    );
    const buildDataRef = useRef(buildData);
    buildDataRef.current = buildData;

    const sendItem = useCallback(
      (item: SendItem) => {
        if (!active || !connected || !item.text.trim()) return;
        onSendRef.current(buildDataRef.current(item.text));
      },
      [active, connected]
    );

    const sendAll = useCallback(() => {
      if (!active || !connected) return;
      // A session owns one scheduled transmission sequence at a time. Starting
      // a batch replaces any previous batch or cycle instead of interleaving it.
      stopScheduledSends();
      const filled = items.filter((item) => item.text.trim());
      const delay = Number.isFinite(cycleDelay) ? Math.max(50, cycleDelay) : 500;
      filled.forEach((item, i) => {
        const timer = setTimeout(() => {
          batchTimerRefs.current.delete(timer);
          if (!activeRef.current || !connectedRef.current) return;
          onSendRef.current(buildDataRef.current(item.text));
        }, i * delay);
        batchTimerRefs.current.add(timer);
      });
    }, [active, connected, cycleDelay, items, stopScheduledSends]);

    const toggleCycle = useCallback(() => {
      if (cycleEnabled) {
        stopScheduledSends();
        return;
      }
      if (!active || !connected) return;
      clearBatchTimers();
      const filled = items.filter((item) => item.text.trim());
      if (filled.length === 0) return;
      const first = filled[0];
      setCurrentCycleIdx(items.findIndex((item) => item.id === first.id));
      onSendRef.current(buildDataRef.current(first.text));
      cycleIdxRef.current = filled.length > 1 ? 1 : 0;
      setCycleEnabled(true);
    }, [active, clearBatchTimers, connected, cycleEnabled, items, stopScheduledSends]);

    // The interval reads the latest item list, format flags, and session callback
    // from refs. Changing the delay only recreates the timer; it does not resend
    // the first row or keep a stale port/configuration closure alive.
    useEffect(() => {
      if (!cycleEnabled || !active || !connected) return;
      const delay = Number.isFinite(cycleDelay) ? Math.max(50, cycleDelay) : 500;
      cycleTimerRef.current = setInterval(() => {
        const currentItems = itemsRef.current;
        const filled = currentItems.filter((item) => item.text.trim());
        if (filled.length === 0) {
          stopScheduledSends();
          return;
        }
        const filledIndex = cycleIdxRef.current % filled.length;
        const item = filled[filledIndex];
        cycleIdxRef.current = (filledIndex + 1) % filled.length;
        setCurrentCycleIdx(currentItems.findIndex((candidate) => candidate.id === item.id));
        onSendRef.current(buildDataRef.current(item.text));
      }, delay);
      return () => {
        if (cycleTimerRef.current) {
          clearInterval(cycleTimerRef.current);
          cycleTimerRef.current = null;
        }
      };
    }, [active, connected, cycleDelay, cycleEnabled, stopScheduledSends]);

    useEffect(() => {
      if (cycleEnabled && !items.some((item) => item.text.trim())) stopScheduledSends();
    }, [cycleEnabled, items, stopScheduledSends]);

    const handleSave = useCallback(async () => {
      try {
        const path = await save({
          defaultPath: 'serial-send-items.json',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (path) {
          const data = JSON.stringify({ items, appendNewline, hexMode, cycleDelay }, null, 2);
          await writeTextFile(path, data);
        }
      } catch (e) {
        console.error('Save failed:', e);
      }
    }, [items, appendNewline, hexMode, cycleDelay]);

    const handleLoad = useCallback(async () => {
      try {
        const path = await open({
          filters: [{ name: 'JSON', extensions: ['json'] }],
          multiple: false,
        });
        if (path) {
          const data = await readTextFile(path);
          const parsed = JSON.parse(data);
          stopScheduledSends();
          if (parsed.items && Array.isArray(parsed.items)) {
            setItems(parsed.items);
          }
          if (typeof parsed.appendNewline === 'boolean') setAppendNewline(parsed.appendNewline);
          if (typeof parsed.hexMode === 'boolean') setHexMode(parsed.hexMode);
          if (typeof parsed.cycleDelay === 'number') setCycleDelay(parsed.cycleDelay);
        }
      } catch (e) {
        console.error('Load failed:', e);
      }
    }, [stopScheduledSends]);

    const handleReset = useCallback(() => {
      setItems(DEFAULT_ITEMS);
      setAppendNewline(true);
      setHexMode(false);
      setCycleDelay(500);
      stopScheduledSends();
    }, [stopScheduledSends]);

    const filledCount = items.filter((item) => item.text.trim()).length;

    if (collapsed) {
      return (
        <div className="multi-send-panel collapsed">
          <button
            className="multi-send-collapse-btn"
            onClick={() => setCollapsed(false)}
            title={t('serialTool.multiSend.expand')}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <span className="multi-send-collapsed-title">{t('serialTool.multiSend.title')}</span>
        </div>
      );
    }

    return (
      <div className="multi-send-panel">
        <div className="multi-send-header">
          <span className="multi-send-title">{t('serialTool.multiSend.title')}</span>
          <div className="multi-send-header-actions">
            <span className="multi-send-count">
              {filledCount}/{items.length}
            </span>
            <button
              className="multi-send-collapse-btn"
              onClick={() => setCollapsed(true)}
              title={t('serialTool.multiSend.collapse')}
            >
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
        </div>

        <div className="multi-send-list">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className={`multi-send-row ${idx === currentCycleIdx ? 'active' : ''}`}
            >
              <span className="multi-send-index">{idx + 1}</span>
              <input
                type="text"
                className="multi-send-input"
                value={item.text}
                onChange={(e) => updateItem(item.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendItem(item);
                  }
                }}
                placeholder={hexMode ? 'A1 B2 C3' : `#${idx + 1}`}
                disabled={!connected}
              />
              <button
                className="multi-send-row-btn"
                onClick={() => sendItem(item)}
                disabled={!connected || !item.text.trim()}
                title={t('serialTool.multiSend.sendItem')}
              >
                ▶
              </button>
              <button
                className="multi-send-row-btn multi-send-remove"
                onClick={() => removeItem(item.id)}
                disabled={!connected || items.length <= 1}
                title={t('serialTool.multiSend.remove')}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          className="multi-send-add-btn"
          onClick={addItem}
          disabled={!connected}
          title={t('serialTool.multiSend.addItem')}
        >
          + {t('serialTool.multiSend.add')}
        </button>

        <div className="multi-send-controls">
          <label className="multi-send-option">
            <input
              type="checkbox"
              checked={appendNewline}
              onChange={(e) => setAppendNewline(e.target.checked)}
              disabled={hexMode}
            />
            {t('serialTool.multiSend.appendNewline')}
          </label>
          <label className="multi-send-option">
            <input
              type="checkbox"
              checked={hexMode}
              onChange={(e) => setHexMode(e.target.checked)}
            />
            {t('serialTool.multiSend.hex')}
          </label>

          <div className="multi-send-delay">
            <span className="delay-label">{t('serialTool.multiSend.delay')}</span>
            <input
              type="number"
              className="delay-input"
              value={cycleDelay}
              onChange={(e) => setCycleDelay(Number(e.target.value))}
              min={50}
              max={60000}
              step={50}
            />
            <span className="delay-unit">{t('serialTool.multiSend.ms')}</span>
          </div>
        </div>

        <div className="multi-send-actions">
          <button
            className="multi-send-action-btn send-all"
            onClick={sendAll}
            disabled={!connected || filledCount === 0}
          >
            {t('serialTool.multiSend.sendAll')}
          </button>
          <button
            className={`multi-send-action-btn cycle ${cycleEnabled ? 'active' : ''}`}
            onClick={toggleCycle}
            disabled={!connected || filledCount === 0}
          >
            {cycleEnabled ? t('serialTool.multiSend.stop') : t('serialTool.multiSend.cycle')}
          </button>
        </div>

        <div className="multi-send-file-actions">
          <button className="multi-send-file-btn" onClick={handleSave}>
            {t('serialTool.multiSend.save')}
          </button>
          <button className="multi-send-file-btn" onClick={handleLoad}>
            {t('serialTool.multiSend.load')}
          </button>
          <button className="multi-send-file-btn" onClick={handleReset}>
            {t('serialTool.multiSend.reset')}
          </button>
        </div>
      </div>
    );
  }
);

MultiSendPanel.displayName = 'MultiSendPanel';
