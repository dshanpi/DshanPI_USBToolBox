import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { config as fontAwesomeConfig } from '@fortawesome/fontawesome-svg-core';
import { Layout, ToolItem, UserProfileDialog } from './CoreUI';
import { SerialToolPage } from './Components/SerialTool';
import { I2CToolPage } from './Components/I2CTool';
import { SPIToolPage } from './Components/SPITool';
import { SPIDisplayToolPage } from './Components/SPIDisplayTool';
import { GPIOToolPage } from './Components/GPIOTool';
import { ModbusToolPage } from './Components/ModbusTool';
import { PythonTestToolPage } from './Components/PythonTestTool';
import { AIAssistant, type AssistantToolId } from './Components/AIAssistant';
import { DriverSetupDialog } from './Components/DriverSetupDialog';
import { DeviceConnectButton } from './Components/SPITool';
import { Settings, AppSettings, loadSettings, saveSettings } from './Settings';
import { authService, driverService, AuthUserInfo } from './Services';
import { flashManager } from './FlashManager';
import { efexService } from './Services';
import { ThemeProvider, useTheme, ThemeMode } from './Themes';
import {
  faMicrochip,
  faPlug,
  faSitemap,
  faBolt,
  faDisplay,
  faFlask,
  faToggleOn,
} from '@fortawesome/free-solid-svg-icons';
import './i18n';
import '@fortawesome/fontawesome-svg-core/styles.css';
import './Themes/themes.css';
import i18n from './i18n';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Tauri's production CSP only permits styles bundled at build time. Font Awesome
// injects its base styles dynamically by default, which leaves icons unscaled in
// an installed build. Bundle the stylesheet above and disable runtime injection.
fontAwesomeConfig.autoAddCss = false;

/**
 * Shows the application window.
 *
 * Called after initialization to display the main window,
 * avoiding the white flash during React hydration.
 */
async function showAppWindow() {
  const appWindow = getCurrentWindow();
  appWindow.show();
}

/**
 * Main application content component.
 *
 * Renders the complete application UI including:
 * - Sidebar navigation with tool selection
 * - Multiple tool page panels (firmware flash, sector flash, etc.)
 * - Settings modal overlay
 *
 * Manages state for:
 * - Active tool selection
 * - Sidebar collapse state
 * - Working/flashing state (locks sidebar)
 * - Settings visibility
 */
