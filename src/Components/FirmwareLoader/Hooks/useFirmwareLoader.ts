import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import {
  DshanPIPacker,
  DshanPIPartition,
  ImageInfo,
  Partition,
  getFes,
  getUboot,
  getMbr,
  getSysConfig,
  getPartitionData,
  getDtb,
  getBootPackageData,
} from '../../../Library/DshanPIIMG';
import {
  Boot0Header,
  UBootHeaderParser,
  SunxiMbrParser,
  SunxiSysConfigParser,
  BootFileHead,
  UBootHead,
  MbrInfo,
  SysConfig,
  BootPackageParser,
  BootPackage,
} from '../../../FlashConfig';
import { loadSettings, saveSettings, AppSettings } from '../../../Settings/settingsStore';

export interface FirmwareLoaderState {
  imageInfo: ImageInfo | null;
  partitions: Partition[];
  loading: boolean;
  error: string | null;
  filePath: string | null;
  boot0Header: BootFileHead | null;
  ubootHeader: UBootHead | null;
  mbrInfo: MbrInfo | null;
  sysConfig: SysConfig | null;
  fdtData: Uint8Array | null;
  bootPackage: BootPackage | null;
  bootPackageData: Uint8Array | null;
}

export function useFirmwareLoader(onImageLoaded?: (info: ImageInfo) => void) {
  const { t } = useTranslation();
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [boot0Header, setBoot0Header] = useState<BootFileHead | null>(null);
  const [ubootHeader, setUbootHeader] = useState<UBootHead | null>(null);
  const [mbrInfo, setMbrInfo] = useState<MbrInfo | null>(null);
  const [sysConfig, setSysConfig] = useState<SysConfig | null>(null);
  const [fdtData, setFdtData] = useState<Uint8Array | null>(null);
  const [bootPackage, setBootPackage] = useState<BootPackage | null>(null);
  const [bootPackageData, setBootPackageData] = useState<Uint8Array | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const packer = useRef(new DshanPIPacker());
  const partitionParser = useRef(new DshanPIPartition());
  const hasAutoLoaded = useRef(false);
  const onImageLoadedRef = useRef(onImageLoaded);
  const tRef = useRef(t);

  useEffect(() => {
    onImageLoadedRef.current = onImageLoaded;
  }, [onImageLoaded]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const loadImage = useCallback(async (path: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      setImageInfo(null);
      setPartitions([]);
      setFilePath(null);
      setBoot0Header(null);
      setUbootHeader(null);
      setMbrInfo(null);
      setSysConfig(null);
      setFdtData(null);
      setBootPackage(null);
      setBootPackageData(null);

      partitionParser.current.clear();

      setFilePath(path);

      const success = await packer.current.loadImageFromPath(path);

      if (!success) {
        if (packer.current.isEncryptedImage()) {
          setError(tRef.current('firmwareLoader.errors.encrypted'));
        } else {
          const lastError = packer.current.getLastError();
          setError(
            tRef.current('firmwareLoader.errors.loadFailed') + (lastError ? `: ${lastError}` : '')
          );
        }
        setLoading(false);
        return false;
      }

      const info = packer.current.getImageInfo();
      setImageInfo(info);
      onImageLoadedRef.current?.(info!);

      // Fetch all data in parallel for better performance
      const [
        partitionFileData,
        boot0Data,
        ubootData,
        mbrData,
        sysConfigData,
        dtbData,
        bootPackageRawData,
      ] = await Promise.all([
        getPartitionData(packer.current),
        getFes(packer.current),
        getUboot(packer.current),
        getMbr(packer.current),
        getSysConfig(packer.current),
        getDtb(packer.current),
        getBootPackageData(packer.current),
      ]);

      // Process partition data
      if (partitionFileData) {
        await partitionParser.current.parseFromData(partitionFileData);
        setPartitions(partitionParser.current.getPartitions());
      } else {
        setPartitions([]);
      }

      // Process Boot0
      if (boot0Data) {
        try {
          const header = await Boot0Header.parse(boot0Data);
          setBoot0Header(header);
        } catch (err) {
          console.log('Failed to parse Boot0 header:', err);
        }
      }

      // Process U-Boot
      if (ubootData) {
        try {
          const header = await UBootHeaderParser.parse(ubootData);
          setUbootHeader(header);
        } catch (err) {
          console.log('Failed to parse U-Boot header:', err);
        }
      }

      // Process MBR
      if (mbrData) {
        try {
          const mbr = await SunxiMbrParser.parse(mbrData);
          const mbrInfo = await SunxiMbrParser.toMbrInfo(mbr);
          setMbrInfo(mbrInfo);
        } catch (err) {
          console.log('Failed to parse MBR:', err);
        }
      }

      // Process SysConfig
      if (sysConfigData) {
        try {
          const config = await SunxiSysConfigParser.parse(sysConfigData);
          setSysConfig(config);
        } catch (err) {
          console.log('Failed to parse SysConfig:', err);
        }
      }

      // Process DTB
      if (dtbData) {
        setFdtData(dtbData);
      }

      // Process boot package (TOC1/BOOTPKG)
      if (bootPackageRawData) {
        setBootPackageData(bootPackageRawData);

        if (BootPackageParser.isValidLocal(bootPackageRawData)) {
          try {
            const pkg = await BootPackageParser.parse(bootPackageRawData);
            setBootPackage(pkg);
          } catch (err) {
            console.log('Failed to parse boot package:', err);
          }
        }
      }

      setLoading(false);
      return true;
    } catch (err) {
      setError(`${tRef.current('firmwareLoader.errors.fileLoadFailed')} ${err}`);
      setLoading(false);
      return false;
    }
  }, []);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (settings?.rememberLastImage && settings.lastImagePath && !hasAutoLoaded.current) {
      hasAutoLoaded.current = true;
      const path = settings.lastImagePath;
      exists(path).then((fileExists) => {
        if (fileExists) {
          loadImage(path).then((success) => {
            if (!success) {
              saveSettings({ ...settings, lastImagePath: null });
            }
          });
        } else {
          saveSettings({ ...settings, lastImagePath: null });
        }
      });
    } else if (settings && !settings.rememberLastImage) {
      hasAutoLoaded.current = true;
    }
  }, [settings, loadImage]);

  const handleOpenFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: 'Image Files',
          extensions: ['img', 'bin'],
        },
      ],
    });

    if (!selected) {
      return;
    }

    const path = selected as string;
    const success = await loadImage(path);

    if (success && settings?.rememberLastImage) {
      await saveSettings({ ...settings, lastImagePath: path });
    }
  }, [loadImage, settings]);

  const getFunctionBySubtype = useCallback((subtype: string): string => {
    return packer.current.getFunctionBySubtype(subtype) || '-';
  }, []);

  return {
    imageInfo,
    partitions,
    loading,
    error,
    filePath,
    boot0Header,
    ubootHeader,
    mbrInfo,
    sysConfig,
    fdtData,
    bootPackage,
    bootPackageData,
    packer,
    handleOpenFile,
    getFunctionBySubtype,
    setError,
  };
}
