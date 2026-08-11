import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { AppSettings, loadSettings, saveSettings } from './settingsStore';
// 烧录设置区块已隐藏（legacy Allwinner 烧录相关），以下导入暂未使用；恢复时取消注释
// import { POST_FLASH_ACTION_OPTIONS, type PostFlashAction, type FlashMode } from '../Domain/flash';
// import { FLASH_MODE_LABELS } from '../FlashManager/Types';
import { efexService, type UsbBackend } from '../Services';
import { supportedLanguages } from '../i18n';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { openUrl } from '@tauri-apps/plugin-opener';
import packageJson from '../../package.json';
import { formatSize } from '../Utils';
import { useTheme, ThemeMode } from '../Themes';
import { ThemeViewer } from '../Themes/Components';
import { invokeCommand } from '../Platform/IPC';
import './Settings.css';

/**
 * 常见 AI 服务商预设（均为 OpenAI 兼容接口）。
 *
 * 选预设自动填入 API 地址 + 推荐模型；模型字段带下拉，列出该服务商常用模型，也可手填。
 * 匹配依据是 apiUrl 里的域名关键字（见 match），匹配不上则归为「自定义」。
 */
const AI_PROVIDERS: Array<{
  id: string;
  label: string;
  apiUrl: string;
  model: string;
  match: string[];
  models: string[];
}> = [
  {
    id: 'openai', label: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini',
    match: ['openai.com'],
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-mini', 'o1-preview'],
  },
  {
    id: 'deepseek', label: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
    match: ['deepseek.com'],
    models: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder'],
  },
  {
    id: 'qwen', label: 'Qwen 通义千问',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus',
    match: ['dashscope'],
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long', 'qwen2.5-72b-instruct'],
  },
  {
    id: 'zhipu', label: 'Zhipu 智谱',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash',
    match: ['bigmodel.cn'],
    models: ['glm-4-flash', 'glm-4', 'glm-4-air', 'glm-4-plus', 'glm-4-long'],
  },
  {
    id: 'moonshot', label: 'Moonshot 月之暗面',
    apiUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k',
    match: ['moonshot.cn'],
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-latest'],
  },
  {
    id: 'doubao', label: 'Doubao 豆包',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-pro-32k',
    match: ['volces.com', 'ark.cn-beijing'],
    models: ['doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-32k', 'doubao-1.5-pro-32k'],
  },
  {
    id: 'siliconflow', label: 'SiliconFlow 硅基流动',
    apiUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct',
    match: ['siliconflow'],
    models: [
      'Qwen/Qwen2.5-7B-Instruct', 'Qwen/Qwen2.5-72B-Instruct',
      'deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1',
    ],
  },
];

const isWindows = navigator.userAgent?.toLowerCase().includes('windows');

const getSystemProxy = async (): Promise<string | undefined> => {
  try {
    const proxy = await invokeCommand('get_system_proxy');
    return proxy;
  } catch (error) {
    console.error('Failed to get system proxy:', error);
    return undefined;
  }
};

const THEME_MODE_OPTIONS: { value: ThemeMode; labelKey: string }[] = [
  { value: 'light', labelKey: 'themes.light' },
  { value: 'dark', labelKey: 'themes.dark' },
  { value: 'system', labelKey: 'themes.system' },
];

interface SettingsProps {
  visible: boolean;
  onClose: () => void;
  onSettingsChange: (settings: AppSettings) => void;
}

interface OriginalUIState {
  language: string;
  themeMode: ThemeMode;
  themeIdDark: string;
  themeIdLight: string;
}

