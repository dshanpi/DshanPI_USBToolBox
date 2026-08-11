import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { OpenixPacker, getFes } from '../../../Library/OpenixIMG';
import { formatHex, parseAddress } from '../Utils';
import { efexService, type EfexContext } from '../../../Services';
import type { DisasmArch } from '../Types';

export interface UseMemoryOperationsReturn {
  address: string;
  setAddress: (addr: string) => void;
  length: string;
  setLength: (len: string) => void;
  memoryData: Uint8Array | null;
  memoryBaseAddr: number;
  loading: boolean;
  disasmArch: DisasmArch;
  setDisasmArch: (arch: DisasmArch) => void;
  writeAddress: string;
  setWriteAddress: (addr: string) => void;
  writeFilePath: string | null;
  initFilePath: string | null;
  execAddress: string;
  setExecAddress: (addr: string) => void;
  handleReadMemory: () => Promise<void>;
  handleSaveMemory: () => Promise<void>;
  handleWriteFile: () => Promise<void>;
  handleSelectFile: () => Promise<void>;
  handleSelectInitFile: () => Promise<void>;
  handleInitMemory: () => Promise<void>;
  handleExec: () => Promise<void>;
  setMemoryData: (data: Uint8Array | null) => void;
}

function formatDramParameters(values: number[]): string {
  const lines: string[] = [];
  for (let index = 0; index < values.length; index += 4) {
    lines.push(
      values
        .slice(index, index + 4)
        .map((value) => `0x${value.toString(16)}`)
        .join(', ')
    );
  }
  return `DRAM parameters:\n  ${lines.join('\n  ')}`;
}

