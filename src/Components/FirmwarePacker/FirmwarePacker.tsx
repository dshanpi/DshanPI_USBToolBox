/**
 * Firmware Packer component for converting firmware formats.
 *
 * This component provides tools to convert firmware images between
 * different storage formats:
 * - SPI NOR converter: Convert generic firmware to SPI NOR format
 * - Block device converters: Convert for SD card, eMMC, SD NAND, UFS
 *
 * Users select a tool from the sidebar and configure conversion options
 * in the main panel, with operation logs displayed at the bottom.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolId, ToolInfo } from './Types';
import { useLogger } from './Hooks';
import { formatTime } from './Utils';
import { SPINorConverter, BlockDeviceConverter } from './Components';
import { flashManager } from '../../FlashManager';
import './FirmwarePacker.css';

/**
 * Available conversion tools with their configurations.
 * Each tool has a unique ID and optional default flash type.
 */
const tools: ToolInfo[] = [
  { id: 'spinor_converter' },
  { id: 'sdcard_converter', defaultFlashType: 'sdcard' },
  { id: 'emmc_converter', defaultFlashType: 'emmc' },
  { id: 'sdnand_converter', defaultFlashType: 'sdnand' },
  { id: 'ufs_converter', defaultFlashType: 'ufs' },
];

/**
 * Firmware Packer component for firmware format conversion.
 *
 * Provides a split-panel interface with:
 * - Sidebar: Tool selection list
 * - Main panel: Selected tool configuration and operation logs
 *
 * @returns The FirmwarePacker component
 */
export const FirmwarePacker: React.FC = () => {
  const { t } = useTranslation();

  /**
   * Currently selected conversion tool.
   */
  const [selectedTool, setSelectedTool] = useState<ToolId>('spinor_converter');

  /**
   * Whether a conversion operation is currently in progress.
   */
  const [isWorking, setIsWorking] = useState(false);

  /**
   * Logger for displaying operation messages.
   */
  const { logs, addLog, clearLogs, logContainerRef } = useLogger();

  /**
   * Effect: Subscribe to flash manager working state changes.
   * Updates isWorking state and initializes from current state.
   */
  useEffect(() => {
    const unsubWorkingChange = flashManager.onWorkingChange((working) => {
      setIsWorking(working);
    });

    setIsWorking(flashManager.getIsFlashing());

    return () => {
      unsubWorkingChange();
    };
  }, []);

  /**
   * Handler for tool selection.
   * Clears logs when switching tools, disabled while working.
   * @param toolId - ID of the tool to select
   */
  const handleToolSelect = useCallback(
    (toolId: ToolId) => {
      if (isWorking) return;
      setSelectedTool(toolId);
      clearLogs();
    },
    [clearLogs, isWorking]
  );

  /**
   * Renders the currently selected tool component.
   * @returns The appropriate converter component for the selected tool
   */
  const renderTool = () => {
    const tool = tools.find((t) => t.id === selectedTool);
    switch (selectedTool) {
      case 'spinor_converter':
        return <SPINorConverter addLog={addLog} />;
      case 'emmc_converter':
      case 'sdnand_converter':
      case 'sdcard_converter':
      case 'ufs_converter':
        return <BlockDeviceConverter addLog={addLog} defaultFlashType={tool?.defaultFlashType} />;
      default:
        return (
          <div className="fw-packer-empty">{t('firmwarePacker.selectTool', '请选择工具')}</div>
        );
    }
  };

  return (
    <div className="fw-packer">
      {/* Sidebar with tool selection */}
      <div className="fw-packer-sidebar">
        <div className="fw-packer-section">
          <div className="fw-packer-section-header">{t('firmwarePacker.tools', '工具')}</div>
          <div className="fw-packer-tool-list">
            {tools.map((tool) => {
              const isSelected = selectedTool === tool.id;
              const isDisabled = isWorking && !isSelected;
              return (
                <div
                  key={tool.id}
                  className={`fw-packer-tool-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'fw-packer-tool-item--disabled' : ''}`}
                  onClick={() => !isDisabled && handleToolSelect(tool.id)}
                >
                  <div className="fw-packer-tool-name">
                    {t(`firmwarePacker.toolsList.${tool.id}.name`)}
                  </div>
                  <div className="fw-packer-tool-desc">
                    {t(`firmwarePacker.toolsList.${tool.id}.desc`)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main panel with tool content and logs */}
      <div className="fw-packer-main">
        <div className="fw-packer-content">{renderTool()}</div>

        {/* Operation log display */}
        <div className="fw-packer-log-container">
          <div className="fw-packer-section-header">{t('firmwarePacker.log.title', '日志')}</div>
          <div className="fw-packer-log" ref={logContainerRef}>
            {logs.length === 0 ? (
              <div className="fw-packer-empty">{t('firmwarePacker.log.noLog', '暂无日志')}</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={`fw-packer-log-entry log-${log.level.toLowerCase()}`}>
                  <span className="fw-packer-log-time">[{formatTime(log.time)}]</span>
                  <span className="fw-packer-log-level">[{log.level}]</span>
                  <span className="fw-packer-log-msg">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirmwarePacker;