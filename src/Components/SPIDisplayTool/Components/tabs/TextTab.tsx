import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEraser,
  faFolderOpen,
  faPaperPlane,
  faPlay,
  faStop,
} from '@fortawesome/free-solid-svg-icons';
import { OLED_FONT_FAMILY, loadOledFont } from '../../../../Library/SSD1306';
import type { TabContext } from './common';

type TextAlign = 'left' | 'center' | 'right';
const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const SYSTEM_FONTS = [
  ['oled', '内置点阵字体'],
  ['sans-serif', '系统无衬线'],
  ['serif', '系统衬线'],
  ['monospace', '系统等宽'],
] as const;

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  spacing: number,
  stroke: boolean
) {
  let cursor = x;
  for (const character of Array.from(value)) {
    if (stroke) ctx.strokeText(character, cursor, y);
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + spacing;
  }
}

export const TextTab: React.FC<TabContext> = ({
  width,
  height,
  onSend,
  onPreview,
  onClearDisplay,
  busy,
}) => {
  const [fontSize, setFontSize] = useState(16);
  const [fgColor, setFgColor] = useState('#ffffff');
  const [bgColor, setBgColor] = useState('#000000');
  const [text, setText] = useState('Hello, SPI LCD!\n你好，SPI 屏幕');
  const [align, setAlign] = useState<TextAlign>('left');
  const [x, setX] = useState(2);
  const [y, setY] = useState(2);
  const [regionWidth, setRegionWidth] = useState(width - 4);
  const [regionHeight, setRegionHeight] = useState(height - 4);
  const [autoWrap, setAutoWrap] = useState(true);
  const [lineSpacing, setLineSpacing] = useState(2);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [fontFamily, setFontFamily] = useState('oled');
  const [localFontName, setLocalFontName] = useState('');
  const [bold, setBold] = useState(false);
  const [stroke, setStroke] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const scrollStopRef = useRef(true);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setRegionWidth((value) => Math.max(1, Math.min(value, width)));
    setRegionHeight((value) => Math.max(1, Math.min(value, height)));
  }, [height, width]);

  const resolvedFont =
    fontFamily === 'oled'
      ? `"${OLED_FONT_FAMILY}", sans-serif`
      : fontFamily === 'local' && localFontName
        ? `"${localFontName}", sans-serif`
        : fontFamily;

  const renderCanvas = useCallback(
    (scrollOffset = 0) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return canvas;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, Math.max(1, regionWidth), Math.max(1, regionHeight));
      ctx.clip();
      ctx.fillStyle = fgColor;
      ctx.strokeStyle = bgColor === '#000000' ? '#ffffff' : '#000000';
      ctx.lineWidth = Math.max(1, fontSize / 10);
      ctx.font = `${bold ? '700 ' : ''}${fontSize}px ${resolvedFont}`;
      ctx.textBaseline = 'top';
      ctx.imageSmoothingEnabled = false;

      const measure = (value: string) =>
        Array.from(value).reduce(
          (sum, character, index) =>
            sum + ctx.measureText(character).width + (index ? letterSpacing : 0),
          0
        );
      const lines: string[] = [];
      for (const rawLine of text.split('\n')) {
        if (!autoWrap) {
          lines.push(rawLine);
          continue;
        }
        let current = '';
        for (const character of Array.from(rawLine)) {
          if (current && measure(current + character) > regionWidth) {
            lines.push(current);
            current = character;
          } else current += character;
        }
        lines.push(current);
      }

      const lineHeight = fontSize + lineSpacing;
      lines.forEach((line, index) => {
        const measured = measure(line);
        let drawX = x - scrollOffset;
        if (align === 'center') drawX = x + (regionWidth - measured) / 2 - scrollOffset;
        if (align === 'right') drawX = x + regionWidth - measured - scrollOffset;
        drawSpacedText(ctx, line, drawX, y + index * lineHeight, letterSpacing, stroke);
      });
      ctx.restore();
      return canvas;
    },
    [
      align,
      autoWrap,
      bgColor,
      bold,
      fgColor,
      fontSize,
      height,
      letterSpacing,
      lineSpacing,
      regionHeight,
      regionWidth,
      resolvedFont,
      stroke,
      text,
      width,
      x,
      y,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    if (fontFamily === 'oled') void loadOledFont().catch(() => undefined);
    const frame = requestAnimationFrame(() => {
      if (!cancelled) {
        onPreview({
          canvas: renderCanvas(),
          description: `文本预览 · ${fontSize}px · ${align}`,
          bgColor,
        });
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [align, bgColor, fontFamily, fontSize, onPreview, renderCanvas]);

  useEffect(
    () => () => {
      scrollStopRef.current = true;
    },
    []
  );

  const handleLocalFont = async (file?: File) => {
    if (!file) return;
    const name = `SPITextFont-${Date.now()}`;
    try {
      const face = new FontFace(name, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      setLocalFontName(name);
      setFontFamily('local');
    } catch {
      window.alert('字体加载失败，请选择有效的 TTF/OTF/WOFF 字体文件');
    }
  };

  const handleSend = async () => {
    await onSend({
      canvas: renderCanvas(),
      description: `文本：${text.split('\n').length} 行 @ ${fontSize}px`,
      bgColor,
      metadata: {
        类型: '文本',
        字号: fontSize,
        字体: fontFamily === 'local' ? localFontName : fontFamily,
        对齐: align,
        X: x,
        Y: y,
        区域宽: regionWidth,
        区域高: regionHeight,
        自动换行: autoWrap,
        行距: lineSpacing,
        字距: letterSpacing,
        粗体: bold,
        描边: stroke,
      },
    });
  };

  const handleScroll = async () => {
    if (scrolling) {
      scrollStopRef.current = true;
      setScrolling(false);
      return;
    }
    scrollStopRef.current = false;
    setScrolling(true);
    let offset = -regionWidth;
    const maxOffset = Math.max(regionWidth, text.length * (fontSize + letterSpacing));
    while (!scrollStopRef.current) {
      const canvas = renderCanvas(offset);
      onPreview({ canvas, description: `滚动文字 · X=${Math.round(offset)}`, bgColor });
      const result = await onSend({
        canvas,
        description: `滚动文字 · X=${Math.round(offset)}`,
        bgColor,
        transient: true,
        silent: true,
      });
      if (result.status === 'cancelled') break;
      offset += 2;
      if (offset > maxOffset) offset = -regionWidth;
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    }
    scrollStopRef.current = true;
    setScrolling(false);
  };

  return (
    <div className="sdt-tab-form">
      <details className="sdt-advanced-panel">
        <summary>高级排版</summary>
        <div className="sdt-advanced-content">
          <div className="sdt-toolbar-row">
            <label>字体</label>
            <select
              className="sdt-select"
              value={fontFamily}
              onChange={(event) => setFontFamily(event.target.value)}
            >
              {SYSTEM_FONTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {localFontName && <option value="local">本地字体</option>}
            </select>
            <button className="sdt-btn small" onClick={() => fontInputRef.current?.click()}>
              <FontAwesomeIcon icon={faFolderOpen} /> TTF
            </button>
            <input
              ref={fontInputRef}
              hidden
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              onChange={(event) => void handleLocalFont(event.target.files?.[0])}
            />
            <label className="sdt-check">
              <input
                type="checkbox"
                checked={bold}
                onChange={(event) => setBold(event.target.checked)}
              />
              粗体
            </label>
            <label className="sdt-check">
              <input
                type="checkbox"
                checked={stroke}
                onChange={(event) => setStroke(event.target.checked)}
              />
              描边
            </label>
          </div>

          <div className="sdt-toolbar-row sdt-parameter-grid">
            <label>
              对齐
              <select
                className="sdt-select"
                value={align}
                onChange={(event) => setAlign(event.target.value as TextAlign)}
              >
                <option value="left">左对齐</option>
                <option value="center">居中</option>
                <option value="right">右对齐</option>
              </select>
            </label>
            <label>
              X
              <input
                className="sdt-input mono"
                type="number"
                value={x}
                onChange={(event) => setX(Number(event.target.value))}
              />
            </label>
            <label>
              Y
              <input
                className="sdt-input mono"
                type="number"
                value={y}
                onChange={(event) => setY(Number(event.target.value))}
              />
            </label>
            <label>
              区域宽
              <input
                className="sdt-input mono"
                type="number"
                min={1}
                max={width}
                value={regionWidth}
                onChange={(event) => setRegionWidth(Number(event.target.value))}
              />
            </label>
            <label>
              区域高
              <input
                className="sdt-input mono"
                type="number"
                min={1}
                max={height}
                value={regionHeight}
                onChange={(event) => setRegionHeight(Number(event.target.value))}
              />
            </label>
            <label>
              行距
              <input
                className="sdt-input mono"
                type="number"
                value={lineSpacing}
                onChange={(event) => setLineSpacing(Number(event.target.value))}
              />
            </label>
            <label>
              字距
              <input
                className="sdt-input mono"
                type="number"
                value={letterSpacing}
                onChange={(event) => setLetterSpacing(Number(event.target.value))}
              />
            </label>
            <label className="sdt-check">
              <input
                type="checkbox"
                checked={autoWrap}
                onChange={(event) => setAutoWrap(event.target.checked)}
              />
              自动换行
            </label>
          </div>

          <div className="sdt-toolbar-row">
            <button
              className={`sdt-btn ${scrolling ? 'danger' : ''}`}
              onClick={() => void handleScroll()}
              disabled={busy}
            >
              <FontAwesomeIcon icon={scrolling ? faStop : faPlay} />{' '}
              {scrolling ? '停止滚动' : '滚动文字'}
            </button>
            <span className="sdt-advanced-hint">滚动发送会按当前排版参数连续刷新屏幕</span>
          </div>
        </div>
      </details>

      <div className="sdt-toolbar-row">
        <label>字号</label>
        <select
          className="sdt-select compact"
          value={fontSize}
          onChange={(event) => setFontSize(Number(event.target.value))}
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
        <label>文字</label>
        <input
          type="color"
          className="sdt-color-input"
          value={fgColor}
          onChange={(event) => setFgColor(event.target.value)}
        />
        <label>背景</label>
        <input
          type="color"
          className="sdt-color-input"
          value={bgColor}
          onChange={(event) => setBgColor(event.target.value)}
        />
        <span className="sdt-spacer" />
        <button
          className="sdt-btn sdt-clear-screen-btn"
          onClick={() => void onClearDisplay()}
          disabled={busy}
        >
          <FontAwesomeIcon icon={faEraser} /> 清屏
        </button>
        <button className="sdt-btn primary" onClick={() => void handleSend()} disabled={busy}>
          <FontAwesomeIcon icon={faPaperPlane} /> 发送
        </button>
      </div>
      <textarea
        className="sdt-textarea"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="输入要显示的文字"
      />
    </div>
  );
};
