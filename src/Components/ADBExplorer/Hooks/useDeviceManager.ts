import { useState, useEffect, useCallback, useRef } from 'react';
import { adbService, type AdbDevice } from '../../../Services';

export function useDeviceManager(
  onLoadDirectory: (path: string, deviceSerial?: string) => Promise<void>,
  setLoading: (loading: boolean) => void
) {
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [isRoot, setIsRoot] = useState<boolean | null>(null);
  const prevDevicesRef = useRef<AdbDevice[]>([]);

  const handleSelectDevice = useCallback(
    async (serial: string) => {
      setLoading(true);
      try {
        await adbService.selectDevice(serial);
        setSelectedDevice(serial);
        try {
          await adbService.root(serial);
          setIsRoot(true);
        } catch {
          setIsRoot(false);
        }
        await onLoadDirectory('/', serial);
      } finally {
        setLoading(false);
      }
    },
    [onLoadDirectory, setLoading]
  );

  const checkRootAndRefresh = useCallback(
    async (serial: string, currentPath: string) => {
      try {
        await adbService.root(serial);
        setIsRoot(true);
      } catch {
        setIsRoot(false);
      }
      await onLoadDirectory(currentPath, serial);
    },
    [onLoadDirectory]
  );

  const scanDevices = useCallback(
    async (currentPath?: string) => {
      setLoading(true);
      try {
        const deviceList = await adbService.listDevices();
        const prevDevices = prevDevicesRef.current;
        setDevices(deviceList);
        prevDevicesRef.current = deviceList;

        if (deviceList.length === 0) {
          setSelectedDevice(null);
          setIsRoot(null);
          return { devices: [], shouldClearFiles: true };
        }

        if (selectedDevice) {
          const stillConnected = deviceList.some((d) => d.serial === selectedDevice);
          if (stillConnected) {
            if (currentPath) {
              await checkRootAndRefresh(selectedDevice, currentPath);
            }
            return { devices: deviceList, shouldClearFiles: false };
          } else {
            setSelectedDevice(null);
            setIsRoot(null);
            return { devices: deviceList, shouldClearFiles: true };
          }
        }

        const newDevices = deviceList.filter(
          (d) => !prevDevices.some((pd) => pd.serial === d.serial)
        );

        if (newDevices.length > 0 && deviceList.length === 1) {
          await handleSelectDevice(deviceList[0].serial);
          return { devices: deviceList, shouldClearFiles: false };
        }

        if (deviceList.length === 1) {
          await handleSelectDevice(deviceList[0].serial);
          return { devices: deviceList, shouldClearFiles: false };
        }

        return { devices: deviceList, shouldClearFiles: false };
      } finally {
        setLoading(false);
      }
    },
    [selectedDevice, handleSelectDevice, checkRootAndRefresh, setLoading]
  );

  const handleRoot = useCallback(async () => {
    if (!selectedDevice || isRoot === true) return false;
    try {
      await adbService.root(selectedDevice);
      setIsRoot(true);
      return true;
    } catch {
      setIsRoot(false);
      return false;
    }
  }, [selectedDevice, isRoot]);

  useEffect(() => {
    adbService.getSelectedDevice().then((serial) => {
      if (serial) {
        setSelectedDevice(serial);
      }
    });
  }, []);

  return {
    devices,
    selectedDevice,
    isRoot,
    handleSelectDevice,
    scanDevices,
    handleRoot,
  };
}
