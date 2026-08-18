import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookmark,
  faCodeCompare,
  faCopy,
  faDisplay,
  faDownload,
  faMicrochip,
  faPaperPlane,
  faPencil,
  faRotateRight,
  faStop,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { ResolutionPreset } from '../SPIDisplayTool';
import type {
  ContentRegion,
  DisplayHistoryEntry,
  DisplayPreview,
  DisplayTemplate,
  DisplayTransferState,
  ScreenDisplayType,
} from './tabs/common';

export interface LogEntry {
  time: string;
  message: string;
  level: 'info' | 'success' | 'error' | 'muted';
}

interface RightPanelProps {
  online: boolean;
  width: number;
  height: number;
  displayType: ScreenDisplayType;
  draftPreview: DisplayPreview | null;
  sentPreview: DisplayPreview | null;
  compareEntry: DisplayHistoryEntry | null;
  transferState: DisplayTransferState;
  onCancelTransfer: () => void;
  onRetryLastSend: () => void;
  refreshMode: 'full' | 'partial';
  refreshRegionMode: 'auto' | 'manual';
  manualRefreshRegion: ContentRegion;
  onManualRefreshRegionChange: (region: ContentRegion) => void;
  onEnableManualRegion: () => void;
  history: DisplayHistoryEntry[];
  templates: DisplayTemplate[];
  onResendHistory: (id: number) => void;
  onExportHistory: (id: number) => void;
  onSaveHistoryAsTemplate: (id: number) => void;
  onCompareHistory: (id: number | null) => void;
  onEditHistory: (id: number) => void;
  onUseTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
  resolutionPreset: string;
  resolutionPresets: ResolutionPreset[];
  onResolutionPresetChange: (key: string) => void;
  onWidthChange: (w: number) => void;
  onHeightChange: (h: number) => void;
  logs: LogEntry[];
  onClearLogs: () => void;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '--';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  online,
  width,
  height,
  displayType,
  draftPreview,
  sentPreview,
  compareEntry,
  transferState,
  onCancelTransfer,
  onRetryLastSend,
  refreshMode,
  refreshRegionMode,
  manualRefreshRegion,
  onManualRefreshRegionChange,
  onEnableManualRegion,
  history,
  templates,
  onResendHistory,
  onExportHistory,
  onSaveHistoryAsTemplate,
  onCompareHistory,
  onEditHistory,
  onUseTemplate,
  onDeleteTemplate,
  resolutionPreset,
  resolutionPresets,
  onResolutionPresetChange,
  onWidthChange,
  onHeightChange,
  logs,
  onClearLogs,
}) => {
  const { t } = useTranslation();
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [previewMode, setPreviewMode] = useState<'draft' | 'sent'>('draft');
  const [wText, setWText] = useState(String(width));
  const [hText, setHText] = useState(String(height));
  const [copyStatus, setCopyStatus] = useState<'copy' | 'copied' | 'failed'>('copy');
  const [showHistory, setShowHistory] = useState(false);
  const selectedPreview = previewMode === 'draft' ? draftPreview : sentPreview;
  const displayedRegion =
    previewMode === 'draft' && refreshMode === 'partial'
      ? refreshRegionMode === 'manual'
        ? manualRefreshRegion
        : (selectedPreview?.region ?? null)
      : null;
  const comparisonTarget = compareEntry
    ? (history.find((entry) => entry.id !== compareEntry.id) ?? null)
    : null;

  useEffect(() => setWText(String(width)), [width]);
  useEffect(() => setHText(String(height)), [height]);
  useEffect(() => {
    // WebView2 的新版 scrollIntoView 可能返回 Promise。Effect 不能把该 Promise
    // 返回给 React，否则 React 会将它当作清理函数并在严格模式下触发白屏。
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const out = previewRef.current;
    if (!out) return;
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    if (selectedPreview) ctx.drawImage(selectedPreview.canvas, 0, 0, width, height);
    if (compareEntry && selectedPreview) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width / 2, height);
      ctx.clip();
      ctx.drawImage(compareEntry.canvas, 0, 0, width, height);
      ctx.restore();
      ctx.strokeStyle = '#f9e2af';
      ctx.lineWidth = Math.max(1, width / 160);
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();
    }
    if (displayedRegion) {
      ctx.save();
      ctx.strokeStyle = '#f38ba8';
      ctx.lineWidth = Math.max(1, width / 120);
      ctx.setLineDash([Math.max(2, width / 50), Math.max(2, width / 80)]);
      ctx.strokeRect(
        displayedRegion.x + 0.5,
        displayedRegion.y + 0.5,
        displayedRegion.w - 1,
        displayedRegion.h - 1
      );
      ctx.fillStyle = 'rgba(243, 139, 168, .13)';
      ctx.fillRect(displayedRegion.x, displayedRegion.y, displayedRegion.w, displayedRegion.h);
      ctx.restore();
    }
  }, [compareEntry, displayedRegion, height, selectedPreview, width]);

  const progress =
    transferState.totalBytes > 0
      ? Math.min(100, (transferState.sentBytes / transferState.totalBytes) * 100)
      : 0;
  const transferLabel = useMemo(() => {
    if (transferState.status === 'sending') return t('spiDisplay.right.sending');
    if (transferState.status === 'success') return t('spiDisplay.right.sendComplete');
    if (transferState.status === 'cancelled') return t('spiDisplay.right.stopped');
    if (transferState.status === 'error') return t('spiDisplay.right.sendFailed');
    return t('spiDisplay.right.waiting');
  }, [t, transferState.status]);

  const commitWidth = () => {
    const value = Number.parseInt(wText, 10);
    if (value >= 8 && value <= 1024) onWidthChange(value);
    else setWText(String(width));
  };
  const commitHeight = () => {
    const value = Number.parseInt(hText, 10);
    if (value >= 8 && value <= 1024) onHeightChange(value);
    else setHText(String(height));
  };

  const getPreviewPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(width - 1, Math.floor(((event.clientX - rect.left) / rect.width) * width))
      ),
      y: Math.max(
        0,
        Math.min(height - 1, Math.floor(((event.clientY - rect.top) / rect.height) * height))
      ),
    };
  };
  const updateDragRegion = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const end = getPreviewPoint(event);
    onManualRefreshRegionChange({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x) + 1,
      h: Math.abs(end.y - start.y) + 1,
    });
  };

  const copyAllLogs = async () => {
    if (!logs.length) return;
    const value = logs.map((item) => `[${item.time}] ${item.message}`).join('\n');
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('copied');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      setCopyStatus(copied ? 'copied' : 'failed');
    }
    window.setTimeout(() => setCopyStatus('copy'), 1500);
  };

  return (
    <div className="sdt-panel sdt-right-panel">
      <div className="sdt-section-title">
        <FontAwesomeIcon icon={faDisplay} />
        <span>{t('spiDisplay.right.preview')}</span>
        <div className="sdt-preview-switch">
          <button
            className={previewMode === 'draft' ? 'active' : ''}
            onClick={() => setPreviewMode('draft')}
          >
            {t('spiDisplay.right.draft')}
          </button>
          <button
            className={previewMode === 'sent' ? 'active' : ''}
            onClick={() => setPreviewMode('sent')}
          >
            {t('spiDisplay.right.sent')}
          </button>
        </div>
      </div>

      <div className="sdt-lcd-preview">
        <div className={`sdt-lcd-screen ${displayType === 'rgb565' ? 'selectable' : ''}`}>
          {selectedPreview ? (
            <canvas
              ref={previewRef}
              onPointerDown={(event) => {
                if (displayType !== 'rgb565' || previewMode !== 'draft') return;
                event.currentTarget.setPointerCapture(event.pointerId);
                onEnableManualRegion();
                const point = getPreviewPoint(event);
                dragStartRef.current = point;
                onManualRefreshRegionChange({ ...point, w: 1, h: 1 });
              }}
              onPointerMove={updateDragRegion}
              onPointerUp={(event) => {
                updateDragRegion(event);
                dragStartRef.current = null;
              }}
              title={displayType === 'rgb565' ? t('spiDisplay.right.dragRegion') : undefined}
            />
          ) : (
            <div className="sdt-lcd-placeholder">
              <FontAwesomeIcon icon={faMicrochip} className="icon" />
              <div>
                {previewMode === 'draft'
                  ? t('spiDisplay.right.previewHint')
                  : t('spiDisplay.right.noSentContent')}
              </div>
            </div>
          )}
          {compareEntry && (
            <span className="sdt-compare-badge">{t('spiDisplay.right.historyCurrent')}</span>
          )}
        </div>
        <div className="sdt-lcd-status">
          <span>
            <span className={`sdt-status-dot ${online ? 'connected' : ''}`} />
            {online ? t('spiDisplay.common.connected') : t('spiDisplay.common.disconnected')}
          </span>
          <span>
            {width} × {height}
          </span>
          {displayedRegion && (
            <span>
              {t('spiDisplay.right.region')} {displayedRegion.x},{displayedRegion.y}{' '}
              {displayedRegion.w}×{displayedRegion.h}
            </span>
          )}
        </div>
        {refreshMode === 'partial' &&
          refreshRegionMode === 'manual' &&
          displayType === 'rgb565' &&
          previewMode === 'draft' && (
            <div className="sdt-preview-region-note mono">
              {t('spiDisplay.right.manualRegion')} X{manualRefreshRegion.x} Y{manualRefreshRegion.y}{' '}
              {manualRefreshRegion.w}×{manualRefreshRegion.h}
            </div>
          )}

        <div className="sdt-transfer-card">
          <div className="sdt-transfer-head">
            <span className={`state ${transferState.status}`}>{transferLabel}</span>
            <span className="mono">{progress.toFixed(0)}%</span>
          </div>
          <div className="sdt-progress-bar">
            <div className="sdt-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="sdt-transfer-stats">
            <span>
              {formatBytes(transferState.sentBytes)} / {formatBytes(transferState.totalBytes)}
            </span>
            <span>
              {t('spiDisplay.right.remaining', {
                time: formatDuration(transferState.estimatedRemainingMs),
              })}
            </span>
            <span>{formatBytes(transferState.throughputBytesPerSecond)}/s</span>
            <span>
              {formatDuration(transferState.frameTimeMs)} · {transferState.actualFps.toFixed(1)} fps
            </span>
          </div>
          {transferState.error && <div className="sdt-transfer-error">{transferState.error}</div>}
          <div className="sdt-transfer-actions">
            {transferState.status === 'sending' ? (
              <button className="sdt-btn danger small" onClick={onCancelTransfer}>
                <FontAwesomeIcon icon={faStop} /> {t('spiDisplay.right.stopSending')}
              </button>
            ) : (
              <button
                className="sdt-btn small"
                onClick={onRetryLastSend}
                disabled={transferState.status === 'idle'}
              >
                <FontAwesomeIcon icon={faRotateRight} /> {t('spiDisplay.right.resend')}
              </button>
            )}
          </div>
        </div>

        <div className="sdt-resolution-control">
          <label>{t('spiDisplay.right.resolution')}</label>
          <select
            className="sdt-select"
            value={resolutionPreset}
            onChange={(event) => onResolutionPresetChange(event.target.value)}
          >
            {resolutionPresets.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          {resolutionPreset === 'custom' && (
            <div className="sdt-resolution-row">
              <input
                className="sdt-input mono"
                type="number"
                value={wText}
                onChange={(event) => setWText(event.target.value)}
                onBlur={commitWidth}
              />
              <span>×</span>
              <input
                className="sdt-input mono"
                type="number"
                value={hText}
                onChange={(event) => setHText(event.target.value)}
                onBlur={commitHeight}
              />
            </div>
          )}
        </div>
      </div>

      <div className="sdt-content-library">
        <button className="sdt-library-toggle" onClick={() => setShowHistory((value) => !value)}>
          <span>{t('spiDisplay.right.historyTemplates')}</span>
          <span>
            {history.length} / {templates.length}
          </span>
        </button>
        {showHistory && (
          <div className="sdt-library-body">
            {templates.length > 0 && (
              <div className="sdt-library-label">{t('spiDisplay.right.templates')}</div>
            )}
            {templates.map((template) => (
              <div className="sdt-history-item" key={template.id}>
                <img src={template.imageDataUrl} alt="" />
                <div>
                  <strong>{template.name}</strong>
                  <small>
                    {template.width}×{template.height}
                  </small>
                </div>
                <button
                  title={t('spiDisplay.right.useTemplate')}
                  onClick={() => onUseTemplate(template.id)}
                >
                  <FontAwesomeIcon icon={faPaperPlane} />
                </button>
                <button
                  title={t('spiDisplay.right.deleteTemplate')}
                  onClick={() => onDeleteTemplate(template.id)}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            ))}
            <div className="sdt-library-label">{t('spiDisplay.right.recent')}</div>
            {history.length === 0 && (
              <div className="sdt-library-empty">{t('spiDisplay.right.noHistory')}</div>
            )}
            {history.map((entry) => (
              <div className="sdt-history-item" key={entry.id}>
                <canvas
                  ref={(node) => {
                    if (!node) return;
                    node.width = entry.width;
                    node.height = entry.height;
                    node.getContext('2d')?.drawImage(entry.canvas, 0, 0);
                  }}
                />
                <div title={entry.description}>
                  <strong>{entry.description}</strong>
                  <small>
                    {entry.timestamp} · {formatBytes(entry.bytes.length)}
                  </small>
                </div>
                <button
                  title={t('spiDisplay.right.resend')}
                  onClick={() => onResendHistory(entry.id)}
                >
                  <FontAwesomeIcon icon={faPaperPlane} />
                </button>
                <button
                  title={t('spiDisplay.right.loadEditor')}
                  onClick={() => onEditHistory(entry.id)}
                >
                  <FontAwesomeIcon icon={faPencil} />
                </button>
                <button
                  title={t('spiDisplay.right.comparePreview')}
                  onClick={() => onCompareHistory(entry.id)}
                >
                  <FontAwesomeIcon icon={faCodeCompare} />
                </button>
                <button
                  title={t('spiDisplay.right.saveTemplate')}
                  onClick={() => onSaveHistoryAsTemplate(entry.id)}
                >
                  <FontAwesomeIcon icon={faBookmark} />
                </button>
                <button
                  title={t('spiDisplay.right.exportRgb')}
                  onClick={() => onExportHistory(entry.id)}
                >
                  <FontAwesomeIcon icon={faDownload} />
                </button>
              </div>
            ))}
            {compareEntry && (
              <div className="sdt-parameter-compare">
                <div className="sdt-library-label">{t('spiDisplay.right.parameterCompare')}</div>
                {Array.from(
                  new Set([
                    ...Object.keys(compareEntry.metadata ?? {}),
                    ...Object.keys(comparisonTarget?.metadata ?? {}),
                  ])
                ).map((key) => (
                  <div key={key}>
                    <span>{key}</span>
                    <code>{String(compareEntry.metadata?.[key] ?? '--')}</code>
                    <code>{String(comparisonTarget?.metadata?.[key] ?? '--')}</code>
                  </div>
                ))}
                {!Object.keys(compareEntry.metadata ?? {}).length &&
                  !Object.keys(comparisonTarget?.metadata ?? {}).length && (
                    <div className="sdt-library-empty">
                      {t('spiDisplay.right.noComparableParams')}
                    </div>
                  )}
                <button className="sdt-btn small" onClick={() => onCompareHistory(null)}>
                  <FontAwesomeIcon icon={faXmark} /> {t('spiDisplay.right.exitCompare')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sdt-log-console">
        <div className="sdt-log-header">
          <span>{t('spiDisplay.right.outputLog', { count: logs.length })}</span>
          <div className="sdt-log-header-actions">
            <button
              className="sdt-btn small"
              onClick={() => void copyAllLogs()}
              disabled={!logs.length}
            >
              <FontAwesomeIcon icon={faCopy} /> {t(`spiDisplay.right.${copyStatus}`)}
            </button>
            <button className="sdt-btn small" onClick={onClearLogs}>
              <FontAwesomeIcon icon={faTrash} /> {t('spiDisplay.common.clear')}
            </button>
          </div>
        </div>
        <div className="sdt-log-list">
          {!logs.length && <div className="sdt-library-empty">{t('spiDisplay.right.noLogs')}</div>}
          {logs.map((item, index) => (
            <div key={`${item.time}-${index}`} className="log-line">
              <span className="log-time">[{item.time}]</span>
              <span className={`log-msg ${item.level}`}>{item.message}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
};
