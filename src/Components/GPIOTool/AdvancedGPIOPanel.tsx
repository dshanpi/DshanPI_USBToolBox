import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronLeft,
  faChevronRight,
  faPlay,
  faPlus,
  faSliders,
  faStop,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

const GPIO_PINS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const GPIO_CONTROL_MASK = 0xff;
const MAX_DELAY_MS = 86_400_000;
const MAX_LOOP_COUNT = 1_000_000;

export interface ApplyOutputOptions {
  successText?: string;
  announce?: boolean;
  readBack?: boolean;
  manageBusy?: boolean;
}

interface AdvancedGPIOPanelProps {
  connected: boolean;
  disabled: boolean;
  onApply: (mask: number, high: boolean, options?: ApplyOutputOptions) => Promise<boolean>;
  onRunningChange: (running: boolean) => void;
}

interface SequenceStep {
  id: number;
  pin: number;
  high: boolean;
  holdMs: string;
}

interface RunStatus {
  kind: 'info' | 'success' | 'error';
  text: string;
}

let nextStepId = 2;

function createStep(high: boolean, pin = 1): SequenceStep {
  nextStepId += 1;
  return { id: nextStepId, pin, high, holdMs: '500' };
}

function waitFor(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (ms <= 0) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve(true);
    }, ms);
    const handleAbort = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

interface PinMaskSelectorProps {
  mask: number;
  disabled: boolean;
  label: string;
  onChange: (mask: number) => void;
}

const PinMaskSelector: React.FC<PinMaskSelectorProps> = ({ mask, disabled, label, onChange }) => (
  <div className="gpio-mask-selector" role="group" aria-label={label}>
    {GPIO_PINS.map((pin) => {
      const bit = 1 << pin;
      const selected = (mask & bit) !== 0;
      return (
        <button
          type="button"
          key={pin}
          className={selected ? 'selected' : ''}
          onClick={() => onChange(selected ? mask & ~bit : mask | bit)}
          disabled={disabled}
          aria-pressed={selected}
        >
          {pin}
        </button>
      );
    })}
  </div>
);

