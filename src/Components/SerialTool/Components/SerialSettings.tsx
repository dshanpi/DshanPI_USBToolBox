import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SerialPortConfig, DisplayOptions } from '../SerialTool';
import type { ChecksumConfig, ChecksumType, ChecksumMode, ChecksumEndian } from '../checksum';

const BAUD_RATES = [
  300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400, 460800, 921600, 1000000,
  1500000, 2000000, 3000000,
];
const DATA_BITS = [5, 6, 7, 8];
const STOP_BITS = [1, 2];
const PARITY_OPTIONS = ['none', 'odd', 'even'];
const FLOW_OPTIONS = ['none', 'rts_cts', 'xon_xoff'];

interface SerialSettingsProps {
  config: SerialPortConfig;
  ports: Array<{ name: string; description: string }>;
  connected: boolean;
  connecting: boolean;
  displayOptions: DisplayOptions;
  onConfigChange: (config: SerialPortConfig) => void;
  onOpen: () => void;
  onClose: () => void;
  onRefresh: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onToggleTimestamp: () => void;
  onToggleHex: () => void;
  onToggleAnsi: () => void;
  checksumConfig: ChecksumConfig;
  onChecksumChange: (c: ChecksumConfig) => void;
  onChecksumPreview: string;
  sendText: string;
  sendHexMode: boolean;
  sendAppendNewline: boolean;
}

