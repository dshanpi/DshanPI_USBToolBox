import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEraser, faPaperPlane, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import type { ContentRegion, TabContext } from './common';

type TestPattern =
  | 'solid-red'
  | 'solid-green'
  | 'solid-blue'
  | 'solid-white'
  | 'solid-black'
  | 'color-bars'
  | 'gradient'
  | 'checkerboard'
  | 'frame-coordinates'
  | 'horizontal-scan'
  | 'vertical-scan';

interface PatternOption {
  key: TestPattern;
  label: string;
  description: string;
  swatch: string;
}

const PATTERN_OPTIONS: PatternOption[] = [
  { key: 'solid-red', label: '红色', description: '红色纯色', swatch: '#ff0000' },
  { key: 'solid-green', label: '绿色', description: '绿色纯色', swatch: '#00ff00' },
  { key: 'solid-blue', label: '蓝色', description: '蓝色纯色', swatch: '#0000ff' },
  { key: 'solid-white', label: '白色', description: '白色纯色', swatch: '#ffffff' },
  { key: 'solid-black', label: '黑色', description: '黑色纯色', swatch: '#000000' },
  {
    key: 'color-bars',
    label: 'RGB 彩条',
    description: 'RGB 标准彩条',
    swatch:
      'linear-gradient(90deg, #fff 0 12.5%, #ff0 12.5% 25%, #0ff 25% 37.5%, #0f0 37.5% 50%, #f0f 50% 62.5%, #f00 62.5% 75%, #00f 75% 87.5%, #000 87.5%)',
  },
  {
    key: 'gradient',
    label: '渐变色',
    description: '灰阶与色相渐变',
    swatch: 'linear-gradient(90deg, #000, #fff, #f00, #ff0, #0f0, #0ff, #00f, #f0f)',
  },
  {
    key: 'checkerboard',
    label: '棋盘格',
    description: '黑白棋盘格',
    swatch: 'conic-gradient(#fff 25%, #111 0 50%, #fff 0 75%, #111 0) 0 0 / 10px 10px',
  },
  {
    key: 'frame-coordinates',
    label: '边框坐标',
    description: '边框与四角坐标',
    swatch:
      'linear-gradient(#fff, #fff) center / 1px 100% no-repeat, linear-gradient(90deg, #fff, #fff) center / 100% 1px no-repeat, #111',
  },
  {
    key: 'horizontal-scan',
    label: '横线扫描',
    description: '横向扫描线',
    swatch: 'linear-gradient(#111 45%, #fff 45% 55%, #111 55%)',
  },
  {
    key: 'vertical-scan',
    label: '竖线扫描',
    description: '纵向扫描线',
    swatch: 'linear-gradient(90deg, #111 45%, #fff 45% 55%, #111 55%)',
  },
];

const SOLID_COLORS: Partial<Record<TestPattern, string>> = {
  'solid-red': '#ff0000',
  'solid-green': '#00ff00',
  'solid-blue': '#0000ff',
  'solid-white': '#ffffff',
  'solid-black': '#000000',
};