export const AdvancedGPIOPanel: React.FC<AdvancedGPIOPanelProps> = ({
  connected,
  disabled,
  onApply,
  onRunningChange,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [selectedMask, setSelectedMask] = useState(0);
  const [steps, setSteps] = useState<SequenceStep[]>([
    { id: 1, pin: 1, high: true, holdMs: '500' },
    { id: 2, pin: 1, high: false, holdMs: '500' },
  ]);
  const [startDelayMs, setStartDelayMs] = useState('0');
  const [loopCount, setLoopCount] = useState('1');
  const [running, setRunning] = useState(false);
  const [activeStepId, setActiveStepId] = useState<number | null>(null);
  const [status, setStatus] = useState<RunStatus | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const stopReasonRef = useRef<'user' | 'disconnect' | null>(null);

  const locked = disabled || running;

  useEffect(() => {
    if (!connected && controllerRef.current) {
      stopReasonRef.current = 'disconnect';
      controllerRef.current.abort();
    }
  }, [connected]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      onRunningChange(false);
    },
    [onRunningChange]
  );

  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded]);

  const setStep = (id: number, change: Partial<SequenceStep>) => {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...change } : step)));
  };

  const addStep = () => {
    const previous = steps[steps.length - 1];
    setSteps((current) => [
      ...current,
      createStep(previous ? !previous.high : true, previous?.pin ?? 1),
    ]);
  };

  const removeStep = (id: number) => {
    setSteps((current) => current.filter((step) => step.id !== id));
  };

  const applySelected = async (high: boolean) => {
    if (selectedMask === 0) return;
    const selectedPins = GPIO_PINS.filter((pin) => (selectedMask & (1 << pin)) !== 0).join(', ');
    await onApply(selectedMask, high, {
      successText: t('gpioTool.advanced.multiSetSuccess', {
        pins: selectedPins,
        level: high ? 'HIGH' : 'LOW',
      }),
    });
  };

  const validateSequence = () => {
    const delay = Number(startDelayMs);
    const loops = Number(loopCount);
    const parsedSteps = steps.map((step) => ({
      ...step,
      hold: Number(step.holdMs),
    }));

    const validDelay =
      startDelayMs.trim() !== '' && Number.isInteger(delay) && delay >= 0 && delay <= MAX_DELAY_MS;
    const validLoops =
      loopCount.trim() !== '' && Number.isInteger(loops) && loops >= 0 && loops <= MAX_LOOP_COUNT;
    const validSteps =
      parsedSteps.length > 0 &&
      parsedSteps.every(
        (step) =>
          GPIO_PINS.includes(step.pin as (typeof GPIO_PINS)[number]) &&
          Number.isInteger(step.hold) &&
          step.hold >= 10 &&
          step.hold <= MAX_DELAY_MS
      );

    if (!validDelay || !validLoops || !validSteps) return null;
    return { delay, loops, steps: parsedSteps };
  };

  const startSequence = async () => {
    if (!connected || controllerRef.current) return;
    const config = validateSequence();
    if (!config) {
      setStatus({ kind: 'error', text: t('gpioTool.advanced.invalidSequence') });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    stopReasonRef.current = null;
    setRunning(true);
    setExpanded(true);
    setStatus({
      kind: 'info',
      text:
        config.delay > 0
          ? t('gpioTool.advanced.waitingToStart', { ms: config.delay })
          : t('gpioTool.advanced.starting'),
    });
    onRunningChange(true);

    let failed = false;
    let completedCycles = 0;

    try {
      if (!(await waitFor(config.delay, controller.signal))) return;

      sequence: while (
        !controller.signal.aborted &&
        (config.loops === 0 || completedCycles < config.loops)
      ) {
        for (let stepIndex = 0; stepIndex < config.steps.length; stepIndex += 1) {
          if (controller.signal.aborted) break sequence;
          const step = config.steps[stepIndex];
          setActiveStepId(step.id);
          setStatus({
            kind: 'info',
            text: t('gpioTool.advanced.runningStatus', {
              cycle: completedCycles + 1,
              cycles: config.loops === 0 ? '∞' : config.loops,
              step: stepIndex + 1,
              steps: config.steps.length,
            }),
          });

          const finalWrite =
            config.loops > 0 &&
            completedCycles === config.loops - 1 &&
            stepIndex === config.steps.length - 1;
          const applied = await onApply(1 << step.pin, step.high, {
            announce: false,
            readBack: finalWrite,
            manageBusy: false,
          });
          if (!applied) {
            failed = true;
            break sequence;
          }
          if (!(await waitFor(step.hold, controller.signal))) break sequence;
        }
        completedCycles += 1;
      }
    } finally {
      const stopReason = stopReasonRef.current;
      controllerRef.current = null;
      stopReasonRef.current = null;
      setActiveStepId(null);
      setRunning(false);
      onRunningChange(false);

      if (stopReason === 'disconnect') {
        setStatus({ kind: 'error', text: t('gpioTool.advanced.stoppedByDisconnect') });
      } else if (stopReason === 'user') {
        setStatus({ kind: 'info', text: t('gpioTool.advanced.sequenceStopped') });
      } else if (failed) {
        setStatus({ kind: 'error', text: t('gpioTool.advanced.sequenceFailed') });
      } else {
        setStatus({
          kind: 'success',
          text: t('gpioTool.advanced.sequenceCompleted', { cycles: completedCycles }),
        });
      }
    }
  };

  const stopSequence = () => {
    if (!controllerRef.current) return;
    stopReasonRef.current = 'user';
    controllerRef.current.abort();
  };

  return (
    <>
      <button
        type="button"
        className={`gpio-advanced-rail ${expanded ? 'open' : ''} ${running ? 'running' : ''}`}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls="gpio-advanced-drawer"
      >
        <FontAwesomeIcon icon={expanded ? faChevronRight : faChevronLeft} />
        <FontAwesomeIcon icon={faSliders} />
        <span>{t('gpioTool.advanced.title')}</span>
        {running && <i aria-label={t('gpioTool.advanced.running')} />}
      </button>

      {expanded && (
        <aside
          id="gpio-advanced-drawer"
          className="gpio-advanced-drawer"
          aria-label={t('gpioTool.advanced.title')}
        >
          <div className="gpio-advanced-drawer-header">
            <div>
              <strong>{t('gpioTool.advanced.title')}</strong>
              <small>{t('gpioTool.advanced.subtitle')}</small>
            </div>
            {running && <em>{t('gpioTool.advanced.running')}</em>}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              title={t('gpioTool.advanced.closePanel')}
              aria-label={t('gpioTool.advanced.closePanel')}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div className="gpio-advanced-drawer-body">
            <div className="gpio-advanced-block">
              <div className="gpio-advanced-block-title">
                <div>
                  <h4>{t('gpioTool.advanced.multiTitle')}</h4>
                  <p>{t('gpioTool.advanced.multiHint')}</p>
                </div>
                <div className="gpio-advanced-text-actions">
                  <button
                    type="button"
                    onClick={() => setSelectedMask(GPIO_CONTROL_MASK)}
                    disabled={locked}
                  >
                    {t('gpioTool.advanced.selectAll')}
                  </button>
                  <button type="button" onClick={() => setSelectedMask(0)} disabled={locked}>
                    {t('gpioTool.advanced.clearSelection')}
                  </button>
                </div>
              </div>
              <div className="gpio-multi-control-row">
                <PinMaskSelector
                  mask={selectedMask}
                  disabled={locked}
                  label={t('gpioTool.advanced.selectPins')}
                  onChange={setSelectedMask}
                />
                <div className="gpio-toolbar-actions">
                  <button
                    type="button"
                    className="gpio-level-button low"
                    onClick={() => void applySelected(false)}
                    disabled={!connected || locked || selectedMask === 0}
                  >
                    {t('gpioTool.advanced.setSelectedLow')}
                  </button>
                  <button
                    type="button"
                    className="gpio-level-button high"
                    onClick={() => void applySelected(true)}
                    disabled={!connected || locked || selectedMask === 0}
                  >
                    {t('gpioTool.advanced.setSelectedHigh')}
                  </button>
                </div>
              </div>
            </div>

            <div className="gpio-advanced-block">
              <div className="gpio-advanced-block-title">
                <div>
                  <h4>{t('gpioTool.advanced.sequenceTitle')}</h4>
                  <p>{t('gpioTool.advanced.sequenceHint')}</p>
                </div>
                <button type="button" className="gpio-add-step" onClick={addStep} disabled={locked}>
                  <FontAwesomeIcon icon={faPlus} />
                  {t('gpioTool.advanced.addStep')}
                </button>
              </div>

              <div className="gpio-sequence-list">
                {steps.length === 0 && (
                  <div className="gpio-sequence-empty">{t('gpioTool.advanced.noSteps')}</div>
                )}
                {steps.map((step, index) => (
                  <div
                    className={`gpio-sequence-step ${activeStepId === step.id ? 'active' : ''}`}
                    key={step.id}
                  >
                    <span className="gpio-step-index">{index + 1}</span>
                    <div className="gpio-step-pins">
                      <label htmlFor={`gpio-pin-${step.id}`}>
                        {t('gpioTool.advanced.stepPin')}
                      </label>
                      <select
                        id={`gpio-pin-${step.id}`}
                        className="gpio-step-pin-select"
                        value={step.pin}
                        onChange={(event) => setStep(step.id, { pin: Number(event.target.value) })}
                        disabled={locked}
                      >
                        {GPIO_PINS.map((pin) => (
                          <option value={pin} key={pin}>
                            GPIO{pin}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="gpio-step-level">
                      <label>{t('gpioTool.advanced.stepLevel')}</label>
                      <div>
                        <button
                          type="button"
                          className={!step.high ? 'selected low' : ''}
                          onClick={() => setStep(step.id, { high: false })}
                          disabled={locked}
                        >
                          LOW
                        </button>
                        <button
                          type="button"
                          className={step.high ? 'selected high' : ''}
                          onClick={() => setStep(step.id, { high: true })}
                          disabled={locked}
                        >
                          HIGH
                        </button>
                      </div>
                    </div>
                    <div className="gpio-step-hold">
                      <label htmlFor={`gpio-hold-${step.id}`}>
                        {t('gpioTool.advanced.holdTime')}
                      </label>
                      <div>
                        <input
                          id={`gpio-hold-${step.id}`}
                          type="number"
                          min={10}
                          max={MAX_DELAY_MS}
                          step={10}
                          value={step.holdMs}
                          onChange={(event) => setStep(step.id, { holdMs: event.target.value })}
                          disabled={locked}
                        />
                        <span>ms</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="gpio-delete-step"
                      onClick={() => removeStep(step.id)}
                      disabled={locked}
                      title={t('gpioTool.advanced.deleteStep')}
                      aria-label={t('gpioTool.advanced.deleteStep')}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="gpio-schedule-config">
                <label>
                  <span>{t('gpioTool.advanced.startDelay')}</span>
                  <div>
                    <input
                      type="number"
                      min={0}
                      max={MAX_DELAY_MS}
                      step={100}
                      value={startDelayMs}
                      onChange={(event) => setStartDelayMs(event.target.value)}
                      disabled={locked}
                    />
                    <small>ms</small>
                  </div>
                </label>
                <label>
                  <span>{t('gpioTool.advanced.loopCount')}</span>
                  <div>
                    <input
                      type="number"
                      min={0}
                      max={MAX_LOOP_COUNT}
                      step={1}
                      value={loopCount}
                      onChange={(event) => setLoopCount(event.target.value)}
                      disabled={locked}
                    />
                    <small>{t('gpioTool.advanced.zeroInfinite')}</small>
                  </div>
                </label>
                {!running ? (
                  <button
                    type="button"
                    className="gpio-sequence-start"
                    onClick={() => void startSequence()}
                    disabled={!connected || disabled || steps.length === 0}
                  >
                    <FontAwesomeIcon icon={faPlay} />
                    {t('gpioTool.advanced.startSequence')}
                  </button>
                ) : (
                  <button type="button" className="gpio-sequence-stop" onClick={stopSequence}>
                    <FontAwesomeIcon icon={faStop} />
                    {t('gpioTool.advanced.stopSequence')}
                  </button>
                )}
              </div>

              {status && (
                <div className={`gpio-automation-status ${status.kind}`}>{status.text}</div>
              )}
            </div>
          </div>
        </aside>
      )}
    </>
  );
};