export const SerialSettings: React.FC<SerialSettingsProps> = ({
  config,
  ports,
  connected,
  connecting,
  displayOptions,
  onConfigChange,
  onOpen,
  onClose,
  onRefresh,
  autoRefresh,
  onToggleAutoRefresh,
  onToggleTimestamp,
  onToggleHex,
  onToggleAnsi,
  checksumConfig,
  onChecksumChange,
  onChecksumPreview,
  sendText,
  sendHexMode,
  sendAppendNewline,
}) => {
  const { t } = useTranslation();

  const updateChecksum = useCallback(
    <K extends keyof ChecksumConfig>(key: K, value: ChecksumConfig[K]) => {
      onChecksumChange({ ...checksumConfig, [key]: value });
    },
    [checksumConfig, onChecksumChange]
  );

  const updateField = useCallback(
    <K extends keyof SerialPortConfig>(key: K, value: SerialPortConfig[K]) => {
      onConfigChange({ ...config, [key]: value });
    },
    [config, onConfigChange]
  );

  const parityLabel = (v: string) => {
    if (v === 'odd') return t('serialTool.settings.parityOdd');
    if (v === 'even') return t('serialTool.settings.parityEven');
    return t('serialTool.settings.parityNone');
  };

  const flowLabel = (v: string) => {
    if (v === 'rts_cts') return t('serialTool.settings.flowRtsCts');
    if (v === 'xon_xoff') return t('serialTool.settings.flowXonXoff');
    return t('serialTool.settings.flowNone');
  };

  return (
    <div className="serial-settings">
      <div className="serial-config-row">
        <div className="config-group">
          <label className="config-label">{t('serialTool.settings.port')}</label>
          <div className="config-port-row">
            <select
              className="config-select"
              value={config.port}
              onChange={(e) => updateField('port', e.target.value)}
              disabled={connected}
            >
              <option value="">{t('serialTool.settings.selectPort')}</option>
              {config.port && !ports.some((port) => port.name === config.port) && (
                <option value={config.port}>
                  {t('serialTool.settings.unavailablePort', { port: config.port })}
                </option>
              )}
              {ports.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                  {p.description && p.description !== p.name ? ` (${p.description})` : ''}
                </option>
              ))}
            </select>
            <button
              className="config-btn-icon"
              onClick={onRefresh}
              disabled={connected}
              title={t('serialTool.settings.refresh')}
            >
              ↻
            </button>
            <button
              className={`config-btn-icon ${autoRefresh ? 'active' : ''}`}
              onClick={onToggleAutoRefresh}
              disabled={connected}
              title={t('serialTool.settings.auto')}
            >
              A
            </button>
          </div>
        </div>

        <div className="config-group">
          <label className="config-label">{t('serialTool.settings.baudRate')}</label>
          <select
            className="config-select"
            value={config.baudRate}
            onChange={(e) => updateField('baudRate', Number(e.target.value))}
            disabled={connected}
          >
            {BAUD_RATES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div className="config-group">
          <label className="config-label">{t('serialTool.settings.dataBits')}</label>
          <select
            className="config-select"
            value={config.dataBits}
            onChange={(e) => updateField('dataBits', Number(e.target.value))}
            disabled={connected}
          >
            {DATA_BITS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="config-group">
          <label className="config-label">{t('serialTool.settings.stopBits')}</label>
          <select
            className="config-select"
            value={config.stopBits}
            onChange={(e) => updateField('stopBits', Number(e.target.value))}
            disabled={connected}
          >
            {STOP_BITS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="config-group">
          <label className="config-label">{t('serialTool.settings.parity')}</label>
          <select
            className="config-select"
            value={config.parity}
            onChange={(e) => updateField('parity', e.target.value)}
            disabled={connected}
          >
            {PARITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {parityLabel(p)}
              </option>
            ))}
          </select>
        </div>

        <div className="config-group">
          <label className="config-label">{t('serialTool.settings.flowControl')}</label>
          <select
            className="config-select"
            value={config.flowControl}
            onChange={(e) => updateField('flowControl', e.target.value)}
            disabled={connected}
          >
            {FLOW_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {flowLabel(f)}
              </option>
            ))}
          </select>
        </div>

        <div className="config-group config-connect">
          <label className="config-label">&nbsp;</label>
          {!connected ? (
            <button
              className="config-btn-open"
              onClick={onOpen}
              disabled={!config.port || connecting}
            >
              {connecting ? t('serialTool.settings.opening') : t('serialTool.settings.open')}
            </button>
          ) : (
            <button className="config-btn-close" onClick={onClose}>
              {t('serialTool.settings.close')}
            </button>
          )}
        </div>
      </div>

      <div className="serial-display-options">
        <div className="serial-option-toolbar">
          <div className="serial-option-buttons">
            <button
              className={`serial-toggle-btn ${displayOptions.showTimestamp ? 'active' : ''}`}
              onClick={onToggleTimestamp}
            >
              {t('serialTool.settings.timestamp')}
            </button>
            <button
              className={`serial-toggle-btn ${displayOptions.hexDisplay ? 'active' : ''}`}
              onClick={onToggleHex}
            >
              {t('serialTool.settings.hexDisplay')}
            </button>
            <button
              className={`serial-toggle-btn ${displayOptions.ansiDisplay ? 'active' : ''}`}
              onClick={onToggleAnsi}
              disabled={displayOptions.hexDisplay}
              title={t('serialTool.settings.ansiDisplayHint')}
            >
              {t('serialTool.settings.ansiDisplay')}
            </button>
            <button
              className={`serial-toggle-btn ${checksumConfig.enabled ? 'active' : ''}`}
              onClick={() => updateChecksum('enabled', !checksumConfig.enabled)}
            >
              {t('serialTool.checksum.title')}
            </button>
          </div>
          {checksumConfig.enabled && (
            <span
              className="checksum-inline-preview"
              title={t('serialTool.checksum.previewTooltip')}
              onWheel={(e) => {
                const el = e.currentTarget;
                el.scrollLeft += e.deltaY;
              }}
            >
              {(() => {
                if (!sendText) return <span className="checksum-data-bytes">(空)</span>;
                let text = sendText;
                if (!sendHexMode && sendAppendNewline) text += '\n';
                const rawBytes: number[] = sendHexMode
                  ? (text
                      .replace(/\s/g, '')
                      .match(/.{1,2}/g)
                      ?.map((s) => parseInt(s, 16))
                      .filter((b) => !isNaN(b)) ?? [])
                  : Array.from(new TextEncoder().encode(text));
                if (rawBytes.length === 0) return <span className="checksum-data-bytes">(空)</span>;
                const offset = checksumConfig.startOffset;
                const hex = (bs: number[]) =>
                  bs.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

                if (offset > 0 && offset < rawBytes.length) {
                  return (
                    <>
                      <span className="checksum-data-bytes checksum-data-pre">
                        {hex(rawBytes.slice(0, offset))}
                      </span>
                      <span className="checksum-data-bytes checksum-data-range">
                        {hex(rawBytes.slice(offset))}
                      </span>
                    </>
                  );
                }
                return (
                  <span className="checksum-data-bytes checksum-data-range">{hex(rawBytes)}</span>
                );
              })()}
              {onChecksumPreview && (
                <span className="checksum-data-bytes checksum-data-cs">{onChecksumPreview}</span>
              )}
            </span>
          )}
        </div>
        {checksumConfig.enabled && (
          <div className="checksum-config">
            {checksumConfig.manualMode ? (
              <div className="checksum-options">
                <span className="checksum-field checksum-field--wide">
                  <span className="checksum-field-label">{t('serialTool.checksum.manualHex')}</span>
                  <input
                    type="text"
                    className="checksum-hex-input"
                    value={checksumConfig.manualValue}
                    onChange={(e) => updateChecksum('manualValue', e.target.value)}
                    placeholder="A1 3F"
                  />
                </span>
                <span className="checksum-field checksum-field--offset">
                  <span
                    className="checksum-field-label"
                    title={t('serialTool.checksum.offsetDesc')}
                  >
                    {t('serialTool.checksum.offsetLabel')}
                  </span>
                  <input
                    type="number"
                    className="checksum-offset"
                    value={checksumConfig.startOffset}
                    onChange={(e) =>
                      updateChecksum('startOffset', Math.max(0, Number(e.target.value)))
                    }
                    min={0}
                    max={65535}
                  />
                </span>
                <span className="checksum-field checksum-field--select">
                  <span className="checksum-field-label" title={t('serialTool.checksum.modeDesc')}>
                    {t('serialTool.checksum.modeLabel')}
                  </span>
                  <select
                    className="checksum-select"
                    value={checksumConfig.mode}
                    onChange={(e) => updateChecksum('mode', e.target.value as ChecksumMode)}
                  >
                    <option value="append">{t('serialTool.checksum.append')}</option>
                    <option value="replace">{t('serialTool.checksum.replace')}</option>
                    <option value="insert">{t('serialTool.checksum.insert')}</option>
                  </select>
                </span>
              </div>
            ) : (
              <div className="checksum-options">
                <span className="checksum-field checksum-field--type">
                  <span className="checksum-field-label" title={t('serialTool.checksum.typeDesc')}>
                    {t('serialTool.checksum.typeLabel')}
                  </span>
                  <select
                    className="checksum-select"
                    value={checksumConfig.type}
                    onChange={(e) => updateChecksum('type', e.target.value as ChecksumType)}
                  >
                    <option value="CRC32">CRC32</option>
                    <option value="CRC16_MODBUS">CRC16 (Modbus)</option>
                    <option value="CRC16_CCITT">CRC16 (CCITT)</option>
                    <option value="SUM8">Sum8</option>
                    <option value="SUM16">Sum16</option>
                    <option value="ADD8">ADD8</option>
                    <option value="ADD8_0">0-ADD8</option>
                    <option value="XOR8">XOR8</option>
                    <option value="ADDR16">ADDR16</option>
                  </select>
                </span>
                <span className="checksum-field checksum-field--offset">
                  <span
                    className="checksum-field-label"
                    title={t('serialTool.checksum.offsetDesc')}
                  >
                    {t('serialTool.checksum.offsetLabel')}
                  </span>
                  <input
                    type="number"
                    className="checksum-offset"
                    value={checksumConfig.startOffset}
                    onChange={(e) =>
                      updateChecksum('startOffset', Math.max(0, Number(e.target.value)))
                    }
                    min={0}
                    max={65535}
                  />
                </span>
                <span className="checksum-field checksum-field--select">
                  <span className="checksum-field-label" title={t('serialTool.checksum.modeDesc')}>
                    {t('serialTool.checksum.modeLabel')}
                  </span>
                  <select
                    className="checksum-select"
                    value={checksumConfig.mode}
                    onChange={(e) => updateChecksum('mode', e.target.value as ChecksumMode)}
                  >
                    <option value="append">{t('serialTool.checksum.append')}</option>
                    <option value="replace">{t('serialTool.checksum.replace')}</option>
                    <option value="insert">{t('serialTool.checksum.insert')}</option>
                  </select>
                </span>
                <span className="checksum-field checksum-field--select">
                  <span
                    className="checksum-field-label"
                    title={t('serialTool.checksum.endianDesc')}
                  >
                    {t('serialTool.checksum.endianLabel')}
                  </span>
                  <select
                    className="checksum-select"
                    value={checksumConfig.endian}
                    onChange={(e) => updateChecksum('endian', e.target.value as ChecksumEndian)}
                  >
                    <option value="big">{t('serialTool.checksum.bigEndian')}</option>
                    <option value="little">{t('serialTool.checksum.littleEndian')}</option>
                  </select>
                </span>
              </div>
            )}

            <div className="checksum-bottom-row">
              <label className="checksum-preview-only">
                <input
                  type="checkbox"
                  checked={checksumConfig.previewOnly}
                  onChange={(e) => updateChecksum('previewOnly', e.target.checked)}
                />
                {t('serialTool.checksum.previewOnly')}
                <span className="checksum-note">({t('serialTool.checksum.previewNote')})</span>
              </label>

              <label className="checksum-manual-toggle">
                <input
                  type="checkbox"
                  checked={checksumConfig.manualMode}
                  onChange={(e) => updateChecksum('manualMode', e.target.checked)}
                />
                {t('serialTool.checksum.manualMode')}
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