export const useMemoryOperations = (
  context: EfexContext | null,
  addLog: (level: string, message: string) => void
): UseMemoryOperationsReturn => {
  const { t } = useTranslation();
  const [address, setAddress] = useState('0x00000000');
  const [length, setLength] = useState('256');
  const [memoryData, setMemoryData] = useState<Uint8Array | null>(null);
  const [memoryBaseAddr, setMemoryBaseAddr] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [disasmArch, setDisasmArch] = useState<DisasmArch>('off');

  const [writeAddress, setWriteAddress] = useState('0x00000000');
  const [writeFilePath, setWriteFilePath] = useState<string | null>(null);
  const [initFilePath, setInitFilePath] = useState<string | null>(null);
  const [execAddress, setExecAddress] = useState('0x00000000');

  const handleReadMemory = useCallback(async () => {
    if (!context) {
      addLog('ERRO', t('efelGui.logMessages.selectDeviceFirst', '请先选择设备'));
      return;
    }
    const addr = parseAddress(address);
    const len = parseAddress(length);
    if (addr === null || isNaN(addr)) {
      addLog('ERRO', t('efelGui.logMessages.invalidAddress', '地址格式无效'));
      return;
    }
    if (len === null || isNaN(len) || len <= 0 || len > 65536) {
      addLog('ERRO', t('efelGui.logMessages.invalidLength', '长度格式无效'));
      return;
    }
    setLoading(true);
    addLog(
      'INFO',
      t('efelGui.logMessages.readMemory', '读取内存：{addr} ({len} 字节)', {
        addr: formatHex(addr),
        len,
      })
    );
    try {
      const data = await efexService.readMemory(context, addr, len);
      setMemoryData(data);
      setMemoryBaseAddr(addr);
      addLog('OKAY', t('efelGui.logMessages.readSuccess', '读取成功 ({len} 字节)', { len }));
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      addLog(
        'ERRO',
        t('efelGui.logMessages.readFailed', '读取失败：{error}', { error: e.message })
      );
      setMemoryData(null);
    } finally {
      setLoading(false);
    }
  }, [context, address, length, addLog, t]);

  const handleSaveMemory = useCallback(async () => {
    if (!memoryData) {
      addLog('ERRO', t('efelGui.logMessages.noDataToSave', '没有数据可保存'));
      return;
    }
    const filePath = await save({
      title: t('efelGui.memoryRead.saveTitle', '保存内存数据'),
      defaultPath: `memory_${address.replace('0x', '')}.bin`,
      filters: [{ name: 'Binary', extensions: ['bin'] }],
    });
    if (!filePath) return;
    try {
      await writeFile(filePath, memoryData);
      addLog('OKAY', t('efelGui.logMessages.savedTo', '已保存到：{path}', { path: filePath }));
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      addLog(
        'ERRO',
        t('efelGui.logMessages.saveFailed', '保存失败：{error}', { error: e.message })
      );
    }
  }, [memoryData, address, addLog, t]);

  const handleWriteFile = useCallback(async () => {
    if (!context) {
      addLog('ERRO', t('efelGui.logMessages.selectDeviceFirst', '请先选择设备'));
      return;
    }
    if (!writeFilePath) {
      addLog('ERRO', t('efelGui.logMessages.selectFileFirst', '请先选择文件'));
      return;
    }
    const addr = parseAddress(writeAddress);
    if (addr === null || isNaN(addr)) {
      addLog('ERRO', t('efelGui.logMessages.invalidAddress', '地址格式无效'));
      return;
    }
    setLoading(true);
    addLog(
      'INFO',
      t('efelGui.logMessages.writeFileToMemory', '写入文件到内存：{addr}', {
        addr: formatHex(addr),
      })
    );
    try {
      const fileData = await readFile(writeFilePath);
      await efexService.writeMemory(context, addr, fileData);
      addLog(
        'OKAY',
        t('efelGui.logMessages.writeSuccess', '写入成功 ({len} 字节)', { len: fileData.length })
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      addLog(
        'ERRO',
        t('efelGui.logMessages.writeFailed', '写入失败：{error}', { error: e.message })
      );
    } finally {
      setLoading(false);
    }
  }, [context, writeFilePath, writeAddress, addLog, t]);

  const handleSelectFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      title: t('efelGui.memoryWrite.selectFile', '选择文件'),
    });
    if (selected) {
      setWriteFilePath(selected as string);
      addLog(
        'INFO',
        t('efelGui.logMessages.fileSelected', '已选择文件：{path}', { path: selected })
      );
    }
  }, [addLog, t]);

  const handleSelectInitFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      title: t('efelGui.initMemory.imageFile', '镜像文件'),
      filters: [{ name: 'Image', extensions: ['img', 'bin'] }],
    });
    if (selected) {
      setInitFilePath(selected as string);
      addLog(
        'INFO',
        t('efelGui.logMessages.imageSelected', '已选择镜像：{path}', { path: selected })
      );
    }
  }, [addLog, t]);

  const handleInitMemory = useCallback(async () => {
    if (!context) {
      addLog('ERRO', t('efelGui.logMessages.selectDeviceFirst', '请先选择设备'));
      return;
    }
    if (!initFilePath) {
      addLog('ERRO', t('efelGui.logMessages.selectImageFirst', '请先选择镜像文件'));
      return;
    }
    setLoading(true);
    addLog('INFO', t('efelGui.logMessages.initMemory', '正在初始化内存...'));
    try {
      const packer = new OpenixPacker();
      const success = await packer.loadImageFromPath(initFilePath);
      if (!success) {
        addLog('ERRO', t('efelGui.logMessages.loadImageFailed', '加载镜像文件失败'));
        return;
      }

      const fesData = await getFes(packer);
      if (!fesData) {
        addLog('ERRO', t('efelGui.logMessages.fesNotFound', '未找到 FES 文件'));
        return;
      }

      const result = await efexService.initDram(context, fesData);
      addLog(
        'INFO',
        `DRAM init result: ret_addr=0x${result.ret_addr.toString(16)}, init_flag=${result.dram_init_flag}, update_flag=${result.dram_update_flag}`
      );
      addLog('INFO', formatDramParameters(result.dram_para));

      if (!result.success) {
        addLog('ERRO', t('efelGui.logMessages.dramInitFailed', 'DRAM 初始化失败'));
        return;
      }
      addLog('OKAY', t('efelGui.logMessages.initComplete', '初始化完成'));
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      addLog(
        'ERRO',
        t('efelGui.logMessages.initFailed', '初始化失败：{error}', { error: e.message })
      );
    } finally {
      setLoading(false);
    }
  }, [context, initFilePath, addLog, t]);

  const handleExec = useCallback(async () => {
    if (!context) {
      addLog('ERRO', t('efelGui.logMessages.selectDeviceFirst', '请先选择设备'));
      return;
    }
    const addr = parseAddress(execAddress);
    if (addr === null || isNaN(addr)) {
      addLog('ERRO', t('efelGui.logMessages.invalidAddress', '地址格式无效'));
      return;
    }
    setLoading(true);
    addLog(
      'INFO',
      t('efelGui.logMessages.execJump', '执行跳转：{addr}', { addr: formatHex(addr) })
    );
    try {
      await efexService.execute(context, addr);
      addLog('OKAY', t('efelGui.logMessages.execSuccess', '执行成功'));
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      addLog(
        'ERRO',
        t('efelGui.logMessages.execFailed', '执行失败：{error}', { error: e.message })
      );
    } finally {
      setLoading(false);
    }
  }, [context, execAddress, addLog, t]);

  return {
    address,
    setAddress,
    length,
    setLength,
    memoryData,
    memoryBaseAddr,
    loading,
    disasmArch,
    setDisasmArch,
    writeAddress,
    setWriteAddress,
    writeFilePath,
    initFilePath,
    execAddress,
    setExecAddress,
    handleReadMemory,
    handleSaveMemory,
    handleWriteFile,
    handleSelectFile,
    handleSelectInitFile,
    handleInitMemory,
    handleExec,
    setMemoryData,
  };
};
