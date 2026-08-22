/**
 * Firmware Loader component for viewing and extracting firmware contents.
 *
 * This component provides detailed firmware image analysis, displaying:
 * - Image header information (IMAGEWTY format)
 * - sys_config.fex configuration
 * - Boot0 and U-Boot headers
 * - MBR partition table details
 * - TOC1 boot package structure
 * - Device tree (DTB) contents
 * - Partition table with extraction capability
 * - Embedded file list with extraction capability
 *
 * Users can extract individual partitions or files from the firmware image.
 */
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { save, message } from '@tauri-apps/plugin-dialog';
import { Partition, FileInfo, ImageInfo } from '../../Library/DshanPIIMG';
import {
  ImageInfoSection,
  SysConfigSection,
  Boot0Section,
  UBootSection,
  MbrSection,
  PartitionTableSection,
  FileListSection,
  DtbSection,
  BootPackageSection,
} from './Components';
import { useFirmwareLoader } from './Hooks';
import { invokeCommand } from '../../Platform/IPC';
import './FirmwareLoader.css';

/**
 * Result from file extraction operation.
 */
interface ExtractResult {
  /** Whether extraction succeeded */
  success: boolean;
  /** Error message if extraction failed */
  message: string;
  /** Number of bytes written to destination */
  bytes_written: number;
}

/**
 * Props for the FirmwareLoader component.
 */
interface FirmwareLoaderProps {
  /** Callback invoked when image is successfully loaded */
  onImageLoaded?: (info: ImageInfo) => void;
}

/**
 * Firmware Loader component for firmware image analysis and extraction.
 *
 * Provides a scrollable interface showing all parsed firmware components.
 * Users can open firmware images and extract individual partitions or files.
 *
 * @param props - Component props
 * @param props.onImageLoaded - Optional callback when image is loaded
 * @returns The FirmwareLoader component
 */
export const FirmwareLoader: React.FC<FirmwareLoaderProps> = ({ onImageLoaded }) => {
  const { t } = useTranslation();

  /**
   * Firmware loader state from custom hook.
   * Contains all parsed data from the loaded firmware image.
   */
  const {
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
  } = useFirmwareLoader(onImageLoaded);

  /**
   * Handler for extracting a partition from the firmware image.
   * Prompts user for save location and extracts partition data.
   * @param partition - Partition to extract
   */
  const handleExtractPartition = useCallback(
    async (partition: Partition) => {
      if (!partition.downloadfile) {
        setError(t('firmwareLoader.errors.noDownloadFile', { name: partition.name }));
        return;
      }

      if (!filePath) {
        setError(t('firmwareLoader.errors.loadFailed'));
        return;
      }

      const fileInfo = packer.current.getFileInfoByFilename(partition.downloadfile);
      if (!fileInfo) {
        setError(t('firmwareLoader.errors.extractFailed', { name: partition.name }));
        return;
      }

      // Default to FEX extension for extracted files
      let defaultName = partition.downloadfile;
      if (!defaultName.toLowerCase().endsWith('.fex')) {
        defaultName = defaultName.replace(/\.[^.]+$/, '') + '.fex';
      }

      const savePath = await save({
        defaultPath: defaultName,
        filters: [
          {
            name: 'FEX Files',
            extensions: ['fex'],
          },
        ],
      });

      if (!savePath) {
        return;
      }

      try {
        const result = (await invokeCommand('extract_file_chunked', {
          sourcePath: filePath,
          destPath: savePath,
          offset: fileInfo.offset,
          length: fileInfo.length,
        })) as ExtractResult;

        if (result.success) {
          await message(t('firmwareLoader.errors.saved', { path: savePath }), {
            title: t('firmwareLoader.errors.saveComplete'),
            kind: 'info',
          });
        } else {
          setError(result.message);
        }
      } catch (err) {
        setError(`${t('firmwareLoader.errors.saveFailed')} ${err}`);
      }
    },
    [filePath, packer, setError, t]
  );

  /**
   * Handler for extracting an embedded file from the firmware image.
   * Prompts user for save location and extracts file data.
   * @param file - File info to extract
   */
  const handleExtractFile = useCallback(
    async (file: FileInfo) => {
      if (!filePath) {
        setError(t('firmwareLoader.errors.loadFailed'));
        return;
      }

      const fileInfo = packer.current.getFileInfoByFilename(file.filename);
      if (!fileInfo) {
        setError(t('firmwareLoader.errors.extractFileFailed', { filename: file.filename }));
        return;
      }

      // Default to FEX extension for extracted files
      let defaultName = file.filename.replace(/^\//, '');
      if (!defaultName.toLowerCase().endsWith('.fex')) {
        defaultName = defaultName.replace(/\.[^.]+$/, '') + '.fex';
      }

      const savePath = await save({
        defaultPath: defaultName,
        filters: [
          {
            name: 'FEX Files',
            extensions: ['fex'],
          },
        ],
      });

      if (!savePath) {
        return;
      }

      try {
        const result = (await invokeCommand('extract_file_chunked', {
          sourcePath: filePath,
          destPath: savePath,
          offset: fileInfo.offset,
          length: fileInfo.length,
        })) as ExtractResult;

        if (result.success) {
          await message(t('firmwareLoader.errors.saved', { path: savePath }), {
            title: t('firmwareLoader.errors.saveComplete'),
            kind: 'info',
          });
        } else {
          setError(result.message);
        }
      } catch (err) {
        setError(`${t('firmwareLoader.errors.saveFailed')} ${err}`);
      }
    },
    [filePath, packer, setError, t]
  );

  return (
    <div className="firmware-loader">
      {/* Header with open button */}
      <div className="firmware-loader-header">
        <h2>{t('firmwareLoader.openImage')}</h2>
        <button onClick={handleOpenFile} disabled={loading} className="open-button">
          {loading ? t('common.loading') : t('firmwareLoader.openImage')}
        </button>
      </div>

      {/* Error display */}
      {error && <div className="error-message">{error}</div>}

      {/* File path display */}
      {filePath && (
        <div className="file-path">
          <strong>{t('firmwareLoader.filePath')}</strong> <span>{filePath}</span>
        </div>
      )}

      {/* Parsed firmware sections */}
      {imageInfo && (
        <ImageInfoSection
          imageInfo={imageInfo}
          partitions={partitions}
          isEncrypted={packer.current.isEncryptedImage()}
        />
      )}

      {sysConfig && <SysConfigSection sysConfig={sysConfig} />}

      {boot0Header && <Boot0Section boot0Header={boot0Header} />}

      {ubootHeader && <UBootSection ubootHeader={ubootHeader} />}

      {mbrInfo && <MbrSection mbrInfo={mbrInfo} />}

      {bootPackage && bootPackageData && (
        <BootPackageSection bootPackage={bootPackage} bootPackageData={bootPackageData} />
      )}

      {fdtData && <DtbSection fdtData={fdtData} />}

      {partitions.length > 0 && (
        <PartitionTableSection partitions={partitions} onExtract={handleExtractPartition} />
      )}

      {imageInfo && imageInfo.files.length > 0 && (
        <FileListSection
          files={imageInfo.files}
          getFunctionBySubtype={getFunctionBySubtype}
          onExtract={handleExtractFile}
        />
      )}
    </div>
  );
};

export default FirmwareLoader;