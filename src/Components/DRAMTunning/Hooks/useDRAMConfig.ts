import { useState, useCallback, useMemo } from 'react';
import { getAllChips } from '../../../Chips';
import type { DramConfig } from '../../../Drivers/Types';

export interface UseDRAMConfigReturn {
  selectedChipId: string | null;
  dramConfig: DramConfig | null;
  dramParams: number[];
  availableChips: { id: string; name: string }[];
  selectChip: (chipId: string) => void;
  setDramParam: (index: number, value: number) => void;
  setBitfield: (index: number, offset: number, width: number, value: number) => void;
  loadDefaults: () => void;
  resetParams: () => void;
}

export const useDRAMConfig = (): UseDRAMConfigReturn => {
  const [selectedChipId, setSelectedChipId] = useState<string | null>(null);
  const [dramParams, setDramParams] = useState<number[]>(new Array(32).fill(0));

  const availableChips = useMemo(() => {
    return getAllChips()
      .filter((chip) => chip.dramConfig)
      .map((chip) => ({
        id: chip.id,
        name: chip.dramConfig!.chipName,
      }));
  }, []);

  const dramConfig = useMemo(() => {
    if (!selectedChipId) return null;
    const chip = getAllChips().find((c) => c.id === selectedChipId);
    return chip?.dramConfig ?? null;
  }, [selectedChipId]);

  const selectChip = useCallback((chipId: string) => {
    setSelectedChipId(chipId);
    const chip = getAllChips().find((c) => c.id === chipId);
    if (chip?.dramConfig?.defaults) {
      setDramParams([...chip.dramConfig.defaults]);
    } else {
      setDramParams(new Array(32).fill(0));
    }
  }, []);

  const setDramParam = useCallback((index: number, value: number) => {
    setDramParams((prev) => {
      const next = [...prev];
      next[index] = value >>> 0;
      return next;
    });
  }, []);

  const setBitfield = useCallback((index: number, offset: number, width: number, value: number) => {
    setDramParams((prev) => {
      const next = [...prev];
      const mask = ((1 << width) - 1) << offset;
      next[index] = ((next[index] & ~mask) | ((value << offset) & mask)) >>> 0;
      return next;
    });
  }, []);

  const loadDefaults = useCallback(() => {
    if (!selectedChipId) return;
    const chip = getAllChips().find((c) => c.id === selectedChipId);
    if (chip?.dramConfig?.defaults) {
      setDramParams([...chip.dramConfig.defaults]);
    }
  }, [selectedChipId]);

  const resetParams = useCallback(() => {
    setDramParams(new Array(32).fill(0));
  }, []);

  return {
    selectedChipId,
    dramConfig,
    dramParams,
    availableChips,
    selectChip,
    setDramParam,
    setBitfield,
    loadDefaults,
    resetParams,
  };
};
