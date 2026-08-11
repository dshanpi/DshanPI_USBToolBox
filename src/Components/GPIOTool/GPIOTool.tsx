import React, { useCallback, useEffect, useMemo, useSyncExternalStore, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDown, faArrowUp, faRotate } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { invokeCommand, normalizeIpcError } from '../../Platform/IPC';
import { sharedDevice } from '../SPITool/sharedDevice';
import { getSpiReservedPins, useSpiAuxPins } from '../SPITool/spiAuxPins';
import { AdvancedGPIOPanel, type ApplyOutputOptions } from './AdvancedGPIOPanel';
import './GPIOTool.css';

const GPIO_PINS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const GPIO_CONTROL_MASK = 0xff;

interface GpioSnapshot {
  direction: number;
  data: number;
  knownMask: number;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

interface GPIOToolProps {
  isActive?: boolean;
}

export const GPIOTool: React.FC<GPIOToolProps> = ({ isActive = true }) => {
  const { t } = useTranslation();
  const deviceState = useSyncExternalStore(sharedDevice.subscribe, sharedDevice.getState);
  const { signals: spiAuxSignals } = useSpiAuxPins();
  const spiReservedPins = useMemo(() => getSpiReservedPins(spiAuxSignals), [spiAuxSignals]);
  const spiReservedMask = useMemo(
    () => [...spiReservedPins.keys()].reduce((mask, pin) => mask | (1 << pin), 0),
    [spiReservedPins]
  );
  const availableGpioMask = GPIO_CONTROL_MASK & ~spiReservedMask;
  const [snapshot, setSnapshot] = useState<GpioSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [automationRunning, setAutomationRunning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const connected = deviceState.online && deviceState.deviceIndex !== null;
  const currentDevice =
    deviceState.devices.find((device) => device.index === deviceState.deviceIndex) ?? null;

  const readState = useCallback(
    async (announce: boolean) => {
      if (!deviceState.online || deviceState.deviceIndex === null) {
        setSnapshot(null);
        if (announce) {
          setNotice({ kind: 'error', text: t('gpioTool.deviceNotConnected') });
        }
        return;
      }

      setBusy(true);
      try {
        const result = await invokeCommand('ch347_gpio_get', {
          index: deviceState.deviceIndex,
        });
        setSnapshot({
          direction: result.direction & 0xff,
          data: result.data & 0xff,
          knownMask: 0xff,
        });
        if (announce) {
          setNotice({ kind: 'success', text: t('gpioTool.readSuccess') });
        }
      } catch (error) {
        setSnapshot(null);
        setNotice({
          kind: 'error',
          text: t('gpioTool.readFailed', { error: normalizeIpcError(error).message }),
        });
      } finally {
        setBusy(false);
      }
    },
    [deviceState.deviceIndex, deviceState.online, t]
  );

  useEffect(() => {
    if (!connected) {
      setSnapshot(null);
      setNotice(null);
      return;
    }
    if (isActive && !automationRunning) {
      void readState(false);
    }
  }, [automationRunning, connected, isActive, readState]);

  const setOutputs = useCallback(
    async (mask: number, high: boolean, options: ApplyOutputOptions = {}) => {
      const { successText, announce = true, readBack = true, manageBusy = true } = options;
      if (!deviceState.online || deviceState.deviceIndex === null) {
        setNotice({ kind: 'error', text: t('gpioTool.deviceNotConnected') });
        return false;
      }

      const requestedMask = mask & GPIO_CONTROL_MASK;
      const writableMask = requestedMask & ~spiReservedMask;
      if (writableMask === 0) {
        const pins = [...spiReservedPins.entries()]
          .filter(([pin]) => (requestedMask & (1 << pin)) !== 0)
          .map(([pin, names]) => `GPIO${pin} (${names.join('/')})`)
          .join(', ');
        setNotice({ kind: 'error', text: t('spiWiring.reservedBySpi', { pins }) });
        return false;
      }

      if (manageBusy) setBusy(true);
      try {
        await invokeCommand('ch347_gpio_set', {
          index: deviceState.deviceIndex,
          enable: writableMask,
          dirOut: writableMask,
          dataOut: high ? writableMask : 0,
        });

        // Reflect the completed write immediately. A readback below replaces this
        // optimistic state with the actual direction and pin levels from CH347.
        setSnapshot((previous) => ({
          direction: (previous?.direction ?? 0) | writableMask,
          data: high
            ? (previous?.data ?? 0) | writableMask
            : (previous?.data ?? 0) & (~writableMask & 0xff),
          knownMask: (previous?.knownMask ?? 0) | writableMask,
        }));

        if (readBack) {
          try {
            const result = await invokeCommand('ch347_gpio_get', {
              index: deviceState.deviceIndex,
            });
            setSnapshot({
              direction: result.direction & 0xff,
              data: result.data & 0xff,
              knownMask: 0xff,
            });
          } catch {
            // The write already succeeded. Keep the per-pin optimistic result if
            // this optional readback is unavailable.
          }
        }

        if (announce && successText) {
          setNotice({
            kind: 'success',
            text:
              writableMask === requestedMask
                ? successText
                : `${successText} · ${t('spiWiring.reservedSkipped')}`,
          });
        }
        return true;
      } catch (error) {
        setNotice({
          kind: 'error',
          text: t('gpioTool.writeFailed', { error: normalizeIpcError(error).message }),
        });
        return false;
      } finally {
        if (manageBusy) setBusy(false);
      }
    },
    [deviceState.deviceIndex, deviceState.online, spiReservedMask, spiReservedPins, t]
  );

  const setPin = (pin: number, high: boolean) => {
    void setOutputs(1 << pin, high, {
      successText: t('gpioTool.pinSetSuccess', { pin, level: high ? 'HIGH' : 'LOW' }),
    });
  };

  const setAllPins = (high: boolean) => {
    void setOutputs(availableGpioMask, high, {
      successText: t('gpioTool.allSetSuccess', { level: high ? 'HIGH' : 'LOW' }),
    });
  };

  const controlsDisabled = busy || automationRunning;

  return (
    <div className="gpio-tool">
      <div className={`gpio-device-bar ${connected ? 'connected' : 'disconnected'}`}>
        <span className="gpio-device-dot" aria-hidden="true" />
        <div className="gpio-device-copy">
          <strong>{connected ? t('gpioTool.connected') : t('gpioTool.disconnected')}</strong>
          <span>
            {connected
              ? currentDevice?.name || `CH347 #${deviceState.deviceIndex}`
              : t('gpioTool.connectHint')}
          </span>
        </div>
        <button
          type="button"
          className="gpio-toolbar-button"
          onClick={() => void readState(true)}
          disabled={!connected || controlsDisabled}
        >
          <FontAwesomeIcon icon={faRotate} spin={busy} />
          {t('gpioTool.readState')}
        </button>
      </div>

      <div className="gpio-toolbar">
        <div>
          <h3>{t('gpioTool.outputControl')}</h3>
          <p>{t('gpioTool.outputControlHint')}</p>
        </div>
        <div className="gpio-toolbar-actions">
          <button
            type="button"
            className="gpio-toolbar-button gpio-low-button"
            onClick={() => setAllPins(false)}
            disabled={!connected || controlsDisabled || availableGpioMask === 0}
          >
            <FontAwesomeIcon icon={faArrowDown} />
            {t('gpioTool.allLow')}
          </button>
          <button
            type="button"
            className="gpio-toolbar-button gpio-high-button"
            onClick={() => setAllPins(true)}
            disabled={!connected || controlsDisabled || availableGpioMask === 0}
          >
            <FontAwesomeIcon icon={faArrowUp} />
            {t('gpioTool.allHigh')}
          </button>
        </div>
      </div>

      <div className="gpio-pin-list" role="table" aria-label={t('gpioTool.pinList')}>
        <div className="gpio-pin-header" role="row">
          <span role="columnheader">{t('gpioTool.pin')}</span>
          <span role="columnheader">{t('gpioTool.direction')}</span>
          <span role="columnheader">{t('gpioTool.level')}</span>
          <span role="columnheader">{t('gpioTool.control')}</span>
        </div>

        {GPIO_PINS.map((pin) => {
          const mask = 1 << pin;
          const known = snapshot !== null && (snapshot.knownMask & mask) !== 0;
          const output = known && (snapshot.direction & mask) !== 0;
          const high = known && (snapshot.data & mask) !== 0;
          const spiReservations = spiReservedPins.get(pin) ?? [];
          const reservedBySpi = spiReservations.length > 0;

          return (
            <div
              className={`gpio-pin-row ${reservedBySpi ? 'reserved-by-spi' : ''}`}
              role="row"
              key={pin}
            >
              <div className="gpio-pin-name" role="cell">
                <span className="gpio-pin-number">{pin}</span>
                <span className="gpio-pin-copy">
                  <strong>GPIO{pin}</strong>
                  {reservedBySpi && (
                    <small className="gpio-spi-reservation">
                      {t('spiWiring.reservationLabel', { names: spiReservations.join(' / ') })}
                    </small>
                  )}
                </span>
              </div>
              <div role="cell">
                <span
                  className={`gpio-direction-badge ${
                    !known ? 'unknown' : output ? 'output' : 'input'
                  }`}
                >
                  {!known
                    ? t('gpioTool.unknown')
                    : output
                      ? t('gpioTool.output')
                      : t('gpioTool.input')}
                </span>
              </div>
              <div className="gpio-level" role="cell">
                <span
                  className={`gpio-level-dot ${!known ? 'unknown' : high ? 'high' : 'low'}`}
                  aria-hidden="true"
                />
                <strong>{!known ? '—' : high ? 'HIGH' : 'LOW'}</strong>
              </div>
              <div className="gpio-pin-actions" role="cell">
                <button
                  type="button"
                  className={`gpio-level-button low ${known && output && !high ? 'active' : ''}`}
                  onClick={() => setPin(pin, false)}
                  disabled={!connected || controlsDisabled || reservedBySpi}
                  title={
                    reservedBySpi ? t('spiWiring.reservedBySpi', { pins: `GPIO${pin}` }) : undefined
                  }
                  aria-pressed={known && output && !high}
                >
                  {t('gpioTool.low')}
                </button>
                <button
                  type="button"
                  className={`gpio-level-button high ${known && output && high ? 'active' : ''}`}
                  onClick={() => setPin(pin, true)}
                  disabled={!connected || controlsDisabled || reservedBySpi}
                  title={
                    reservedBySpi ? t('spiWiring.reservedBySpi', { pins: `GPIO${pin}` }) : undefined
                  }
                  aria-pressed={known && output && high}
                >
                  {t('gpioTool.high')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <AdvancedGPIOPanel
        connected={connected}
        disabled={busy}
        onApply={setOutputs}
        onRunningChange={setAutomationRunning}
      />

      {notice && <div className={`gpio-notice ${notice.kind}`}>{notice.text}</div>}

      <div className="gpio-hints">
        <p>{t('gpioTool.sharedPinHint')}</p>
      </div>
    </div>
  );
};
