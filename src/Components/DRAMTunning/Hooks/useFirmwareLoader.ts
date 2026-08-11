import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invokeCommand } from '../../../Platform/IPC/Client';

export interface UseFirmwareLoaderReturn {
  firmwarePath: string | null;
  fesData: Uint8Array | null;
  boot0Header: { ret_addr: number; run_addr: number } | null;
  loading: boolean;
  handleSelectFirmware: () => Promise<void>;
}

export const useFirmwareLoader = (
  addLog: (level: string, message: string) => void
): UseFirmwareLoaderReturn => {
  const { t } = useTranslation();
  const [firmwarePath, setFirmwarePath] = useState<string | null>(null);
  const [fesData, setFesData] = useState<Uint8Array | null>(null);
  const [boot0Header, setBoot0Header] = useState<{ ret_addr: number; run_addr: number } | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  const handleSelectFirmware = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Firmware', extensions: ['img'] }],
      });
      if (!selected) return;

      const filePath =
        typeof selected === 'string' ? selected : (selected as { path: string }).path;
      setLoading(true);
      addLog(
        'INFO',
        t('dramTunning.log.loadingFirmware', 'Loading firmware: {{path}}', { path: filePath })
      );

      const fesBytes = await invokeCommand('firmware_read_entry_by_maintype_subtype', {
        filePath,
        maintype: 'FES     ',
        subtype: 'FES_1-0000000000',
      });

      if (!fesBytes) {
        addLog('ERRO', t('dramTunning.log.fesNotFound', 'FES binary not found in firmware'));
        setLoading(false);
        return;
      }

      const fesUint8 = new Uint8Array(fesBytes);
      const header = (await invokeCommand('firmware_parse_boot0', {
        data: fesBytes,
      })) as { ret_addr: number; run_addr: number };

      setFirmwarePath(filePath);
      setFesData(fesUint8);
      setBoot0Header(header);
      addLog(
        'OKAY',
        t(
          'dramTunning.log.firmwareLoaded',
          'Firmware loaded. ret_addr=0x{{ret}}, run_addr=0x{{run}}',
          {
            ret: header.ret_addr.toString(16),
            run: header.run_addr.toString(16),
          }
        )
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      addLog(
        'ERRO',
        t('dramTunning.log.loadFailed', 'Failed to load firmware: {{error}}', {
          error: error.message,
        })
      );
    } finally {
      setLoading(false);
    }
  }, [addLog, t]);

  return { firmwarePath, fesData, boot0Header, loading, handleSelectFirmware };
};
