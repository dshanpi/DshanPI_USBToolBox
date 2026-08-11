import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GPIO } from '../../../Drivers/GPIO';
import type { PinRowData, EditValues, ProgressState } from '../types';

export interface UsePinEditingReturn {
  editingPins: PinRowData[];
  editValues: EditValues | null;
  changedPins: Set<string>;
  isEditing: boolean;
  progress: ProgressState;
  statusText: string;
  getCommonMuxOptions: (pins: PinRowData[], gpio: GPIO | null) => { index: number; name: string }[];
  handleInlineEdit: (row: PinRowData) => void;
  handleMultiEdit: (pinData: PinRowData[], selectedPins: Set<string>) => void;
  handleInlineSave: (
    gpio: GPIO | null,
    refreshPinData: (gpio: GPIO) => Promise<void>
  ) => Promise<void>;
  handleInlineCancel: () => void;
  setEditValues: React.Dispatch<React.SetStateAction<EditValues | null>>;
}

export const usePinEditing = (): UsePinEditingReturn => {
  const { t } = useTranslation();
  const [editingPins, setEditingPins] = useState<PinRowData[]>([]);
  const [editValues, setEditValues] = useState<EditValues | null>(null);
  const [changedPins] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0 });
  const [statusText, setStatusText] = useState('');

  const getCommonMuxOptions = useCallback((pins: PinRowData[], gpio: GPIO | null) => {
    if (!gpio || pins.length === 0) return [];

    const pinMuxLists = pins.map((pin) => {
      const muxList = gpio.getPinMuxList(pin.pin);
      return new Set(muxList.filter((name) => name !== 'null'));
    });

    if (pins.length === 1) {
      const muxList = gpio.getPinMuxList(pins[0].pin);
      return muxList
        .map((name: string, index: number) => ({ index, name }))
        .filter((item: { index: number; name: string }) => item.name !== 'null');
    }

    const commonNames = pinMuxLists.reduce((acc, set) => {
      const result = new Set<string>();
      for (const name of acc) {
        if (set.has(name)) {
          result.add(name);
        }
      }
      return result;
    });

    const result: { index: number; name: string }[] = [];
    const firstMuxList = gpio.getPinMuxList(pins[0].pin);
    for (let i = 0; i < firstMuxList.length; i++) {
      if (commonNames.has(firstMuxList[i])) {
        result.push({ index: i, name: firstMuxList[i] });
      }
    }
    return result;
  }, []);

  const handleStartEdit = useCallback((pins: PinRowData[]) => {
    if (pins.length === 0) return;

    const firstPin = pins[0];
    const pullValue = firstPin.pull === 'PULL UP' ? 1 : firstPin.pull === 'PULL DOWN' ? 2 : 0;
    const dataValue = firstPin.data === true ? 1 : firstPin.data === false ? 0 : 0;

    let initialMux: number;
    let initialPull: number;
    let initialDrv: number;
    let initialData: number;

    if (pins.length === 1) {
      initialMux = firstPin.mux.id;
      initialPull = pullValue;
      initialDrv = firstPin.drv;
      initialData = dataValue;
    } else {
      const allMuxSame = pins.every((p) => p.mux.id === firstPin.mux.id);
      const allPullSame = pins.every((p) => p.pull === firstPin.pull);
      const allDrvSame = pins.every((p) => p.drv === firstPin.drv);
      const allDataSame = pins.every((p) => p.data === firstPin.data);

      initialMux = allMuxSame ? firstPin.mux.id : -1;
      initialPull = allPullSame ? pullValue : -1;
      initialDrv = allDrvSame ? firstPin.drv : -1;
      initialData = allDataSame ? dataValue : -1;
    }

    setEditingPins(pins);
    setEditValues({
      mux: initialMux,
      pull: initialPull,
      drv: initialDrv,
      data: initialData,
    });
  }, []);

  const handleInlineEdit = useCallback(
    (row: PinRowData) => {
      handleStartEdit([row]);
    },
    [handleStartEdit]
  );

  const handleMultiEdit = useCallback(
    (pinData: PinRowData[], selectedPins: Set<string>) => {
      const pins = pinData.filter((p) => selectedPins.has(p.pin));
      if (pins.length > 0) {
        handleStartEdit(pins);
      }
    },
    [handleStartEdit]
  );

  const handleInlineSave = useCallback(
    async (gpio: GPIO | null, refreshPinData: (gpio: GPIO) => Promise<void>) => {
      if (!gpio || !editValues || editingPins.length === 0) return;

      const totalOps = editingPins.length;
      let currentOp = 0;
      setProgress({ current: 0, total: totalOps });
      setStatusText(t('gpioViewer.status.applying', '正在应用配置...'));

      for (const pin of editingPins) {
        const gpioId = pin.gpioId;
        if (editValues.mux !== -1) {
          await gpio.sunxiGpioSetMuxSingle(gpioId, editValues.mux);
        }
        if (editValues.pull !== -1) {
          await gpio.sunxiGpioPinSetPull(gpioId, editValues.pull);
        }
        if (editValues.drv !== -1) {
          await gpio.sunxiGpioPinSetDrv(gpioId, editValues.drv);
        }
        if (editValues.mux === 1 && editValues.data !== -1) {
          await gpio.sunxiGpioSetData(gpioId, editValues.data);
        }
        currentOp++;
        setProgress({ current: currentOp, total: totalOps });
      }
      await refreshPinData(gpio);
      setEditingPins([]);
      setEditValues(null);
    },
    [editValues, editingPins, t]
  );

  const handleInlineCancel = useCallback(() => {
    setEditingPins([]);
    setEditValues(null);
  }, []);

  const isEditing = editingPins.length > 0 && editValues !== null;

  return {
    editingPins,
    editValues,
    changedPins,
    isEditing,
    progress,
    statusText,
    getCommonMuxOptions,
    handleInlineEdit,
    handleMultiEdit,
    handleInlineSave,
    handleInlineCancel,
    setEditValues,
  };
};
