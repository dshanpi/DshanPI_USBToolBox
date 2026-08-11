import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getSunxiInfo, type SunxiInfo } from '../../../Drivers/DeviceInfo';
import { GPIO, type ProgressCallback } from '../../../Drivers/GPIO';
import { getChipInfoByBatchNo } from '../../../Chips';
import { adbService, type AdbDevice, type AdbServerStatus } from '../../../Services';
import type { PinRowData, ProgressState } from '../types';

export interface UseDeviceManagerReturn {
  serverStatus: AdbServerStatus | null;
  devices: AdbDevice[];
  selectedDevice: string | null;
  isRoot: boolean | null;
  loading: boolean;
  error: string | null;
  sunxiInfo: SunxiInfo | null;
  gpio: GPIO | null;
  pinData: PinRowData[];
  progress: ProgressState;
  statusText: string;
  checkServerStatus: () => Promise<void>;
  scanDevices: () => Promise<void>;
  handleSelectDevice: (serial: string) => Promise<void>;
  handleRefresh: () => void;
  handleRoot: () => Promise<void>;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setPinData: React.Dispatch<React.SetStateAction<PinRowData[]>>;
}

export const useDeviceManager = (): UseDeviceManagerReturn => {
  const { t } = useTranslation();
  const [serverStatus, setServerStatus] = useState<AdbServerStatus | null>(null);
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [isRoot, setIsRoot] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sunxiInfo, setSunxiInfo] = useState<SunxiInfo | null>(null);
  const [gpio, setGpio] = useState<GPIO | null>(null);
  const [pinData, setPinData] = useState<PinRowData[]>([]);
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0 });
  const [statusText, setStatusText] = useState('');
  const selectingRef = useRef(false);

  const checkServerStatus = useCallback(async () => {
    try {
      const status = await adbService.checkServer();
      setServerStatus(status);
    } catch {
      setServerStatus({ running: false, port: 0 });
    }
  }, []);

  const refreshPinData = useCallback(
    async (gpioInstance: GPIO) => {
      if (!gpioInstance) return;

      setLoading(true);
      setError(null);

      const chipInfo = gpioInstance.getChipInfo();
      const controllerCount = Object.keys(chipInfo.pinctrl).length;
      setProgress({ current: 1, total: controllerCount });

      try {
        setStatusText(t('gpioViewer.status.readingPins', '正在读取 GPIO 配置...'));
        const progressCb: ProgressCallback = (current, _total) => {
          setProgress({ current, total: controllerCount });
        };

        const allData = await gpioInstance.sunxiGpioGetAllPinData(progressCb);

        const rows: PinRowData[] = [];
        for (const [pinName, muxInfo] of Object.entries(allData.mux)) {
          const bank = pinName.substring(0, 2);
          const pinNum = parseInt(pinName.substring(2), 10);
          const gpioId = gpioInstance.gpioPin(bank, pinNum);

          rows.push({
            pin: pinName,
            gpioId,
            mux: muxInfo,
            pull: allData.pull[pinName] || 'UNKNOWN',
            drv: allData.drv[pinName] || 0,
            data: allData.data[pinName] !== undefined ? allData.data[pinName] : 'FUNCTION',
          });
        }

        setPinData(rows);
        setStatusText(t('gpioViewer.status.done', '完成'));
      } catch (e) {
        setError(`${t('gpioViewer.error.readPinData', '读取引脚数据失败')}: ${e}`);
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  const handleSelectDevice = useCallback(
    async (serial: string) => {
      if (selectingRef.current) return;
      selectingRef.current = true;

      setLoading(true);
      setError(null);
      try {
        await adbService.selectDevice(serial);
        setSelectedDevice(serial);

        try {
          await adbService.root(serial);
          setIsRoot(true);
        } catch {
          setIsRoot(false);
          setError(t('gpioViewer.error.rootRequired', '需要 Root 权限才能读取 GPIO 状态'));
          setLoading(false);
          selectingRef.current = false;
          return;
        }

        const info = await getSunxiInfo(serial);
        setSunxiInfo(info);

        const chipInfo = getChipInfoByBatchNo(info.batchno);
        if (!chipInfo) {
          setError(t('gpioViewer.error.unsupportedChip', '不支持的芯片型号: ') + info.batchno);
          setLoading(false);
          selectingRef.current = false;
          return;
        }

        const gpioInstance = new GPIO(serial, chipInfo);
        setGpio(gpioInstance);

        await refreshPinData(gpioInstance);
      } catch (e) {
        setError(`${t('gpioViewer.error.selectDevice', '选择设备失败')}: ${e}`);
      } finally {
        setLoading(false);
        selectingRef.current = false;
      }
    },
    [t, refreshPinData]
  );

  const scanDevices = useCallback(async () => {
    setLoading(true);
    try {
      const deviceList = await adbService.listDevices();
      setDevices(deviceList);

      if (deviceList.length === 0) {
        setSelectedDevice(null);
        setIsRoot(null);
        setSunxiInfo(null);
        setGpio(null);
        setPinData([]);
        return;
      }

      if (deviceList.length === 1) {
        await handleSelectDevice(deviceList[0].serial);
      }
    } catch (e) {
      setError(`${t('gpioViewer.error.scanDevices', '扫描设备失败')}: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [t, handleSelectDevice]);

  const handleRefresh = useCallback(() => {
    if (gpio) {
      refreshPinData(gpio);
    }
  }, [gpio, refreshPinData]);

  const handleRoot = useCallback(async () => {
    if (!selectedDevice || isRoot === true) return;
    try {
      await adbService.root(selectedDevice);
      setIsRoot(true);
    } catch {
      setIsRoot(false);
    }
  }, [selectedDevice, isRoot]);

  return {
    serverStatus,
    devices,
    selectedDevice,
    isRoot,
    loading,
    error,
    sunxiInfo,
    gpio,
    pinData,
    progress,
    statusText,
    checkServerStatus,
    scanDevices,
    handleSelectDevice,
    handleRefresh,
    handleRoot,
    setError,
    setLoading,
    setPinData,
  };
};
