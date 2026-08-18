import React from 'react';
import { useTranslation } from 'react-i18next';
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

const TABS: Array<{ key: ContentTab; labelKey: string; icon: typeof faFont }> = [
  { key: 'text', labelKey: 'spiDisplay.tabs.text', icon: faFont },
  { key: 'image', labelKey: 'spiDisplay.tabs.image', icon: faImage },
  { key: 'video', labelKey: 'spiDisplay.tabs.video', icon: faFilm },
  { key: 'draw', labelKey: 'spiDisplay.tabs.draw', icon: faPencil },
  { key: 'test', labelKey: 'spiDisplay.tabs.test', icon: faFlask },
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
  const { t } = useTranslation();
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
        <span>{t('spiDisplay.middle.title')}</span>
        <div className="sdt-content-tools">
          <label className="sdt-rotation-control" title={t('spiDisplay.middle.rotationHint')}>
            <FontAwesomeIcon icon={faRotateRight} />
            <span>{t('spiDisplay.middle.rotation')}</span>
            <select
              className="sdt-select"
              value={rotation}
              onChange={(event) => onRotationChange(Number(event.target.value) as DisplayRotation)}
              disabled={busy}
              aria-label={t('spiDisplay.middle.rotationAngle')}
            >
              <option value={0}>0°</option>
              <option value={90}>90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
          </label>
          <div className="sdt-refresh-toggle" aria-label={t('spiDisplay.middle.refreshRange')}>
            <button
              className={`sdt-refresh-btn ${effectiveRefreshMode === 'partial' ? 'active' : ''}`}
              onClick={() => onRefreshModeChange('partial')}
              disabled={!supportsPartialRefresh}
              title={
                supportsPartialRefresh
                  ? t('spiDisplay.middle.partialHint')
                  : t('spiDisplay.middle.partialUnavailableHint')
              }
            >
              {t('spiDisplay.middle.partial')}
            </button>
            <button
              className={`sdt-refresh-btn ${effectiveRefreshMode === 'full' ? 'active' : ''}`}
              onClick={() => onRefreshModeChange('full')}
              title={
                supportsPartialRefresh
                  ? t('spiDisplay.middle.fullHint')
                  : t('spiDisplay.middle.monoFullHint')
              }
            >
              {t('spiDisplay.middle.full')}
            </button>
          </div>
        </div>
      </div>

      {supportsPartialRefresh && effectiveRefreshMode === 'partial' && (
        <div className="sdt-region-editor">
          <div className="sdt-region-mode">
            <span>{t('spiDisplay.middle.refreshRegion')}</span>
            <button
              className={`sdt-refresh-btn ${refreshRegionMode === 'auto' ? 'active' : ''}`}
              onClick={() => onRefreshRegionModeChange('auto')}
            >
              {t('spiDisplay.middle.autoRegion')}
            </button>
            <button
              className={`sdt-refresh-btn ${refreshRegionMode === 'manual' ? 'active' : ''}`}
              onClick={() => onRefreshRegionModeChange('manual')}
            >
              {t('spiDisplay.middle.manualRegion')}
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
                {t('spiDisplay.terms.caset')} {manualRefreshRegion.x + columnOffset}–
                {manualRefreshRegion.x + columnOffset + manualRefreshRegion.w - 1} ·{' '}
                {t('spiDisplay.terms.raset')} {manualRefreshRegion.y + rowOffset}–
                {manualRefreshRegion.y + rowOffset + manualRefreshRegion.h - 1}
              </span>
            </>
          )}
        </div>
      )}

      <div className="sdt-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`sdt-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            <FontAwesomeIcon icon={tab.icon} /> {t(tab.labelKey)}
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
