import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMicrochip,
  faBolt,
  faPowerOff,
  faPlus,
  faFileImport,
  faFileExport,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import type { DisplayCommandRow, DisplayCommandType } from '../hooks/useSpiEngine';

/** SPI 速度下拉选项 —— 与 SPIMasterTab 中的 SPEED_OPTIONS 一致。 */
const SPI_SPEED_OPTIONS = [
  { label: '468.75 KHz', value: '0.46875' },
  { label: '937.5 KHz', value: '0.9375' },
  { label: '1.875 MHz', value: '1.875' },
  { label: '3.75 MHz', value: '3.75' },
  { label: '7.5 MHz', value: '7.5' },
  { label: '15 MHz', value: '15' },
  { label: '30 MHz', value: '30' },
  { label: '60 MHz', value: '60' },
];

/** 左侧"SPI 配置 & 初始化序列"面板 props。 */
export interface LeftPanelProps {
  // 设备连接由侧边栏 DeviceConnectButton 统一管理，这里只接收 online 状态用于禁用控件
  online: boolean;

  // SPI 参数（补全 CS/Bits/BitOrder，参考 SPI Tool 的配置面板）
  frequencyHz: number;
  onFrequencyChange: (hz: number) => void;
  spiSpeed: string; // 下拉用（"0.46875", "3.75", "15" …）
  onSpiSpeedChange: (s: string) => void;
  spiMode: number;
  onSpiModeChange: (mode: number) => void;
  spiBits: string;
  onSpiBitsChange: (b: string) => void;
  spiBitOrder: string;
  onSpiBitOrderChange: (o: string) => void;
  onInitSpi: () => void; // Init SPI 按钮（参考 SPI Tool 最右侧）

  // 分辨率：已移到 RightPanel（LCD 预览旁边）—— 这里只保留 width/height 数值给屏幕预设
  // 加载时同步画布尺寸用（applyScreenPreset 会改 width/height）。
  // resolutionPresets / onResolutionPresetChange 不再需要传给 LeftPanel
  width: number;
  height: number;

  // 命令表
  rows: DisplayCommandRow[];
  onRowsChange: (rows: DisplayCommandRow[]) => void;

  // 屏幕预设系统（内置 + 用户保存，类型在父组件 SPIDisplayTool 定义）
  builtinScreenPresets: Array<{ key: string; name: string }>;
  userScreenPresets: Array<{ name: string }>;
  selectedScreenPreset: string;
  onSelectedScreenPresetChange: (key: string) => void;
  /** 加载选中的预设到命令表 */
  onApplyScreenPreset: (key: string) => void;
  /** 把当前命令表另存为新预设 */
  onSaveAsScreenPreset: () => void;
  /** 删除当前选中的用户预设（内置不可删） */
  onDeleteScreenPreset: () => void;

  // 自定义弹窗（来自父组件的 useModalDialog）—— 避免浏览器原生 prompt/alert 显示 "localhost:3030"
  showPrompt: (title: string, defaultValue?: string, message?: string) => Promise<string | null>;
  showConfirm: (
    title: string,
    message?: string,
    opts?: { okText?: string; okDanger?: boolean }
  ) => Promise<boolean>;
  showAlert: (title: string, message?: string) => Promise<void>;

  // 操作
  onSendInit: () => void;
  onReset: () => void;
  busy: boolean;
}

/**
 * 左侧面板：硬件配置卡片 + 初始化命令表 + 操作按钮组。
 */
