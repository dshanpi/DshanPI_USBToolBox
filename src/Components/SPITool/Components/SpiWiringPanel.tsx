import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSpiAuxPinConflicts, useSpiAuxPins } from '../spiAuxPins';
import './SpiWiringPanel.css';

const GPIO_PINS = Array.from({ length: 8 }, (_, pin) => pin);

export interface SpiWiringPanelProps {
  compact?: boolean;
}

export const SpiWiringPanel: React.FC<SpiWiringPanelProps> = ({ compact = false }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { signals, updateSignal, addSignal, removeSignal, resetSignals } = useSpiAuxPins();
  const conflicts = useMemo(() => getSpiAuxPinConflicts(signals), [signals]);
  const enabledSignals = signals.filter((signal) => signal.enabled);

  return (
    <section
      className={`spi-wiring-panel ${compact ? 'compact' : ''} ${expanded ? 'expanded' : ''}`}
    >
      <button
        type="button"
        className="spi-wiring-summary"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="spi-wiring-title">
          <span className="spi-wiring-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
          {t('spiWiring.title')}
        </span>
        <span className="spi-wiring-chips">
          <span className="spi-wiring-chip bus">{t('spiWiring.mapSck')}</span>
          <span className="spi-wiring-chip bus">{t('spiWiring.mapMosi')}</span>
          <span className="spi-wiring-chip bus">{t('spiWiring.mapMiso')}</span>
          <span className="spi-wiring-chip bus">{t('spiWiring.mapCs')}</span>
          {enabledSignals.map((signal) => (
            <span
              key={signal.id}
              className={`spi-wiring-chip aux ${conflicts.has(signal.pin) ? 'conflict' : ''}`}
            >
              {t('spiWiring.mapAux', { name: signal.name, pin: signal.pin })}
            </span>
          ))}
          <span className="spi-wiring-chip voltage">{t('spiWiring.voltage')}</span>
        </span>
        {conflicts.size > 0 && (
          <span className="spi-wiring-summary-warning">{t('spiWiring.conflictShort')}</span>
        )}
      </button>

      {expanded && (
        <div className="spi-wiring-details">
          <div className="spi-wiring-bus">
            <div className="spi-wiring-subtitle">{t('spiWiring.busSignals')}</div>
            <div className="spi-wiring-bus-grid">
              <span>
                <strong>{t('spiWiring.sck')}</strong>
                <small>{t('spiWiring.sck')}</small>
              </span>
              <span>
                <strong>{t('spiWiring.mosi')}</strong>
                <small>{t('spiWiring.mosi')}</small>
              </span>
              <span>
                <strong>{t('spiWiring.miso')}</strong>
                <small>{t('spiWiring.miso')}</small>
              </span>
              <span>
                <strong>{t('spiWiring.cs')}</strong>
                <small>{t('spiWiring.cs0')}</small>
              </span>
            </div>
          </div>

          <div className="spi-wiring-aux">
            <div className="spi-wiring-subtitle-row">
              <div>
                <div className="spi-wiring-subtitle">{t('spiWiring.auxSignals')}</div>
                <p>{t('spiWiring.auxHint')}</p>
              </div>
              <div className="spi-wiring-actions">
                <button type="button" onClick={addSignal} disabled={signals.length >= 8}>
                  {t('spiWiring.addSignal')}
                </button>
                <button type="button" onClick={resetSignals}>
                  {t('spiWiring.reset')}
                </button>
              </div>
            </div>

            <div className="spi-wiring-table" role="table" aria-label={t('spiWiring.auxSignals')}>
              <div className="spi-wiring-table-head" role="row">
                <span>{t('spiWiring.enabled')}</span>
                <span>{t('spiWiring.signalName')}</span>
                <span>{t('spiWiring.pin')}</span>
                <span>{t('spiWiring.direction')}</span>
                <span />
              </div>
              {signals.map((signal) => {
                const conflict = signal.enabled && conflicts.has(signal.pin);
                return (
                  <div
                    className={`spi-wiring-table-row ${!signal.enabled ? 'disabled' : ''} ${conflict ? 'conflict' : ''}`}
                    role="row"
                    key={signal.id}
                  >
                    <label className="spi-wiring-enable">
                      <input
                        type="checkbox"
                        checked={signal.enabled}
                        onChange={(event) =>
                          updateSignal(signal.id, { enabled: event.target.checked })
                        }
                        aria-label={`${signal.name} ${t('spiWiring.enabled')}`}
                      />
                    </label>
                    {signal.builtIn ? (
                      <strong className="spi-wiring-fixed-name">{signal.name}</strong>
                    ) : (
                      <input
                        className="spi-wiring-name-input"
                        value={signal.name}
                        onChange={(event) => updateSignal(signal.id, { name: event.target.value })}
                        onBlur={() => {
                          if (!signal.name.trim()) updateSignal(signal.id, { name: 'AUX' });
                        }}
                        aria-label={t('spiWiring.signalName')}
                      />
                    )}
                    <select
                      value={signal.pin}
                      onChange={(event) =>
                        updateSignal(signal.id, { pin: Number(event.target.value) })
                      }
                      aria-label={`${signal.name} ${t('spiWiring.pin')}`}
                    >
                      {GPIO_PINS.map((pin) => (
                        <option key={pin} value={pin}>
                          {t('spiWiring.gpioPin', { pin })}
                        </option>
                      ))}
                    </select>
                    <span className="spi-wiring-output-badge">{t('spiWiring.output')}</span>
                    {signal.builtIn ? (
                      <span className="spi-wiring-required">{t('spiWiring.builtIn')}</span>
                    ) : (
                      <button
                        type="button"
                        className="spi-wiring-remove"
                        onClick={() => removeSignal(signal.id)}
                        title={t('spiWiring.remove')}
                      >
                        ×
                      </button>
                    )}
                    {conflict && (
                      <span className="spi-wiring-row-warning">
                        {t('spiWiring.pinConflict', { pin: signal.pin })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {conflicts.size > 0 && (
            <div className="spi-wiring-conflict-message" role="alert">
              {t('spiWiring.conflictHint')}
            </div>
          )}
          <div className="spi-wiring-voltage-note">{t('spiWiring.voltageHint')}</div>
        </div>
      )}
    </section>
  );
};