const COLOR_BARS = [
  '#ffffff',
  '#ffff00',
  '#00ffff',
  '#00ff00',
  '#ff00ff',
  '#ff0000',
  '#0000ff',
  '#000000',
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** 在目标 Canvas 中绘制选定的诊断图案。 */
function renderTestPattern(
  canvas: HTMLCanvasElement,
  pattern: TestPattern,
  scanPosition: number,
  requestedLineWidth: number,
  scanColor: string
): void {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建测试图案画布');

  context.imageSmoothingEnabled = false;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);

  const solidColor = SOLID_COLORS[pattern];
  if (solidColor) {
    context.fillStyle = solidColor;
    context.fillRect(0, 0, width, height);
    return;
  }

  if (pattern === 'color-bars') {
    COLOR_BARS.forEach((color, index) => {
      const startX = Math.floor((index * width) / COLOR_BARS.length);
      const endX = Math.floor(((index + 1) * width) / COLOR_BARS.length);
      context.fillStyle = color;
      context.fillRect(startX, 0, Math.max(1, endX - startX), height);
    });
    return;
  }

  if (pattern === 'gradient') {
    const divider = Math.max(1, Math.floor(height / 2));
    const grayGradient = context.createLinearGradient(0, 0, width, 0);
    grayGradient.addColorStop(0, '#000000');
    grayGradient.addColorStop(1, '#ffffff');
    context.fillStyle = grayGradient;
    context.fillRect(0, 0, width, divider);

    const hueGradient = context.createLinearGradient(0, 0, width, 0);
    ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'].forEach(
      (color, index, colors) => hueGradient.addColorStop(index / (colors.length - 1), color)
    );
    context.fillStyle = hueGradient;
    context.fillRect(0, divider, width, height - divider);
    return;
  }

  if (pattern === 'checkerboard') {
    const cellSize = clamp(Math.floor(Math.min(width, height) / 10), 4, 24);
    for (let y = 0; y < height; y += cellSize) {
      for (let x = 0; x < width; x += cellSize) {
        context.fillStyle =
          (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 ? '#000000' : '#ffffff';
        context.fillRect(x, y, cellSize, cellSize);
      }
    }
    return;
  }

  if (pattern === 'frame-coordinates') {
    const borderWidth = clamp(Math.round(Math.min(width, height) / 80), 1, 3);
    const cornerSize = clamp(Math.round(Math.min(width, height) / 10), 4, 12);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, borderWidth);
    context.fillRect(0, height - borderWidth, width, borderWidth);
    context.fillRect(0, 0, borderWidth, height);
    context.fillRect(width - borderWidth, 0, borderWidth, height);

    context.fillStyle = '#444444';
    context.fillRect(Math.floor(width / 2), 0, 1, height);
    context.fillRect(0, Math.floor(height / 2), width, 1);

    [
      { x: 0, y: 0, color: '#ff0000' },
      { x: width - cornerSize, y: 0, color: '#00ff00' },
      { x: 0, y: height - cornerSize, color: '#0000ff' },
      { x: width - cornerSize, y: height - cornerSize, color: '#ffff00' },
    ].forEach(({ x, y, color }) => {
      context.fillStyle = color;
      context.fillRect(x, y, cornerSize, cornerSize);
    });

    const fontSize = clamp(Math.floor(Math.min(width, height) / 9), 8, 14);
    context.fillStyle = '#ffffff';
    context.font = `${fontSize}px Consolas, monospace`;
    context.textBaseline = 'top';
    context.textAlign = 'left';
    context.fillText('(0,0)', cornerSize + 2, borderWidth + 1);
    context.textAlign = 'right';
    context.fillText(`(${width - 1},0)`, width - cornerSize - 2, borderWidth + 1);
    context.textBaseline = 'bottom';
    context.textAlign = 'left';
    context.fillText(`(0,${height - 1})`, cornerSize + 2, height - borderWidth - 1);
    context.textAlign = 'right';
    context.fillText(
      `(${width - 1},${height - 1})`,
      width - cornerSize - 2,
      height - borderWidth - 1
    );
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillText(`${width}×${height}`, width / 2, height / 2);
    return;
  }

  const lineWidth = clamp(requestedLineWidth, 1, pattern === 'horizontal-scan' ? height : width);
  context.fillStyle = scanColor;
  if (pattern === 'horizontal-scan') {
    context.fillRect(0, clamp(scanPosition, 0, height - lineWidth), width, lineWidth);
  } else {
    context.fillRect(clamp(scanPosition, 0, width - lineWidth), 0, lineWidth, height);
  }
}

function createPatternCanvas(
  width: number,
  height: number,
  pattern: TestPattern,
  scanPosition: number,
  lineWidth: number,
  scanColor: string
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  renderTestPattern(canvas, pattern, scanPosition, lineWidth, scanColor);
  return canvas;
}

function isScanPattern(pattern: TestPattern): boolean {
  return pattern === 'horizontal-scan' || pattern === 'vertical-scan';
}

