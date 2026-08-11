import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPaintBrush,
  faFont,
  faImage,
  faFilm,
  faPencil,
  faRotateRight,
  faFlask,
} from '@fortawesome/free-solid-svg-icons';
import { TextTab } from './tabs/TextTab';
import { ImageTab } from './tabs/ImageTab';
import { VideoTab } from './tabs/VideoTab';
import { DrawTab } from './tabs/DrawTab';
import { TestTab } from './tabs/TestTab';
import {
  getContentCanvasSize,
  type ContentRegion,
  type DisplayRotation,
  type TabContext,
  type ScreenDisplayType,
} from './tabs/common';

export type ContentTab = 'text' | 'image' | 'video' | 'draw' | 'test';

interface MiddlePanelProps extends TabContext {
  activeTab: ContentTab;
  onTabChange: (t: ContentTab) => void;
  /** 当前显示类型：决定局部刷新是否可用。 */
  displayType: ScreenDisplayType;
  /** 推送范围：full=整屏，partial=只推内容外接矩形 */
  refreshMode: 'full' | 'partial';
  onRefreshModeChange: (m: 'full' | 'partial') => void;
  /** 当前内容标签独立保存的顺时针旋转角度。 */
  rotation: DisplayRotation;
  onRotationChange: (rotation: DisplayRotation) => void;
  refreshRegionMode: 'auto' | 'manual';
  onRefreshRegionModeChange: (mode: 'auto' | 'manual') => void;
  manualRefreshRegion: ContentRegion;
  onManualRefreshRegionChange: (region: ContentRegion) => void;
  columnOffset: number;
  rowOffset: number;
}

const TABS: Array<{ key: ContentTab; label: string; icon: typeof faFont }> = [
  { key: 'text', label: '文本', icon: faFont },
  { key: 'image', label: '图片', icon: faImage },
  { key: 'video', label: '视频', icon: faFilm },
  { key: 'draw', label: '绘制', icon: faPencil },
  { key: 'test', label: '测试', icon: faFlask },
];

/**
 * 中间面板：胶囊式 Tab 切换 + 5 个 Tab 内容（文本 / 图片 / 视频 / 绘制 / 测试）。
 */
export const MiddlePanel: React.FC<MiddlePanelProps> = ({
  activeTab,
  onTabChange,
  width,
  height,
  onSend,
  onPreview,
  busy,
  displayType,
  refreshMode,
  onRefreshModeChange,
  onClearDisplay,
  rotation,
  onRotationChange,
  refreshRegionMode,
  onRefreshRegionModeChange,
  manualRefreshRegion,
  onManualRefreshRegionChange,
  columnOffset,
  rowOffset,
  initialCanvas,
  onInitialCanvasConsumed,
}) => {
  const supportsPartialRefresh = displayType === 'rgb565';
  const effectiveRefreshMode = supportsPartialRefresh ? refreshMode : 'full';
  const contentSize = getContentCanvasSize(width, height, rotation);
  const tabCtx: TabContext = {
    width: contentSize.width,
    height: contentSize.height,
    onSend,
    onPreview,
    onClearDisplay,
    busy,
    displayType,
    initialCanvas,
    onInitialCanvasConsumed,
  };

  return (
    <div className="sdt-panel">
      <div className="sdt-section-title sdt-content-title">
        <FontAwesomeIcon icon={faPaintBrush} />
        <span>显示内容</span>
        <div className="sdt-content-tools">
          <label className="sdt-rotation-control" title="当前内容顺时针旋转后预览并发送">
            <FontAwesomeIcon icon={faRotateRight} />
            <span>旋转</span>
            <select
              className="sdt-select"
              value={rotation}
              onChange={(event) => onRotationChange(Number(event.target.value) as DisplayRotation)}
              disabled={busy}
              aria-label="内容旋转角度"
            >
              <option value={0}>0°</option>
              <option value={90}>90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
          </label>
          <div className="sdt-refresh-toggle" aria-label="内容刷新范围">
            <button
              className={`sdt-refresh-btn ${effectiveRefreshMode === 'partial' ? 'active' : ''}`}
              onClick={() => onRefreshModeChange('partial')}
              disabled={!supportsPartialRefresh}
              title={
                supportsPartialRefresh
                  ? '只推内容所在的小矩形（快，几KB）'
                  : '局部刷新仅适用于 RGB565 彩屏；当前单色屏固定全屏刷新'
              }
            >
              局部刷新
            </button>
            <button
              className={`sdt-refresh-btn ${effectiveRefreshMode === 'full' ? 'active' : ''}`}
              onClick={() => onRefreshModeChange('full')}
              title={
                supportsPartialRefresh
                  ? '推送整个屏幕；大分辨率彩屏耗时较长'
                  : '单色屏每次发送完整 page 显存'
              }
            >
              全屏刷新
            </button>
          </div>
        </div>
      </div>

      {supportsPartialRefresh && effectiveRefreshMode === 'partial' && (
        <div className="sdt-region-editor">
          <div className="sdt-region-mode">
            <span>刷新区域</span>
            <button
              className={`sdt-refresh-btn ${refreshRegionMode === 'auto' ? 'active' : ''}`}
              onClick={() => onRefreshRegionModeChange('auto')}
            >
              自动识别
            </button>
            <button
              className={`sdt-refresh-btn ${refreshRegionMode === 'manual' ? 'active' : ''}`}
              onClick={() => onRefreshRegionModeChange('manual')}
            >
              手动区域
            </button>
          </div>
          {refreshRegionMode === 'manual' && (
            <>
              {(['x', 'y', 'w', 'h'] as const).map((key) => (
                <label key={key}>
                  {key.toUpperCase()}
                  <input
                    className="sdt-input mono"
                    type="number"
                    min={key === 'w' || key === 'h' ? 1 : 0}
                    max={key === 'x' || key === 'w' ? width : height}
                    value={manualRefreshRegion[key]}
                    onChange={(event) =>
                      onManualRefreshRegionChange({
                        ...manualRefreshRegion,
                        [key]: Number(event.target.value) || 0,
                      })
                    }
                  />
                </label>
              ))}
              <span className="sdt-region-address mono">
                CASET {manualRefreshRegion.x + columnOffset}–
                {manualRefreshRegion.x + columnOffset + manualRefreshRegion.w - 1} · RASET{' '}
                {manualRefreshRegion.y + rowOffset}–
                {manualRefreshRegion.y + rowOffset + manualRefreshRegion.h - 1}
              </span>
            </>
          )}
        </div>
      )}

      <div className="sdt-tab-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`sdt-tab-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => onTabChange(t.key)}
          >
            <FontAwesomeIcon icon={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      <div className="sdt-tab-content">
        {/* 用 conditional render 而不是 display:none —— 切走的 Tab 卸载，
            避免视频 Tab 后台继续占内存 */}
        {activeTab === 'text' && <TextTab {...tabCtx} />}
        {activeTab === 'image' && <ImageTab {...tabCtx} />}
        {activeTab === 'video' && <VideoTab {...tabCtx} />}
        {activeTab === 'draw' && <DrawTab {...tabCtx} />}
        {activeTab === 'test' && <TestTab {...tabCtx} />}
      </div>
    </div>
  );
};
