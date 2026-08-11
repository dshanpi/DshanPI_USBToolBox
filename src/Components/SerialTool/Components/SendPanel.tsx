import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface SendPanelProps {
  onSend: (data: number[]) => void;
  connected: boolean;
  sendText: string;
  sendHexMode: boolean;
  sendAppendNewline: boolean;
  onSendTextChange: (v: string) => void;
  onSendHexModeChange: (v: boolean) => void;
  onSendAppendNewlineChange: (v: boolean) => void;
}

interface PresetItem {
  label: string;
  text: string;
}

const DEFAULT_PRESETS: PresetItem[] = [
  { label: 'Hello', text: 'Hello World!' },
  { label: 'OK', text: 'OK' },
  { label: 'AT', text: 'AT' },
  { label: 'AT+GMR', text: 'AT+GMR' },
];

function loadPresets(): PresetItem[] {
  try {
    const saved = localStorage.getItem('serial-send-presets');
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return DEFAULT_PRESETS;
}

function savePresets(presets: PresetItem[]) {
  localStorage.setItem('serial-send-presets', JSON.stringify(presets));
}

export const SendPanel: React.FC<SendPanelProps> = ({
  onSend,
  connected,
  sendText: customText,
  sendHexMode: hexMode,
  sendAppendNewline: appendNewline,
  onSendTextChange: setCustomText,
  onSendHexModeChange: setHexMode,
  onSendAppendNewlineChange: setAppendNewline,
}) => {
  const { t } = useTranslation();
  const [timedSendEnabled, setTimedSendEnabled] = useState(false);
  const [timedSendMs, setTimedSendMs] = useState(1000);
  const timedSendRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [presets, setPresets] = useState<PresetItem[]>(loadPresets);
  const [manageMode, setManageMode] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');

  useEffect(() => {
    return () => {
      if (timedSendRef.current) clearInterval(timedSendRef.current);
    };
  }, []);

  const buildData = useCallback((): number[] => {
    if (hexMode) {
      const hex = customText.replace(/\s/g, '');
      const bytes: number[] = [];
      for (let i = 0; i < hex.length; i += 2) {
        const byte = parseInt(hex.substring(i, i + 2), 16);
        if (!isNaN(byte)) bytes.push(byte);
      }
      return bytes;
    }
    let text = customText;
    if (appendNewline) text += '\n';
    return Array.from(new TextEncoder().encode(text));
  }, [customText, hexMode, appendNewline]);

  const doSend = useCallback(() => {
    const data = buildData();
    if (data.length > 0) onSend(data);
  }, [buildData, onSend]);

  // Always send live data at each tick (not a snapshot)
  const doTimedSend = useCallback(() => {
    const data = buildData();
    if (data.length > 0) onSend(data);
  }, [buildData, onSend]);

  const handleTimedSendToggle = useCallback(() => {
    if (timedSendRef.current) {
      clearInterval(timedSendRef.current);
      timedSendRef.current = null;
      setTimedSendEnabled(false);
      return;
    }
    // Allow starting even with empty text — user may type later
    setTimedSendEnabled(true);
    timedSendRef.current = setInterval(() => {
      doTimedSend();
    }, Math.max(100, timedSendMs));
  }, [timedSendMs, doTimedSend]);

  const handlePreset = useCallback(
    (text: string) => {
      setCustomText(text);
      const bytes = new TextEncoder().encode(appendNewline ? text + '\n' : text);
      onSend(Array.from(bytes));
    },
    [appendNewline, onSend, setCustomText]
  );

  const handleAddPreset = useCallback(() => {
    if (!newLabel.trim() || !newText.trim()) return;
    const updated = [...presets, { label: newLabel.trim(), text: newText.trim() }];
    setPresets(updated);
    savePresets(updated);
    setNewLabel('');
    setNewText('');
    setShowAddForm(false);
  }, [presets, newLabel, newText]);

  const handleDeletePreset = useCallback(
    (idx: number) => {
      const updated = presets.filter((_, i) => i !== idx);
      setPresets(updated);
      savePresets(updated);
    },
    [presets]
  );

  const handleResetPresets = useCallback(() => {
    setPresets(DEFAULT_PRESETS);
    savePresets(DEFAULT_PRESETS);
    setManageMode(false);
  }, []);

  return (
    <div className="serial-send-panel">
      <div className="send-panel-header">
        <span className="send-panel-title">{t('serialTool.sendPanel.title')}</span>
      </div>

      <div className="preset-buttons">
        {presets.map((p, idx) => (
          <div key={idx} className="preset-item-wrapper">
            <button
              className="preset-btn"
              disabled={!connected}
              onClick={() => handlePreset(p.text)}
            >
              {p.label}
            </button>
            {manageMode && (
              <button
                className="preset-delete-btn"
                onClick={() => handleDeletePreset(idx)}
                title={t('serialTool.sendPanel.delete')}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          className="preset-btn preset-add-btn"
          onClick={() => { setShowAddForm(!showAddForm); setManageMode(false); }}
          title={t('serialTool.sendPanel.addPreset')}
        >
          +
        </button>
        <button
          className="preset-manage-btn"
          onClick={() => { setManageMode(!manageMode); setShowAddForm(false); }}
          title={t('serialTool.sendPanel.manage')}
        >
          ⚙
        </button>
      </div>

      {showAddForm && (
        <div className="preset-add-form">
          <input
            className="preset-add-input"
            placeholder={t('serialTool.sendPanel.presetName')}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddPreset(); }}
          />
          <input
            className="preset-add-input"
            placeholder={t('serialTool.sendPanel.presetText')}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddPreset(); }}
          />
          <button className="preset-add-confirm" onClick={handleAddPreset}>✓</button>
          <button className="preset-add-cancel" onClick={() => setShowAddForm(false)}>✕</button>
        </div>
      )}

      {manageMode && (
        <div className="preset-manage-actions">
          <button className="preset-manage-reset" onClick={handleResetPresets}>
            {t('serialTool.sendPanel.resetPresets')}
          </button>
        </div>
      )}

      <div className="send-input-row">
        <input
          type="text"
          className="send-text-input"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              doSend();
            }
          }}
          placeholder={hexMode ? t('serialTool.sendPanel.hexPlaceholder') : t('serialTool.sendPanel.placeholder')}
          disabled={!connected}
        />
        <button
          className="send-btn"
          onClick={doSend}
          disabled={!connected || !customText}
        >
          {t('serialTool.sendPanel.send')}
        </button>
      </div>

      <div className="send-options-row">
        <label className="send-option">
          <input
            type="checkbox"
            checked={appendNewline}
            onChange={(e) => setAppendNewline(e.target.checked)}
            disabled={hexMode}
          />
          {t('serialTool.sendPanel.appendNewline')}
        </label>
        <label className="send-option">
          <input
            type="checkbox"
            checked={hexMode}
            onChange={(e) => setHexMode(e.target.checked)}
          />
          {t('serialTool.sendPanel.hex')}
        </label>

        <div className="send-timed-group">
          <span className="send-timed-label">{t('serialTool.sendPanel.timedSend')}</span>
          <input
            type="number"
            className="timed-ms-input"
            value={timedSendMs}
            onChange={(e) => setTimedSendMs(Number(e.target.value))}
            min={100}
            max={60000}
            step={100}
            disabled={timedSendEnabled}
          />
          <span className="timed-unit">{t('serialTool.sendPanel.ms')}</span>
          <button
            className={`send-repeat-btn ${timedSendEnabled ? 'active' : ''}`}
            onClick={handleTimedSendToggle}
            disabled={!connected}
          >
            {timedSendEnabled ? t('serialTool.sendPanel.stop') : t('serialTool.sendPanel.start')}
          </button>
        </div>
      </div>
    </div>
  );
};
