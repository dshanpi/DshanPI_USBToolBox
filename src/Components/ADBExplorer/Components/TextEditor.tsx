import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { join } from '@tauri-apps/api/path';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { adbService, type AdbFileInfo } from '../../../Services';
import { normalizeIpcError } from '../../../Platform/IPC/Client';
import { getCacheDir } from '../Utils';
import { MonacoEditor, getLanguageId } from '../../../CoreUI/MonacoEditor';

interface TextEditorProps {
  item: AdbFileInfo;
  selectedDevice: string | null;
  onSaveSuccess: () => void;
  setError: (error: string | null) => void;
  onChangesChange?: (hasChanges: boolean) => void;
}

export interface TextEditorRef {
  save: () => Promise<boolean>;
  hasUnsavedChanges: () => boolean;
  close: () => Promise<boolean>;
}

export const TextEditor = forwardRef<TextEditorRef, TextEditorProps>(
  ({ item, selectedDevice, onSaveSuccess, setError, onChangesChange }, ref) => {
    const { t } = useTranslation();
    const [content, setContent] = useState<string>('');
    const [originalContent, setOriginalContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
      const loadFileContent = async () => {
        if (!selectedDevice) return;

        setLoading(true);
        setContent('');
        setOriginalContent('');
        setHasChanges(false);
        onChangesChange?.(false);

        try {
          const cacheDir = await getCacheDir();
          const tempPath = await join(cacheDir, item.name);

          await adbService.pullFile(selectedDevice, item.path, tempPath);

          const fileContent = await readTextFile(tempPath);
          setContent(fileContent);
          setOriginalContent(fileContent);
        } catch (e) {
          setError(`${t('adbExplorer.error.open', '打开失败')}: ${normalizeIpcError(e).message}`);
        } finally {
          setLoading(false);
        }
      };

      loadFileContent();
    }, [item, selectedDevice, setError, t, onChangesChange]);

    useEffect(() => {
      const changed = content !== originalContent;
      setHasChanges(changed);
      onChangesChange?.(changed);
    }, [content, originalContent, onChangesChange]);

    const handleSave = useCallback(async (): Promise<boolean> => {
      if (!selectedDevice || !hasChanges) return false;

      setSaving(true);
      try {
        const cacheDir = await getCacheDir();
        const tempPath = await join(cacheDir, item.name);

        await writeTextFile(tempPath, content);

        await adbService.pushFile(selectedDevice, tempPath, item.path);

        setOriginalContent(content);
        setHasChanges(false);
        onSaveSuccess();
        setError(null);
        return true;
      } catch (e) {
        setError(`${t('adbExplorer.error.save', '保存失败')}: ${normalizeIpcError(e).message}`);
        return false;
      } finally {
        setSaving(false);
      }
    }, [selectedDevice, hasChanges, content, item, onSaveSuccess, setError, t]);

    const handleClose = useCallback(async (): Promise<boolean> => {
      if (hasChanges) {
        return window.confirm(t('adbExplorer.unsavedChanges', '您有未保存的更改，确定要离开吗？'));
      }
      return true;
    }, [hasChanges, t]);

    useImperativeHandle(ref, () => ({
      save: handleSave,
      hasUnsavedChanges: () => hasChanges,
      close: handleClose,
    }));

    return (
      <div className="nautilus-text-editor">
        {loading ? (
          <div className="nautilus-editor-loading">
            <div className="nautilus-spinner"></div>
            <span>{t('common.loading')}</span>
          </div>
        ) : (
          <MonacoEditor value={content} onChange={setContent} language={getLanguageId(item.name)} />
        )}
        {saving && (
          <div className="nautilus-editor-saving-overlay">
            <div className="nautilus-spinner"></div>
            <span>{t('common.saving')}</span>
          </div>
        )}
      </div>
    );
  }
);

TextEditor.displayName = 'TextEditor';