const AppContent: React.FC = () => {
  const { t } = useTranslation();
  const { setThemeMode } = useTheme();
  const [activeTool, setActiveTool] = useState<AssistantToolId>('serial-tool');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [driverSetupVisible, setDriverSetupVisible] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  // 当前登录用户（null 表示未登录）。登录结果经 auth-login-result 事件回传。
  const [authUser, setAuthUser] = useState<AuthUserInfo | null>(null);
  // 用户信息弹窗是否显示（点击用户名按钮打开）。
  const [profileVisible, setProfileVisible] = useState(false);

  /**
   * Tool items configuration for sidebar.
   *
   * Defines all available tools with their IDs, names,
   * icons, and descriptions for sidebar navigation.
   */
  const tools: ToolItem[] = useMemo(
    () => [
      {
        id: 'serial-tool',
        name: t('tools.serialTool.name', 'Serial Tool'),
        icon: faPlug,
        description: t('tools.serialTool.description', 'Serial port debugging tool'),
      },
      {
        id: 'modbus-tool',
        name: t('tools.modbusTool.name', 'Modbus Tool'),
        icon: faSitemap,
        description: t('tools.modbusTool.description', 'Modbus RTU/TCP master & slave simulator'),
      },
      {
        id: 'i2c-tool',
        name: t('tools.i2cTool.name', 'I2C Tool'),
        icon: faMicrochip,
        description: t('tools.i2cTool.description', 'I2C bus analyzer & slave emulator'),
      },
      {
        id: 'spi-tool',
        name: t('tools.spiTool.name', 'SPI Tool'),
        icon: faBolt,
        description: t('tools.spiTool.description', 'SPI bus analyzer & slave emulator'),
      },
      {
        id: 'gpio-tool',
        name: t('tools.gpioTool.name', 'GPIO Tool'),
        icon: faToggleOn,
        description: t('tools.gpioTool.description', 'Read and control CH347 GPIO0-GPIO7 levels'),
      },
      {
        id: 'spi-display-tool',
        name: t('tools.spiDisplayTool.name', 'SPI Display Tool'),
        icon: faDisplay,
        description: t(
          'tools.spiDisplayTool.description',
          'SPI display (OLED/TFT) tester with TTF Chinese rendering'
        ),
      },
      {
        id: 'python-test-tool',
        name: t('tools.pythonTestTool.name', 'Python Test Tool'),
        icon: faFlask,
        description: t(
          'tools.pythonTestTool.description',
          'Expose buses over a local HTTP API for Python production testing'
        ),
      },
    ],
    [t]
  );

  // Load saved settings on mount
  useEffect(() => {
    loadSettings().then(async (loadedSettings) => {
      setSidebarCollapsed(loadedSettings.sidebarCollapsed);
      if (loadedSettings.language) {
        i18n.changeLanguage(loadedSettings.language);
      }
      if (loadedSettings.themeMode) {
        setThemeMode(loadedSettings.themeMode);
      }
      try {
        await efexService.setUsbBackend(loadedSettings.usbBackend);
      } catch (e) {
        console.error('Failed to set USB backend:', e);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show the corrected driver prompt once when either bundled package is
  // missing. A revision intentionally invalidates the marker written by the
  // previous implementation before its dialog was actually rendered. Delay
  // the check until after the first paint so startup remains interactive.
  useEffect(() => {
    const promptRevision = 2;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadSettings()
        .then(async (loadedSettings) => {
          if (loadedSettings.driverPromptRevision >= promptRevision) {
            return;
          }

          const status = await driverService.getStatus();
          if (cancelled || !status.supported || status.installed) {
            return;
          }

          setDriverSetupVisible(true);
          await saveSettings({ ...loadedSettings, driverPromptRevision: promptRevision });
        })
        .catch((error) => console.error('Failed to initialize the driver prompt:', error));
    }, 750);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Hide loading screen after React hydrates
  useEffect(() => {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
      setTimeout(() => {
        loadingScreen.remove();
      }, 500);
    }
  }, []);

  // Show window after initialization
  useEffect(() => {
    showAppWindow();
  }, []);

  // Disable find shortcut during operations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Track flash manager working state
  useEffect(() => {
    const unsubWorkingChange = flashManager.onWorkingChange((working) => {
      setIsWorking(working);
    });

    setIsWorking(flashManager.getIsFlashing());

    return () => {
      unsubWorkingChange();
    };
  }, []);

  // 订阅登录结果事件，并查询已有登录态（重启后从后端会话恢复）。
  useEffect(() => {
    let unreg: (() => void) | undefined;
    authService
      .onLoginResult((success, user, error) => {
        if (success && user) {
          setAuthUser(user);
        } else if (error) {
          console.error('登录失败:', error);
        }
      })
      .then((fn) => {
        unreg = fn;
      });
    // 恢复已有会话
    authService.getUser().then(setAuthUser);
    return () => {
      unreg?.();
    };
  }, []);

  /**
   * Handles settings changes from Settings modal.
   *
   * @param newSettings - Updated AppSettings
   */
  const handleSettingsChange = (newSettings: AppSettings) => {
    setSidebarCollapsed(newSettings.sidebarCollapsed);
  };

  /**
   * Handles tool selection from sidebar.
   *
   * @param toolId - Selected tool ID
   */
  const handleToolSelect = useCallback((toolId: string) => {
    setActiveTool(toolId as AssistantToolId);
  }, []);

  /**
   * Handles sidebar collapse toggle.
   */
  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  /**
   * Handles login button click.
   *
   * 未登录 → 启动 100ask.net OAuth2 登录（后端起本机回调服务并打开浏览器授权），
   *   登录结果经 auth-login-result 事件回传并更新 authUser；
   * 已登录 → 打开用户信息弹窗（在弹窗底部退出登录）。
   */
  const handleLoginClick = useCallback(() => {
    if (authUser) {
      setProfileVisible(true);
      return;
    }
    authService.login().catch((e) => {
      // 凭据未配置等错误在这里同步抛出，提示开发者填入真实凭据。
      console.error('启动登录失败:', e);
      alert(typeof e === 'string' ? e : ((e as { message?: string })?.message ?? '启动登录失败'));
    });
  }, [authUser]);

  /**
   * 退出登录：调用后端清空会话，更新本地状态并关闭用户信息弹窗。
   */
  const handleLogout = useCallback(() => {
    setProfileVisible(false);
    authService.logout().then(() => setAuthUser(null));
  }, []);

  /** Page fade animation variants */
  const pageVariants = {
    visible: { opacity: 1 },
    hidden: { opacity: 0 },
  };

  /** Page transition duration */
  const pageTransition = {
    duration: 0.15,
  };

  /**
   * Renders all tool panels.
   *
   * Uses visibility toggling with opacity animations for smooth
   * transitions between tools. All panels exist in DOM for state
   * preservation, but only active one is visible and interactive.
   */
  const renderAllTools = () => (
    <div className="tool-panels-container">
      <motion.div
        className="tool-panel"
        variants={pageVariants}
        animate={activeTool === 'serial-tool' ? 'visible' : 'hidden'}
        transition={pageTransition}
        style={{ pointerEvents: activeTool === 'serial-tool' ? 'auto' : 'none' }}
      >
        <SerialToolPage isActive={activeTool === 'serial-tool'} />
      </motion.div>
      <motion.div
        className="tool-panel"
        variants={pageVariants}
        animate={activeTool === 'i2c-tool' ? 'visible' : 'hidden'}
        transition={pageTransition}
        style={{ pointerEvents: activeTool === 'i2c-tool' ? 'auto' : 'none' }}
      >
        <I2CToolPage isActive={activeTool === 'i2c-tool'} />
      </motion.div>
      <motion.div
        className="tool-panel"
        variants={pageVariants}
        animate={activeTool === 'spi-tool' ? 'visible' : 'hidden'}
        transition={pageTransition}
        style={{ pointerEvents: activeTool === 'spi-tool' ? 'auto' : 'none' }}
      >
        <SPIToolPage isActive={activeTool === 'spi-tool'} />
      </motion.div>
      <motion.div
        className="tool-panel"
        variants={pageVariants}
        animate={activeTool === 'gpio-tool' ? 'visible' : 'hidden'}
        transition={pageTransition}
        style={{ pointerEvents: activeTool === 'gpio-tool' ? 'auto' : 'none' }}
      >
        <GPIOToolPage isActive={activeTool === 'gpio-tool'} />
      </motion.div>
      <motion.div
        className="tool-panel"
        variants={pageVariants}
        animate={activeTool === 'spi-display-tool' ? 'visible' : 'hidden'}
        transition={pageTransition}
        style={{ pointerEvents: activeTool === 'spi-display-tool' ? 'auto' : 'none' }}
      >
        <SPIDisplayToolPage isActive={activeTool === 'spi-display-tool'} />
      </motion.div>
      <motion.div
        className="tool-panel"
        variants={pageVariants}
        animate={activeTool === 'python-test-tool' ? 'visible' : 'hidden'}
        transition={pageTransition}
        style={{ pointerEvents: activeTool === 'python-test-tool' ? 'auto' : 'none' }}
      >
        <PythonTestToolPage isActive={activeTool === 'python-test-tool'} />
      </motion.div>
      <motion.div
        className="tool-panel"
        variants={pageVariants}
        animate={activeTool === 'modbus-tool' ? 'visible' : 'hidden'}
        transition={pageTransition}
        style={{ pointerEvents: activeTool === 'modbus-tool' ? 'auto' : 'none' }}
      >
        <ModbusToolPage isActive={activeTool === 'modbus-tool'} />
      </motion.div>
      {/* {activeTool === 'dram-tunning' && (
        <motion.div
          className="tool-panel active"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={pageTransition}
        >
          <DRAMTunningPage isActive={true} />
        </motion.div>
      )} */}
    </div>
  );

  return (
    <>
      <Layout
        tools={tools}
        activeTool={activeTool}
        onToolSelect={handleToolSelect}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={handleToggleSidebar}
        onSettingsClick={() => setSettingsVisible(true)}
        onLoginClick={handleLoginClick}
        authUserName={authUser?.name ?? null}
        sidebarLocked={isWorking}
        controlArea={<DeviceConnectButton />}
      >
        {renderAllTools()}
      </Layout>
      <Settings
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onSettingsChange={handleSettingsChange}
      />
      <DriverSetupDialog
        visible={driverSetupVisible}
        onClose={() => setDriverSetupVisible(false)}
      />
      <UserProfileDialog
        visible={profileVisible}
        user={authUser}
        onClose={() => setProfileVisible(false)}
        onLogout={handleLogout}
      />
      <AIAssistant
        activeTool={activeTool}
        toolName={tools.find((tool) => tool.id === activeTool)?.name ?? activeTool}
        onOpenSettings={() => setSettingsVisible(true)}
      />
    </>
  );
};

/**
 * Initial settings for ThemeProvider.
 *
 * Used to delay rendering until settings are loaded,
 * ensuring correct initial theme state.
 */
interface InitialSettings {
  /** Theme mode preference */
  themeMode: ThemeMode;
  /** Dark theme identifier */
  themeIdDark: string;
  /** Light theme identifier */
  themeIdLight: string;
}

/**
 * Root App component with settings loading.
 *
 * Loads settings before rendering to ensure correct theme
 * and language initialization. Returns null during loading
 * to prevent incorrect initial state.
 */
const App: React.FC = () => {
  const [initialSettings, setInitialSettings] = useState<InitialSettings | null>(null);

  useEffect(() => {
    loadSettings().then((settings) => {
      setInitialSettings({
        themeMode: settings.themeMode || 'dark',
        themeIdDark: settings.themeIdDark || 'catppuccin-mocha',
        themeIdLight: settings.themeIdLight || 'catppuccin-latte',
      });
      showAppWindow();
    });
  }, []);

  if (initialSettings === null) {
    return null;
  }

  return (
    <ThemeProvider
      initialMode={initialSettings.themeMode}
      initialThemeIdDark={initialSettings.themeIdDark}
      initialThemeIdLight={initialSettings.themeIdLight}
    >
      <AppContent />
    </ThemeProvider>
  );
};

/**
 * Application entry point.
 *
 * Renders the App component into the root element with
 * React.StrictMode for development checks.
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
