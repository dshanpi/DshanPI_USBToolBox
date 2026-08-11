import { useCallback } from 'react';
import type { AdbDevice } from '../../../Services';
import type { TFunction } from 'i18next';

export function useDeviceActions(
  selectedDevice: string | null,
  isRoot: boolean | null,
  handleRoot: () => Promise<boolean>,
  scanDevices: (
    currentPath?: string
  ) => Promise<{ devices: AdbDevice[]; shouldClearFiles: boolean }>,
  devices: AdbDevice[],
  handleSelectDevice: (serial: string) => Promise<void>,
  currentPath: string,
  setError: (error: string | null) => void,
  t: TFunction
) {
  const handleRootWrapper = useCallback(async () => {
    if (!selectedDevice || isRoot === true) return;
    try {
      await handleRoot();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await scanDevices(currentPath);
      if (devices.length === 1) {
        await handleSelectDevice(devices[0].serial);
      }
      setError(null);
    } catch {
      setError(t('adbExplorer.error.root', '获取 Root 权限失败'));
    }
  }, [
    selectedDevice,
    isRoot,
    handleRoot,
    scanDevices,
    devices,
    handleSelectDevice,
    t,
    currentPath,
    setError,
  ]);

  return {
    handleRootWrapper,
  };
}