export const Settings: React.FC<SettingsProps> = ({ visible, onClose, onSettingsChange }) => {
  const { t, i18n } = useTranslation();
  const { setThemeMode, setThemeId, availableThemes, currentThemeId, effectiveVariant } =
    useTheme();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [originalUIState, setOriginalUIState] = useState<OriginalUIState | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    available: boolean;
    error?: boolean;
    version?: string;
    downloading?: boolean;
    progress?: number;
    downloaded?: number;
    contentLength?: number;
  } | null>(null);
  const [themeViewerVisible, setThemeViewerVisible] = useState(false);
  // 模型字段是否处于「自定义输入」模式：true 时下拉选「自定义...」并展开文本框，便于输入列表外的模型名
  const [modelCustomMode, setModelCustomMode] = useState(false);

  // 烧录设置区块已隐藏，此辅助函数暂未使用；恢复时取消注释
  // const getFlashModeLabel = (mode: FlashMode): string => {
  //   return t(FLASH_MODE_LABELS[mode]);
  // };

  const filteredThemes = useMemo(
    () => availableThemes.filter((theme) => theme.variant === effectiveVariant),
    [availableThemes, effectiveVariant]
  );

  const validThemeId = useMemo(() => {
    const isValid = filteredThemes.some((t) => t.id === currentThemeId);
    return isValid ? currentThemeId : filteredThemes[0]?.id || currentThemeId;
  }, [filteredThemes, currentThemeId]);

  useEffect(() => {
    if (visible) {
      loadSettings().then((loadedSettings) => {
        setSettings(loadedSettings);
        setOriginalUIState({
          language: loadedSettings.language,
          themeMode: loadedSettings.themeMode,
          themeIdDark: loadedSettings.themeIdDark,
          themeIdLight: loadedSettings.themeIdLight,
        });
      });
      setUpdateInfo(null);
    }
  }, [visible]);

  const handleClose = () => {
    if (originalUIState) {
      i18n.changeLanguage(originalUIState.language);
      setThemeMode(originalUIState.themeMode);
      setThemeId(originalUIState.themeIdDark, 'dark');
      setThemeId(originalUIState.themeIdLight, 'light');
    }
    onClose();
  };

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
    }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    handleChange('language', lang as AppSettings['language']);
  };

  const handleThemeModeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    handleChange('themeMode', mode);
  };

  const handleThemeIdChange = (themeId: string) => {
    setThemeId(themeId, effectiveVariant);
    handleChange('themeIdDark', effectiveVariant === 'dark' ? themeId : settings!.themeIdDark);
    handleChange('themeIdLight', effectiveVariant === 'light' ? themeId : settings!.themeIdLight);
  };

  /** 修改 AI 配置的某个子字段（apiUrl / apiKey / model）。 */
  const handleAiChange = (field: 'apiUrl' | 'apiKey' | 'model', value: string) => {
    if (settings) {
      setSettings({ ...settings, ai: { ...settings.ai, [field]: value } });
    }
  };

  /** 根据当前 apiUrl 推导活跃的服务商预设 id（匹配不上则 'custom'）。 */
  const getAiProvider = (): string => {
    if (!settings) return 'custom';
    const url = settings.ai.apiUrl.toLowerCase();
    for (const p of AI_PROVIDERS) {
      if (p.match.some((m) => url.includes(m))) return p.id;
    }
    return 'custom';
  };

  /** 切换服务商预设：自动填入 API 地址和推荐模型（custom 保留当前值）。 */
  const handleAiProvider = (id: string) => {
    if (!settings) return;
    const p = AI_PROVIDERS.find((x) => x.id === id);
    if (p) {
      setSettings({ ...settings, ai: { ...settings.ai, apiUrl: p.apiUrl, model: p.model } });
      // 切到已知服务商预设：用其推荐模型，退出自定义模式（下拉直接选中该模型）
      setModelCustomMode(false);
    } else {
      // custom：保留当前地址/模型，但该服务商没有常见模型列表 → 进入自定义输入模式
      setModelCustomMode(true);
    }
  };

  /**
   * 首次加载或切换服务商（apiUrl 变化）后，按当前模型是否落在该服务商的常见模型列表里，
   * 决定模型字段是直接用下拉选中，还是进入「自定义...」输入模式。
   * 仅依赖 apiUrl：用户在自定义输入框里打字（改 model）时不应重置模式，否则会闪回下拉。
   */
  useEffect(() => {
    if (!settings) return;
    const provider = AI_PROVIDERS.find((p) => p.id === getAiProvider());
    const models = provider?.models ?? [];
    setModelCustomMode(!models.includes(settings.ai.model));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.ai.apiUrl]);

  /** 下拉选择模型：选「自定义...」进入输入模式，选具体模型则写入并退出输入模式。 */
  const handleModelSelect = (value: string) => {
    if (value === '__custom__') {
      setModelCustomMode(true);
    } else {
      setModelCustomMode(false);
      handleAiChange('model', value);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await efexService.setUsbBackend(settings.usbBackend);
      await saveSettings(settings);
      onSettingsChange(settings);
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateInfo(null);
    try {
      const proxy = await getSystemProxy();
      const update = await check({
        proxy,
        timeout: 30000,
      });
      if (update) {
        setUpdateInfo({
          available: true,
          version: update.version,
        });
      } else {
        setUpdateInfo({
          available: false,
        });
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateInfo({
        available: false,
        error: true,
      });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!updateInfo?.available) return;

    setUpdateInfo((prev) =>
      prev ? { ...prev, downloading: true, progress: 0, downloaded: 0, contentLength: 0 } : null
    );

    try {
      const proxy = await getSystemProxy();
      const update = await check({
        proxy,
        timeout: 30000,
      });
      if (update) {
        let downloaded = 0;
        let contentLength = 0;
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started': {
              contentLength = event.data.contentLength || 0;
              setUpdateInfo((prev) =>
                prev ? { ...prev, contentLength, downloaded: 0, progress: 0 } : null
              );
              break;
            }
            case 'Progress': {
              downloaded += event.data.chunkLength;
              const progress =
                contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
              setUpdateInfo((prev) => (prev ? { ...prev, downloaded, progress } : null));
              break;
            }
            case 'Finished':
              setUpdateInfo((prev) =>
                prev
                  ? { ...prev, progress: 100, downloaded: contentLength, downloading: false }
                  : null
              );
              break;
          }
        });
        await relaunch();
      }
    } catch (error) {
      console.error('Failed to download update:', error);
      setUpdateInfo((prev) =>
        prev ? { ...prev, downloading: false, error: true } : null
      );
    }
  };

  if (!settings) return null;

  // 当前服务商的常见模型列表（custom 服务商为空 → 只显示自定义输入框）
  const currentProvider = AI_PROVIDERS.find((p) => p.id === getAiProvider());
  const commonModels = currentProvider?.models ?? [];
  const currentModelInList = commonModels.includes(settings.ai.model);
  // 下拉当前应选中的值：自定义模式或模型不在列表时选「自定义...」哨兵，否则选该模型
  const modelSelectValue =
    modelCustomMode || !currentModelInList ? '__custom__' : settings.ai.model;
  // 何时展开自定义输入框：自定义模式 / 模型不在列表 / 服务商无常见模型列表
  const showCustomInput =
    modelCustomMode || !currentModelInList || commonModels.length === 0;

  const overlayVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };

  const panelVariants = {
    initial: { opacity: 0, scale: 0.95, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 10 },
  };

  const transition = { duration: 0.15 };

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            className="settings-overlay"
            onClick={handleClose}
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
          >
            <motion.div
              className="settings-panel"
              onClick={(e) => e.stopPropagation()}
              variants={panelVariants}
              transition={transition}
            >
              <div className="settings-header">
                <h2>{t('settings.title')}</h2>
                <motion.button
                  className="settings-close"
                  onClick={handleClose}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ duration: 0.1 }}
                >
                  {t('settings.close')}
                </motion.button>
              </div>

              <div className="settings-content">
                <div className="settings-section">
                  <h3>{t('settings.uiSettings')}</h3>
                  <label className="settings-item">
                    <span className="settings-label">{t('settings.language')}</span>
                    <select
                      value={settings.language}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                    >
                      {supportedLanguages.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.nativeName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-item">
                    <span className="settings-label">{t('settings.themeMode')}</span>
                    <select
                      value={settings.themeMode}
                      onChange={(e) => handleThemeModeChange(e.target.value as ThemeMode)}
                    >
                      {THEME_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.labelKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-item">
                    <span className="settings-label">{t('settings.themeStyle')}</span>
                    <select
                      value={validThemeId}
                      onChange={(e) => handleThemeIdChange(e.target.value)}
                    >
                      {filteredThemes.map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.name} - {theme.variantName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="settings-item">
                    <span className="settings-label">
                      {t('settings.themeViewer', '主题调色板查看器')}
                    </span>
                    <button
                      className="settings-btn settings-btn-secondary"
                      onClick={() => setThemeViewerVisible(true)}
                    >
                      {t('settings.themeViewer', '主题调色板查看器')}
                    </button>
                  </div>
                  <label className="settings-item">
                    <span className="settings-label">{t('settings.sidebarCollapsed')}</span>
                    <input
                      type="checkbox"
                      checked={settings.sidebarCollapsed}
                      onChange={(e) => handleChange('sidebarCollapsed', e.target.checked)}
                    />
                  </label>
                </div>

                {/* 烧录设置（legacy Allwinner 烧录相关）已隐藏，需要恢复时去掉此 JSX 注释即可
                <div className="settings-section">
                  <h3>{t('settings.flashSettings')}</h3>
                  <label className="settings-item">
                    <span className="settings-label">{t('settings.defaultFlashMode')}</span>
                    <select
                      value={settings.defaultFlashMode}
                      onChange={(e) =>
                        handleChange('defaultFlashMode', e.target.value as FlashMode)
                      }
                    >
                      {(Object.keys(FLASH_MODE_LABELS) as FlashMode[]).map((mode) => (
                        <option key={mode} value={mode}>
                          {getFlashModeLabel(mode)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-item">
                    <span className="settings-label">{t('settings.postFlashAction')}</span>
                    <select
                      value={settings.postFlashAction}
                      onChange={(e) =>
                        handleChange('postFlashAction', e.target.value as PostFlashAction)
                      }
                    >
                      {POST_FLASH_ACTION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-item">
                    <span className="settings-label">{t('settings.verifyDownload')}</span>
                    <input
                      type="checkbox"
                      checked={settings.verifyDownload}
                      onChange={(e) => handleChange('verifyDownload', e.target.checked)}
                    />
                  </label>
                  <label className="settings-item">
                    <span className="settings-label">{t('settings.rememberLastImage')}</span>
                    <input
                      type="checkbox"
                      checked={settings.rememberLastImage}
                      onChange={(e) => handleChange('rememberLastImage', e.target.checked)}
                    />
                  </label>
                </div>
                */}

                <div className="settings-section">
                  <h3>{t('settings.deviceSettings')}</h3>
                  <label className="settings-item">
                    <span className="settings-label">{t('settings.autoScanDevices')}</span>
                    <input
                      type="checkbox"
                      checked={settings.autoScanDevices}
                      onChange={(e) => handleChange('autoScanDevices', e.target.checked)}
                    />
                  </label>
                  <label className="settings-item">
                    <span className="settings-label">{t('settings.usbBackend')}</span>
                    <select
                      value={settings.usbBackend}
                      onChange={(e) => handleChange('usbBackend', e.target.value as UsbBackend)}
                    >
                      {isWindows && <option value="winusb">{t('usbBackend.winusb')}</option>}
                      <option value="libusb">{t('usbBackend.libusb')}</option>
                    </select>
                  </label>
                </div>

                <div className="settings-section">
                  <h3>{t('settings.ai.title')}</h3>
                  <div className="settings-item settings-item-vertical">
                    <span className="settings-label">{t('settings.ai.providerLabel')}</span>
                    <select
                      value={getAiProvider()}
                      onChange={(e) => handleAiProvider(e.target.value)}
                    >
                      {AI_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                      <option value="custom">
                        {t('settings.ai.providerCustom')}
                      </option>
                    </select>
                  </div>
                  <div className="settings-item settings-item-vertical">
                    <span className="settings-label">{t('settings.ai.apiUrl')}</span>
                    <input
                      type="text"
                      value={settings.ai.apiUrl}
                      onChange={(e) => handleAiChange('apiUrl', e.target.value)}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div className="settings-item settings-item-vertical">
                    <span className="settings-label">{t('settings.ai.apiKey')}</span>
                    <input
                      type="password"
                      value={settings.ai.apiKey}
                      onChange={(e) => handleAiChange('apiKey', e.target.value)}
                      placeholder="sk-..."
                      autoComplete="off"
                    />
                  </div>
                  <div className="settings-item settings-item-vertical">
                    <span className="settings-label">{t('settings.ai.model')}</span>
                    {commonModels.length > 0 && (
                      <select
                        value={modelSelectValue}
                        onChange={(e) => handleModelSelect(e.target.value)}
                      >
                        {commonModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                        <option value="__custom__">
                          {t('settings.ai.modelCustom', '自定义...')}
                        </option>
                      </select>
                    )}
                    {showCustomInput && (
                      <input
                        type="text"
                        className="settings-ai-model-input"
                        value={settings.ai.model}
                        onChange={(e) => handleAiChange('model', e.target.value)}
                        placeholder="gpt-4o-mini"
                      />
                    )}
                  </div>
                  <div className="settings-item">
                    <span className="settings-label" style={{ opacity: 0.6, fontSize: 11 }}>
                      {t('settings.ai.hint')}
                    </span>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>{t('settings.update.title')}</h3>
                  <div className="settings-item settings-update-item">
                    <span className="settings-label">
                      {t('settings.currentVersion')}: v{packageJson.version}
                    </span>
                    <button
                      className="settings-btn settings-btn-secondary"
                      onClick={handleCheckUpdate}
                      disabled={checkingUpdate}
                    >
                      {checkingUpdate ? t('settings.update.checking') : t('settings.update.check')}
                    </button>
                  </div>
                  {updateInfo && (
                    <div className="settings-update-info">
                      {updateInfo.error ? (
                        <div className="settings-update-latest">
                          <span>{t('settings.update.error')}</span>
                        </div>
                      ) : updateInfo.available ? (
                        <>
                          <div className="settings-update-available">
                            <span>
                              {t('settings.update.available', { version: updateInfo.version })}
                            </span>
                          </div>
                          {updateInfo.downloading && (
                            <div className="settings-update-progress">
                              <div className="settings-progress-bar">
                                <div
                                  className="settings-progress-fill"
                                  style={{ width: `${updateInfo.progress || 0}%` }}
                                />
                              </div>
                              <div className="settings-progress-text">
                                <span>{updateInfo.progress}%</span>
                                {updateInfo.contentLength && updateInfo.contentLength > 0 && (
                                  <span>
                                    {formatSize(updateInfo.downloaded || 0)} /{' '}
                                    {formatSize(updateInfo.contentLength)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          <button
                            className="settings-btn settings-btn-primary settings-update-btn"
                            onClick={handleDownloadUpdate}
                            disabled={updateInfo.downloading}
                          >
                            {updateInfo.downloading
                              ? t('settings.update.downloading')
                              : t('settings.update.download')}
                          </button>
                        </>
                      ) : (
                        <div className="settings-update-latest">
                          <span>{t('settings.update.latest')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="settings-section">
                  <h3>{t('settings.developer.title')}</h3>
                  <div className="settings-item">
                    <span className="settings-label">{t('settings.developer.devtools')}</span>
                    <button
                      className="settings-btn settings-btn-secondary"
                      onClick={() => invokeCommand('open_devtools')}
                    >
                      {t('settings.developer.openDevtools')}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>{t('settings.about.title')}</h3>
                  <div className="settings-item settings-about-item">
                    <span className="settings-label">{t('settings.about.company')}</span>
                    <span className="settings-about-value">
                      {t('settings.about.companyName')}
                    </span>
                  </div>
                  <div className="settings-item settings-about-item">
                    <span className="settings-label">{t('settings.about.website')}</span>
                    <a
                      className="settings-about-link"
                      href="https://www.100ask.net/"
                      onClick={(e) => {
                        e.preventDefault();
                        openUrl('https://www.100ask.net/').catch((err) =>
                          console.error('Failed to open URL:', err)
                        );
                      }}
                    >
                      https://www.100ask.net/
                    </a>
                  </div>
                </div>
              </div>

              <div className="settings-footer">
                <motion.button
                  className="settings-btn settings-btn-secondary"
                  onClick={handleClose}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.1 }}
                >
                  {t('settings.cancel')}
                </motion.button>
                <motion.button
                  className="settings-btn settings-btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                  whileHover={{ scale: saving ? 1 : 1.02 }}
                  whileTap={{ scale: saving ? 1 : 0.98 }}
                  transition={{ duration: 0.1 }}
                >
                  {saving ? t('settings.saving') : t('settings.save')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ThemeViewer visible={themeViewerVisible} onClose={() => setThemeViewerVisible(false)} />
    </>
  );
};

export default Settings;
