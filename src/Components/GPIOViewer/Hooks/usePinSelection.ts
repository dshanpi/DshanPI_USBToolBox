import { useState, useCallback } from 'react';
import type { PinRowData } from '../types';

export interface UsePinSelectionReturn {
  selectedPins: Set<string>;
  handleRowClick: (row: PinRowData, event: React.MouseEvent, pinData?: PinRowData[]) => void;
  handleCheckboxChange: (pin: string, checked: boolean) => void;
  handleSelectAll: (checked: boolean, pinData: PinRowData[]) => void;
  handleClearSelection: () => void;
  isAllSelected: (pinData: PinRowData[]) => boolean;
}

export const usePinSelection = (): UsePinSelectionReturn => {
  const [selectedPins, setSelectedPins] = useState<Set<string>>(new Set());

  const handleRowClick = useCallback(
    (row: PinRowData, event: React.MouseEvent, pinData: PinRowData[] = []) => {
      if (event.ctrlKey || event.metaKey) {
        setSelectedPins((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(row.pin)) {
            newSet.delete(row.pin);
          } else {
            newSet.add(row.pin);
          }
          return newSet;
        });
      } else if (event.shiftKey && selectedPins.size > 0) {
        const lastPin = Array.from(selectedPins).pop();
        const lastIndex = pinData.findIndex((p) => p.pin === lastPin);
        const currentIndex = pinData.findIndex((p) => p.pin === row.pin);

        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          const newSet = new Set(selectedPins);
          for (let i = start; i <= end; i++) {
            newSet.add(pinData[i].pin);
          }
          setSelectedPins(newSet);
        }
      } else {
        setSelectedPins(new Set([row.pin]));
      }
    },
    [selectedPins]
  );

  const handleCheckboxChange = useCallback((pin: string, checked: boolean) => {
    setSelectedPins((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(pin);
      } else {
        newSet.delete(pin);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean, pinData: PinRowData[]) => {
    if (checked) {
      setSelectedPins(new Set(pinData.map((p) => p.pin)));
    } else {
      setSelectedPins(new Set());
    }
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedPins(new Set());
  }, []);

  const isAllSelected = useCallback(
    (pinData: PinRowData[]) => {
      return pinData.length > 0 && selectedPins.size === pinData.length;
    },
    [selectedPins]
  );

  return {
    selectedPins,
    handleRowClick,
    handleCheckboxChange,
    handleSelectAll,
    handleClearSelection,
    isAllSelected,
  };
};