/** 屏幕诊断图案与动态扫描工具。 */
export const TestTab: React.FC<TabContext> = ({
  width,
  height,
  onSend,
  onPreview,
  onClearDisplay,
  busy,
  displayType,
}) => {
  const [pattern, setPattern] = useState<TestPattern>('color-bars');
  const [lineWidth, setLineWidth] = useState(2);
  const [scanColor, setScanColor] = useState('#ffffff');
  const [scanInterval, setScanInterval] = useState(100);
  const [scanPosition, setScanPosition] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [sending, setSending] = useState(false);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const scanActiveRef = useRef(false);
  const scanTimerRef = useRef<number | null>(null);

  const selectedOption = PATTERN_OPTIONS.find((option) => option.key === pattern)!;
  const scanPatternSelected = isScanPattern(pattern);
  const controlsDisabled = busy || sending;

  const stopScan = useCallback(() => {
    scanActiveRef.current = false;
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    renderTestPattern(canvas, pattern, scanPosition, lineWidth, scanColor);
    const region: ContentRegion | undefined =
      pattern === 'horizontal-scan'
        ? { x: 0, y: scanPosition, w: width, h: Math.min(lineWidth, height - scanPosition) }
        : pattern === 'vertical-scan'
          ? { x: scanPosition, y: 0, w: Math.min(lineWidth, width - scanPosition), h: height }
          : undefined;
    onPreview({
      canvas,
      description: `测试图案预览：${selectedOption.description}`,
      bgColor: '#000000',
      region,
    });
  }, [
    height,
    lineWidth,
    onPreview,
    pattern,
    scanColor,
    scanPosition,
    selectedOption.description,
    width,
  ]);

  useEffect(() => {
    if (scanActiveRef.current) stopScan();
    setScanPosition(0);
  }, [height, stopScan, width]);

  useEffect(() => () => stopScan(), [stopScan]);

  const sendPattern = async () => {
    if (controlsDisabled || scanning) return;
    setSending(true);
    try {
      const canvas = createPatternCanvas(
        width,
        height,
        pattern,
        scanPosition,
        lineWidth,
        scanColor
      );
      await onSend({
        canvas,
        description: `测试图案：${selectedOption.description}`,
        bgColor: '#000000',
        region: { x: 0, y: 0, w: width, h: height },
        metadata: {
          类型: '测试图案',
          图案: selectedOption.description,
          分辨率: `${width}×${height}`,
          扫描线宽: scanPatternSelected ? lineWidth : 0,
          扫描颜色: scanPatternSelected ? scanColor : '--',
        },
      });
    } finally {
      setSending(false);
    }
  };

  const clearDisplay = async () => {
    if (controlsDisabled || scanning) return;
    setSending(true);
    try {
      await onClearDisplay();
    } finally {
      setSending(false);
    }
  };

  const startScan = async () => {
    if (!scanPatternSelected || controlsDisabled || scanning) return;
    scanActiveRef.current = true;
    setScanning(true);
    setScanPosition(0);

    await onClearDisplay();
    if (!scanActiveRef.current) return;

    const horizontal = pattern === 'horizontal-scan';
    const axisLength = horizontal ? height : width;
    const actualLineWidth = clamp(lineWidth, 1, axisLength);
    const maximumPosition = Math.max(0, axisLength - actualLineWidth);
    let position = 0;
    let direction = 1;
    let previousPosition: number | null = null;

    const sendNextFrame = async () => {
      if (!scanActiveRef.current) return;

      setScanPosition(position);
      const canvas = createPatternCanvas(
        width,
        height,
        pattern,
        position,
        actualLineWidth,
        scanColor
      );
      const start = previousPosition === null ? position : Math.min(position, previousPosition);
      const end =
        previousPosition === null
          ? position + actualLineWidth
          : Math.max(position + actualLineWidth, previousPosition + actualLineWidth);
      const region: ContentRegion = horizontal
        ? { x: 0, y: start, w: width, h: end - start }
        : { x: start, y: 0, w: end - start, h: height };

      try {
        await onSend({
          canvas,
          description: `测试图案：${selectedOption.description}，位置 ${position}`,
          bgColor: '#000000',
          region,
          silent: previousPosition !== null,
          transient: true,
        });
      } catch {
        stopScan();
        return;
      }
      if (!scanActiveRef.current) return;

      previousPosition = position;
      if (maximumPosition > 0) {
        const candidate = position + direction * actualLineWidth;
        if (candidate >= maximumPosition) {
          position = maximumPosition;
          direction = -1;
        } else if (candidate <= 0) {
          position = 0;
          direction = 1;
        } else {
          position = candidate;
        }
      }

      scanTimerRef.current = window.setTimeout(() => {
        void sendNextFrame();
      }, scanInterval);
    };

    await sendNextFrame();
  };

  return (
    <div className="sdt-test-tab">
      <div className="sdt-test-pattern-grid" role="list" aria-label="屏幕测试图案">
        {PATTERN_OPTIONS.map((option) => (
          <button
            key={option.key}
            className={`sdt-test-pattern-btn ${pattern === option.key ? 'active' : ''}`}
            onClick={() => {
              setPattern(option.key);
              setScanPosition(0);
            }}
            disabled={controlsDisabled || scanning}
            title={option.description}
            role="listitem"
          >
            <span className="sdt-test-swatch" style={{ background: option.swatch }} />
            <span>{option.label}</span>
          </button>
        ))}
      </div>

      {scanPatternSelected && (
        <div className="sdt-test-scan-settings">
          <label>
            扫描颜色
            <input
              type="color"
              className="sdt-color-input"
              value={scanColor}
              onChange={(event) => setScanColor(event.target.value)}
              disabled={scanning}
            />
          </label>
          <label>
            线宽
            <input
              type="range"
              className="sdt-range"
              min={1}
              max={8}
              value={lineWidth}
              onChange={(event) => setLineWidth(Number(event.target.value))}
              disabled={scanning}
            />
            <span className="sdt-test-value">{lineWidth}px</span>
          </label>
          <label>
            帧间隔
            <input
              type="range"
              className="sdt-range"
              min={0}
              max={1000}
              step={50}
              value={scanInterval}
              onChange={(event) => setScanInterval(Number(event.target.value))}
              disabled={scanning}
            />
            <span className="sdt-test-value">{scanInterval}ms</span>
          </label>
        </div>
      )}

      <div className="sdt-test-actions">
        <span className="sdt-test-selection">{selectedOption.description}</span>
        <span className="sdt-spacer" />
        <button
          className="sdt-btn sdt-clear-screen-btn"
          onClick={() => void clearDisplay()}
          disabled={controlsDisabled || scanning}
          title="清除物理屏幕和发送预览"
        >
          <FontAwesomeIcon icon={faEraser} /> 清屏
        </button>
        {scanPatternSelected ? (
          <>
            <button
              className="sdt-btn"
              onClick={() => void sendPattern()}
              disabled={controlsDisabled || scanning}
              title="发送当前预览中的静态扫描线"
            >
              <FontAwesomeIcon icon={faPaperPlane} /> 单帧
            </button>
            <button
              className="sdt-btn success"
              onClick={() => void startScan()}
              disabled={controlsDisabled || scanning}
            >
              <FontAwesomeIcon icon={faPlay} /> 开始扫描
            </button>
            <button className="sdt-btn danger" onClick={stopScan} disabled={!scanning}>
              <FontAwesomeIcon icon={faStop} /> 停止
            </button>
          </>
        ) : (
          <button
            className="sdt-btn primary"
            onClick={() => void sendPattern()}
            disabled={controlsDisabled}
          >
            <FontAwesomeIcon icon={faPaperPlane} /> 发送图案
          </button>
        )}
      </div>

      <div className="sdt-test-preview">
        <canvas ref={previewRef} />
      </div>

      <div className="sdt-test-status">
        <span>
          画布 {width}×{height}
          {displayType === 'monochrome-page' ? ' · 当前单色屏将自动转换为黑白图案' : ''}
        </span>
        <span>{scanning ? `扫描中 · 位置 ${scanPosition}` : '就绪'}</span>
      </div>
    </div>
  );
};
