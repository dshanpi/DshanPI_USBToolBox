import React, { useState, useCallback, useRef, useEffect } from 'react';
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
}

const DEFAULT_ITEMS: SendItem[] = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  text: '',
}));

let nextId = 10;

export const MultiSendPanel: React.FC<MultiSendPanelProps> = ({ onSend, connected }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<SendItem[]>(() => {
    try {
      const saved = localStorage.getItem('serial-multi-send-items');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return DEFAULT_ITEMS;
  });
  const [cycleEnabled, setCycleEnabled] = useState(false);
  const [cycleDelay, setCycleDelay] = useState(500);
  const [currentCycleIdx, setCurrentCycleIdx] = useState(-1);
  const [appendNewline, setAppendNewline] = useState(true);
  const [hexMode, setHexMode] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleIdxRef = useRef(0);

  // Persist items to localStorage
  useEffect(() => {
    localStorage.setItem('serial-multi-send-items', JSON.stringify(items));
  }, [items]);

  // Clean up cycle timer
  useEffect(() => {
    return () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
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

  const sendItem = useCallback(
    (item: SendItem) => {
      if (!item.text.trim()) return;
      onSend(buildData(item.text));
    },
    [onSend, buildData]
  );

  const sendAll = useCallback(() => {
    const filled = items.filter((item) => item.text.trim());
    filled.forEach((item, i) => {
      setTimeout(() => {
        onSend(buildData(item.text));
      }, i * cycleDelay);
    });
  }, [items, onSend, buildData, cycleDelay]);

  const toggleCycle = useCallback(() => {
    if (cycleTimerRef.current) {
      clearInterval(cycleTimerRef.current);
      cycleTimerRef.current = null;
      setCycleEnabled(false);
      setCurrentCycleIdx(-1);
      return;
    }
    const filled = items.filter((item) => item.text.trim());
    if (filled.length === 0) return;
    setCycleEnabled(true);
    cycleIdxRef.current = 0;
    setCurrentCycleIdx(0);
    // Send first immediately
    onSend(buildData(filled[0].text));
    cycleTimerRef.current = setInterval(() => {
      cycleIdxRef.current = (cycleIdxRef.current + 1) % filled.length;
      setCurrentCycleIdx(cycleIdxRef.current);
      onSend(buildData(filled[cycleIdxRef.current].text));
    }, Math.max(50, cycleDelay));
  }, [items, onSend, buildData, cycleDelay]);

  // Keep cycle in sync when items/delay change
  useEffect(() => {
    if (cycleEnabled && cycleTimerRef.current) {
      clearInterval(cycleTimerRef.current);
      const filled = items.filter((item) => item.text.trim());
      if (filled.length === 0) {
        setCycleEnabled(false);
        setCurrentCycleIdx(-1);
        return;
      }
      cycleIdxRef.current = 0;
      setCurrentCycleIdx(0);
      onSend(buildData(filled[0].text));
      cycleTimerRef.current = setInterval(() => {
        cycleIdxRef.current = (cycleIdxRef.current + 1) % filled.length;
        setCurrentCycleIdx(cycleIdxRef.current);
        onSend(buildData(filled[cycleIdxRef.current].text));
      }, Math.max(50, cycleDelay));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleDelay]);

  const handleSave = useCallback(async () => {
    try {
      const path = await save({
        defaultPath: 'serial-send-items.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (path) {
        const data = JSON.stringify({ items, appendNewline, cycleDelay }, null, 2);
        await writeTextFile(path, data);
      }
    } catch (e) {
      console.error('Save failed:', e);
    }
  }, [items, appendNewline, cycleDelay]);

  const handleLoad = useCallback(async () => {
    try {
      const path = await open({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      });
      if (path) {
        const data = await readTextFile(path);
        const parsed = JSON.parse(data);
        if (parsed.items && Array.isArray(parsed.items)) {
          setItems(parsed.items);
        }
        if (typeof parsed.appendNewline === 'boolean') setAppendNewline(parsed.appendNewline);
        if (typeof parsed.cycleDelay === 'number') setCycleDelay(parsed.cycleDelay);
      }
    } catch (e) {
      console.error('Load failed:', e);
    }
  }, []);

  const handleReset = useCallback(() => {
    setItems(DEFAULT_ITEMS);
    setAppendNewline(true);
    setCycleDelay(500);
    if (cycleTimerRef.current) {
      clearInterval(cycleTimerRef.current);
      cycleTimerRef.current = null;
      setCycleEnabled(false);
      setCurrentCycleIdx(-1);
    }
  }, []);

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
          <span className="multi-send-count">{filledCount}/{items.length}</span>
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
};
