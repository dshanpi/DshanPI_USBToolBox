import { useCallback, useSyncExternalStore } from 'react';

export type SpiAuxSignalId = 'dc' | 'rst' | 'bl' | string;

export interface SpiAuxSignal {
  id: SpiAuxSignalId;
  name: string;
  pin: number;
  enabled: boolean;
  builtIn: boolean;
}

const STORAGE_KEY = 'usbtoolbox-spi-aux-pins-v1';
const GPIO_PIN_MIN = 0;
const GPIO_PIN_MAX = 7;

export const DEFAULT_SPI_AUX_SIGNALS: SpiAuxSignal[] = [
  { id: 'dc', name: 'DC', pin: 4, enabled: true, builtIn: true },
  { id: 'rst', name: 'RST', pin: 5, enabled: true, builtIn: true },
  { id: 'bl', name: 'BL', pin: 6, enabled: true, builtIn: true },
];

function cloneDefaults(): SpiAuxSignal[] {
  return DEFAULT_SPI_AUX_SIGNALS.map((signal) => ({ ...signal }));
}

function isValidPin(pin: unknown): pin is number {
  return Number.isInteger(pin) && Number(pin) >= GPIO_PIN_MIN && Number(pin) <= GPIO_PIN_MAX;
}

function normalizeSignal(value: unknown): SpiAuxSignal | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SpiAuxSignal>;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  if (!isValidPin(raw.pin)) return null;
  return {
    id: raw.id.trim(),
    name: raw.name.trim().slice(0, 20),
    pin: raw.pin,
    enabled: raw.enabled !== false,
    builtIn: raw.id === 'dc' || raw.id === 'rst' || raw.id === 'bl',
  };
}

function loadSignals(): SpiAuxSignal[] {
  if (typeof window === 'undefined') return cloneDefaults();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cloneDefaults();
    const loaded = parsed
      .map(normalizeSignal)
      .filter((item): item is SpiAuxSignal => item !== null);
    const byId = new Map(loaded.map((signal) => [signal.id, signal]));
    const builtIns = DEFAULT_SPI_AUX_SIGNALS.map((fallback) => ({
      ...(byId.get(fallback.id) ?? fallback),
      id: fallback.id,
      name: fallback.name,
      builtIn: true,
    }));
    const custom = loaded.filter((signal) => !signal.builtIn && !byId.has(`builtin:${signal.id}`));
    return [...builtIns, ...custom].slice(0, 8);
  } catch {
    return cloneDefaults();
  }
}

let currentSignals = loadSignals();
const listeners = new Set<() => void>();

function persist(signals: SpiAuxSignal[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(signals));
  } catch {
    // Keep the in-memory setting when localStorage is unavailable.
  }
}

function publish(signals: SpiAuxSignal[]): void {
  currentSignals = signals;
  persist(signals);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SpiAuxSignal[] {
  return currentSignals;
}

export function getSpiAuxSignal(id: string, signals = currentSignals): SpiAuxSignal | undefined {
  return signals.find((signal) => signal.id === id);
}

export function getSpiAuxPinConflicts(signals = currentSignals): Map<number, SpiAuxSignal[]> {
  const grouped = new Map<number, SpiAuxSignal[]>();
  signals
    .filter((signal) => signal.enabled)
    .forEach((signal) => grouped.set(signal.pin, [...(grouped.get(signal.pin) ?? []), signal]));
  return new Map([...grouped].filter(([, items]) => items.length > 1));
}

export function getSpiReservedPins(signals = currentSignals): Map<number, string[]> {
  const result = new Map<number, string[]>();
  signals
    .filter((signal) => signal.enabled)
    .forEach((signal) => result.set(signal.pin, [...(result.get(signal.pin) ?? []), signal.name]));
  return result;
}

export interface UseSpiAuxPinsResult {
  signals: SpiAuxSignal[];
  updateSignal: (
    id: string,
    patch: Partial<Pick<SpiAuxSignal, 'name' | 'pin' | 'enabled'>>
  ) => void;
  addSignal: () => void;
  removeSignal: (id: string) => void;
  resetSignals: () => void;
}

export function useSpiAuxPins(): UseSpiAuxPinsResult {
  const signals = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const updateSignal = useCallback<UseSpiAuxPinsResult['updateSignal']>((id, patch) => {
    publish(
      currentSignals.map((signal) => {
        if (signal.id !== id) return signal;
        const nextName =
          signal.builtIn || patch.name === undefined
            ? signal.name
            : patch.name.trimStart().slice(0, 20);
        return {
          ...signal,
          ...patch,
          name: nextName,
          pin: isValidPin(patch.pin) ? patch.pin : signal.pin,
          builtIn: signal.builtIn,
        };
      })
    );
  }, []);

  const addSignal = useCallback(() => {
    if (currentSignals.length >= 8) return;
    const usedPins = new Set(
      currentSignals.filter((signal) => signal.enabled).map((signal) => signal.pin)
    );
    const availablePin = Array.from({ length: 8 }, (_, pin) => pin).find(
      (pin) => !usedPins.has(pin)
    );
    const suffix = currentSignals.filter((signal) => !signal.builtIn).length + 1;
    publish([
      ...currentSignals,
      {
        id: `aux-${Date.now()}-${suffix}`,
        name: `AUX${suffix}`,
        pin: availablePin ?? 0,
        enabled: true,
        builtIn: false,
      },
    ]);
  }, []);

  const removeSignal = useCallback((id: string) => {
    publish(currentSignals.filter((signal) => signal.builtIn || signal.id !== id));
  }, []);

  const resetSignals = useCallback(() => publish(cloneDefaults()), []);

  return { signals, updateSignal, addSignal, removeSignal, resetSignals };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    currentSignals = loadSignals();
    listeners.forEach((listener) => listener());
  });
}