export const LeftPanel: React.FC<LeftPanelProps> = (p) => {
  // 命令表行 ID 自增计数器（通过 max+1 保证唯一）
  const nextRowId = (): number => (p.rows.length ? Math.max(...p.rows.map((r) => r.id)) + 1 : 1);

  const addRow = () => p.onRowsChange([...p.rows, { id: nextRowId(), type: 'cmd', data: '' }]);
  const deleteRow = (id: number) => p.onRowsChange(p.rows.filter((r) => r.id !== id));
  /**
   * 更新一行字段。切换 type 时清空 data，避免上一种类型的值残留：
   * 例如 DC/RST 选了 HIGH 后切回 cmd，data 里会残留 "HIGH" 字符串显示在输入框中。
   * DC/RST 切换时重置为 LOW（与下拉默认显示一致）。
   */
  const updateRow = (id: number, field: 'type' | 'data', val: string) =>
    p.onRowsChange(
      p.rows.map((r) => {
        if (r.id !== id) return r;
        if (field !== 'type') return { ...r, data: val };
        // 切换类型时，按新类型给 data 合理默认值
        const newData = val === 'cs' || val === 'dc' || val === 'rst' || val === 'bl' ? 'LOW' : '';
        return { ...r, type: val as DisplayCommandType, data: newData };
      })
    );

  /**
   * "导入"按钮 — 从用户粘贴的 JSON 字符串导入命令表。
   * 使用父组件提供的 showPrompt / showAlert（自定义弹窗），避免显示 "localhost:3030"。
   */
  const handleImport = async () => {
    const txt = await p.showPrompt(
      '导入命令表',
      '',
      '粘贴 JSON 数组，例如：\n[{"type":"cmd","data":"AE"},{"type":"delay","data":"20000"}]'
    );
    if (!txt) return;
    try {
      const parsed = JSON.parse(txt);
      if (!Array.isArray(parsed)) throw new Error('JSON 必须是数组');
      const rows: DisplayCommandRow[] = parsed.map((it: unknown, i: number) => {
        const row = it as { type?: string; data?: string };
        return {
          id: i + 1,
          type: (['cmd', 'data', 'delay', 'cs', 'dc', 'rst', 'bl', 'fill'].includes(row.type ?? '')
            ? row.type
            : 'cmd') as DisplayCommandType,
          data: String(row.data ?? ''),
        };
      });
      p.onRowsChange(rows);
    } catch (e) {
      await p.showAlert('导入失败', (e as Error).message);
    }
  };

  /**
   * "导出"按钮 —— 把当前命令表保存为 txt 文件。
   * 弹出 Tauri 原生文件保存对话框（脱离浏览器限制），选定路径后写入。
   * 格式：每行一条命令，type 和 data 用空格分隔，方便人工阅读和后续导入。
   */
  const handleExport = async () => {
    if (!p.rows.length) return;
    const lines = p.rows.map((r) => `${r.type} ${r.data}`);
    const content = lines.join('\n');
    try {
      const filePath = await save({
        defaultPath: 'init-commands.txt',
        filters: [{ name: '文本文件', extensions: ['txt'] }],
      });
      if (!filePath) return; // 用户取消了
      await writeTextFile(filePath, content);
    } catch (e) {
      await p.showAlert('导出失败', (e as Error).message);
    }
  };

  return (
    <div className="sdt-panel">
      <div className="sdt-section-title">
        <FontAwesomeIcon icon={faMicrochip} />
        <span>SPI 配置 &amp; 初始化序列</span>
      </div>

      {/* 卡片 1：硬件参数 -- SPI 参数 + Init SPI 按钮
          按用户要求去掉了"硬件参数"小标题，内容直接顶到卡片顶部
          设备连接已移到侧边栏 DeviceConnectButton，这里只保留 SPI 参数：
            行 1：Mode / Speed（下拉，与 SPI Tool 一致 8 档预设）
            行 2：CS / Bits / BitOrder
            行 3：Init SPI（修改完参数立刻按下，让新参数下发到 CH347） */}
      <div className="sdt-card">
        {/* SPI 参数（紧凑 grid 布局）—— Mode/Speed/CS/Bits/BitOrder 5 项 + Init SPI */}
        <div className="sdt-spi-grid">
          <div className="sdt-spi-field">
            <label>Mode</label>
            <select
              className="sdt-select"
              value={p.spiMode}
              onChange={(e) => p.onSpiModeChange(parseInt(e.target.value))}
            >
              <option value={0}>Mode 0</option>
              <option value={1}>Mode 1</option>
              <option value={2}>Mode 2</option>
              <option value={3}>Mode 3</option>
            </select>
          </div>
          <div className="sdt-spi-field">
            <label>Speed</label>
            <select
              className="sdt-select"
              value={p.spiSpeed}
              onChange={(e) => {
                p.onSpiSpeedChange(e.target.value);
                // 同步 frequencyHz —— 后端 useSpiEngine 用 frequencyHz；选下拉时把 MHz 换算成 Hz
                const mhz = parseFloat(e.target.value);
                if (!isNaN(mhz)) p.onFrequencyChange(Math.round(mhz * 1_000_000));
              }}
            >
              {SPI_SPEED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sdt-spi-field">
            <label>CS</label>
            <select className="sdt-select" defaultValue="0" aria-label="CS0">
              <option value="0">CS0</option>
            </select>
          </div>
          <div className="sdt-spi-field">
            <label>Bits</label>
            <select
              className="sdt-select"
              value={p.spiBits}
              onChange={(e) => p.onSpiBitsChange(e.target.value)}
            >
              <option value="8">8-bit</option>
              <option value="16">16-bit</option>
            </select>
          </div>
          <div className="sdt-spi-field">
            <label>BitOrder</label>
            <select
              className="sdt-select"
              value={p.spiBitOrder}
              onChange={(e) => p.onSpiBitOrderChange(e.target.value)}
            >
              <option value="1">MSB</option>
              <option value="0">LSB</option>
            </select>
          </div>
          <div className="sdt-spi-field">
            <label>&nbsp;</label>
            <button
              className="sdt-btn primary"
              onClick={p.onInitSpi}
              disabled={!p.online || p.busy}
              title="把上述 SPI 参数下发到 CH347（改完配置后必按）"
            >
              设置
            </button>
          </div>
        </div>

        {/* 分辨率控件已移到 RightPanel（LCD 预览正下方），不再放在硬件参数卡片里 */}
      </div>

      {/* 屏幕预设选择栏：内置预设 + 用户预设 + Load / 另存为 / 导入 / 删除。
          位置放在初始化命令表卡片上方，逻辑与 SPI Tool 的预设系统一致。
          "导入"按钮从命令表卡片标题移到这里 —— 与预设功能并列，UI 更整洁 */}
      <div className="sdt-preset-bar">
        <span className="sdt-preset-bar-label">屏幕预设</span>
        <select
          className="sdt-preset-bar-select"
          value={p.selectedScreenPreset}
          onChange={(e) => p.onSelectedScreenPresetChange(e.target.value)}
        >
          <optgroup label="内置预设">
            {p.builtinScreenPresets.map((bp) => (
              <option key={bp.key} value={bp.key}>
                {bp.name}
              </option>
            ))}
          </optgroup>
          {p.userScreenPresets.length > 0 && (
            <optgroup label="自定义预设">
              {p.userScreenPresets.map((up) => (
                <option key={`user:${up.name}`} value={`user:${up.name}`}>
                  {up.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          className="sdt-preset-bar-btn primary"
          onClick={() => p.onApplyScreenPreset(p.selectedScreenPreset)}
          disabled={!p.selectedScreenPreset}
        >
          Load
        </button>
        <button
          className="sdt-preset-bar-btn"
          onClick={p.onSaveAsScreenPreset}
          disabled={!p.rows.length}
          title="把当前命令表保存为屏幕预设"
        >
          另存为
        </button>
        <button
          className="sdt-preset-bar-btn"
          onClick={handleImport}
          title="从 JSON 字符串导入命令表"
        >
          <FontAwesomeIcon icon={faFileImport} /> 导入
        </button>
        <button
          className="sdt-preset-bar-btn"
          onClick={handleExport}
          disabled={!p.rows.length}
          title="导出命令表到 txt 文件"
        >
          <FontAwesomeIcon icon={faFileExport} /> 导出
        </button>
        {p.selectedScreenPreset.startsWith('user:') && (
          <button
            className="sdt-preset-bar-btn danger"
            onClick={p.onDeleteScreenPreset}
            title="删除当前选中的自定义预设"
          >
            删除
          </button>
        )}
      </div>

      {/* 卡片 2：初始化命令表 —— 去掉"初始化命令表 (N)"标题文本以节省垂直空间。
          原来标题栏里的"导入"和"添加"按钮：
            - 导入 → 移到屏幕预设栏
            - 添加 → 移到表格下方（更自然 —— 看完已有的命令再加新的） */}
      <div className="sdt-card flex-grow">
        <div className="sdt-cmd-table-wrap">
          <table className="sdt-cmd-table">
            {/* 固定非数据列宽，避免长 Hex 内容把“类型”下拉框压缩到只剩一个字符。 */}
            <colgroup>
              <col className="row-num" />
              <col className="col-type" />
              <col className="col-data" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="row-num">#</th>
                <th className="col-type">类型</th>
                <th className="col-data">参数（Hex / µs / 电平）</th>
                <th className="col-actions">
                  {/* 清空所有命令行 —— 二次确认避免误操作 */}
                  <button
                    className="del-btn"
                    disabled={!p.rows.length}
                    onClick={async () => {
                      if (!p.rows.length) return;
                      if (
                        !(await p.showConfirm(
                          '清空命令表',
                          `确定清空全部 ${p.rows.length} 行？此操作无法撤销。`,
                          { okText: '清空', okDanger: true }
                        ))
                      )
                        return;
                      p.onRowsChange([]);
                    }}
                    title="清空所有命令行"
                  >
                    清空
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((row, idx) => (
                <tr key={row.id}>
                  <td className="row-num">{idx + 1}</td>
                  <td className="col-type">
                    <select
                      className="sdt-select"
                      value={row.type}
                      onChange={(e) => updateRow(row.id, 'type', e.target.value)}
                    >
                      <option value="cmd">命令</option>
                      <option value="data">数据</option>
                      <option value="delay">延时</option>
                      <option value="cs">CS</option>
                      <option value="dc">DC</option>
                      <option value="rst">RST</option>
                      <option value="bl">背光</option>
                      <option value="fill">填色</option>
                    </select>
                  </td>
                  <td>
                    {row.type === 'cs' ||
                    row.type === 'dc' ||
                    row.type === 'rst' ||
                    row.type === 'bl' ? (
                      // CS/DC/RST/BL 行：下拉选电平（HIGH / LOW），避免输错。
                      // 空串/非法值统一显示为 LOW，与 useSpiEngine 的字符串容错一致
                      <select
                        className="sdt-select"
                        value={String(row.data).toUpperCase() === 'HIGH' ? 'HIGH' : 'LOW'}
                        onChange={(e) => updateRow(row.id, 'data', e.target.value)}
                      >
                        <option value="LOW">LOW</option>
                        <option value="HIGH">HIGH</option>
                      </select>
                    ) : (
                      <input
                        className="sdt-input mono"
                        type="text"
                        value={row.data}
                        onChange={(e) => updateRow(row.id, 'data', e.target.value)}
                        placeholder={
                          row.type === 'delay'
                            ? '20000'
                            : row.type === 'fill'
                              ? 'F8 00 153600'
                              : '0xAE'
                        }
                      />
                    )}
                  </td>
                  <td className="col-actions">
                    <button className="del-btn" onClick={() => deleteRow(row.id)} title="删除">
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </td>
                </tr>
              ))}
              {p.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="sdt-cmd-empty">
                    暂无命令，点击下方「+ 添加」或顶部「导入」
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* 添加按钮放在表格底部 —— 与每行的"删除"操作呼应，符合"先看列表再扩展"的习惯 */}
        <button className="sdt-add-row-btn" onClick={addRow} title="添加一行命令">
          <FontAwesomeIcon icon={faPlus} /> 添加
        </button>
      </div>

      {/* 卡片 3：操作按钮组 —— 连接/断开已移到顶部硬件参数行，这里只剩"发送初始化"和"复位"。
          这两个按钮针对当前命令表 (initialization sequence) 操作，与连接/断开是两类不同动作 */}
      <div className="sdt-action-row">
        <button
          className="sdt-btn success"
          onClick={p.onSendInit}
          disabled={!p.online || p.busy || p.rows.length === 0}
        >
          <FontAwesomeIcon icon={faBolt} /> 发送初始化
        </button>
        <button className="sdt-btn danger" onClick={p.onReset} disabled={!p.online || p.busy}>
          <FontAwesomeIcon icon={faPowerOff} /> 复位
        </button>
      </div>
    </div>
  );
};
