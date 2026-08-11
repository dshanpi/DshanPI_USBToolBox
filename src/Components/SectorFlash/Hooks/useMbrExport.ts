import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { MbrBuilder } from '../../../FlashConfig';
import { LogEntry } from '../../../FlashManager';
import { formatErrorForLog } from '../../../FlashManager';

export interface MbrExportOptions {
  format: 'binary' | 'json';
  includePartitions: boolean;
  includeCopies: boolean;
}

export interface MbrExportState {
  mbrExportOptions: MbrExportOptions;
}

export interface MbrExportActions {
  setMbrExportOptions: (options: MbrExportOptions) => void;
  handleExportMbr: () => Promise<void>;
}

export interface UseMbrExportProps {
  mbrBuilder: MbrBuilder | null;
  addLog: (level: LogEntry['level'], message: string) => void;
}

export function useMbrExport({
  mbrBuilder,
  addLog,
}: UseMbrExportProps): MbrExportState & MbrExportActions {
  const { t } = useTranslation();
  const [mbrExportOptions, setMbrExportOptions] = useState<MbrExportOptions>({
    format: 'binary',
    includePartitions: false,
    includeCopies: true,
  });

  const handleExportMbr = useCallback(async () => {
    if (!mbrBuilder) return;

    try {
      const extension = mbrExportOptions.format === 'json' ? 'json' : 'bin';
      const savePath = await save({
        defaultPath: `mbr.${extension}`,
        filters: [{ name: 'MBR Files', extensions: [extension, 'mbr'] }],
      });

      if (!savePath) return;

      if (mbrExportOptions.format === 'json') {
        const mbrInfoData = await mbrBuilder.getMbrInfo();
        const exportData = {
          magic: mbrInfoData.magic,
          version: mbrInfoData.version,
          copy: mbrInfoData.copy,
          index: mbrInfoData.index,
          partCount: mbrInfoData.partCount,
          partitions: mbrExportOptions.includePartitions
            ? mbrInfoData.partitions.map((p) => ({
                name: p.name,
                classname: p.classname,
                address: p.address.toString(),
                length: p.length.toString(),
                user_type: p.user_type,
                keydata: p.keydata,
                readonly: p.readonly,
              }))
            : undefined,
        };
        await writeFile(
          savePath as string,
          new TextEncoder().encode(JSON.stringify(exportData, null, 2))
        );
      } else {
        const mbrData = mbrExportOptions.includeCopies
          ? await mbrBuilder.serializeWithCopies()
          : await mbrBuilder.serialize();
        await writeFile(savePath as string, mbrData);
      }

      addLog('success', t('sectorFlash.exportSuccess', { path: savePath }));
    } catch (err) {
      addLog('error', t('sectorFlash.exportFailed', { error: formatErrorForLog(err) }));
    }
  }, [mbrBuilder, mbrExportOptions, addLog, t]);

  return {
    mbrExportOptions,
    setMbrExportOptions,
    handleExportMbr,
  };
}
