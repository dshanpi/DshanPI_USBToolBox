import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEraser,
  faFolderOpen,
  faPaperPlane,
  faRotateLeft,
  faRotateRight,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import type { TabContext } from './common';

type DrawTool = 'brush' | 'eraser' | 'line' | 'rect' | 'circle' | 'fill';
const TOOLS: Array<[DrawTool, string]> = [
  ['brush', '画笔'],
  ['eraser', '橡皮'],
  ['line', '直线'],
  ['rect', '矩形'],
  ['circle', '圆形'],
  ['fill', '填充'],
];

function copyImageData(image: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
}

export const DrawTab: React.FC<TabContext> = ({
  width,
  height,
  onSend,
  onPreview,
  onClearDisplay,
  busy,
  initialCanvas,
  onInitialCanvasConsumed,
}) => {
  const [tool, setTool] = useState<DrawTool>('brush');
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(2);
  const [filledShape, setFilledShape] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [revision, setRevision] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const drawingRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const shapeBaseRef = useRef<ImageData | null>(null);
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);

  const fillBlack = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const old = document.createElement('canvas');
    old.width = canvas.width;
    old.height = canvas.height;
    if (canvas.width && canvas.height) old.getContext('2d')?.drawImage(canvas, 0, 0);
    canvas.width = width;
    canvas.height = height;
    fillBlack(canvas);
    if (old.width && old.height) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(old, 0, 0, width, height);
      }
    }
    undoRef.current = [];
    redoRef.current = [];
    setRevision((value) => value + 1);
    setHistoryVersion((value) => value + 1);
  }, [fillBlack, height, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !initialCanvas) return;
    fillBlack(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const ratio = Math.min(width / initialCanvas.width, height / initialCanvas.height);
    const drawWidth = initialCanvas.width * ratio;
    const drawHeight = initialCanvas.height * ratio;
    ctx.drawImage(
      initialCanvas,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
    undoRef.current = [];
    redoRef.current = [];
    setRevision((value) => value + 1);
    setHistoryVersion((value) => value + 1);
    onInitialCanvasConsumed?.();
  }, [fillBlack, height, initialCanvas, onInitialCanvasConsumed, width]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const calculate = () => {
      const availableWidth = Math.max(1, wrap.clientWidth - 20);
      const availableHeight = Math.max(1, wrap.clientHeight - 20);
      const fit = Math.min(availableWidth / width, availableHeight / height);
      setDisplaySize({
        w: Math.max(1, Math.floor(width * fit * zoom)),
        h: Math.max(1, Math.floor(height * fit * zoom)),
      });
    };
    calculate();
    const observer = new ResizeObserver(calculate);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [height, width, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width !== width || canvas.height !== height) return;
    const frame = requestAnimationFrame(() => {
      onPreview({ canvas, description: `绘制预览 · ${width}×${height}`, bgColor: '#000000' });
    });
    return () => cancelAnimationFrame(frame);
  }, [height, onPreview, revision, width]);

  const getPosition = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          canvas.width - 1,
          Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width)
        )
      ),
      y: Math.max(
        0,
        Math.min(
          canvas.height - 1,
          Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height)
        )
      ),
    };
  };

  const pushUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    undoRef.current = [
      ...undoRef.current.slice(-29),
      copyImageData(ctx.getImageData(0, 0, canvas.width, canvas.height)),
    ];
    redoRef.current = [];
    setHistoryVersion((value) => value + 1);
  };

  const drawLine = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    erase = false
  ) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = erase ? '#000000' : color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const floodFill = (x: number, y: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const startIndex = (y * canvas.width + x) * 4;
    const source = Array.from(image.data.slice(startIndex, startIndex + 4));
    const target = color.match(/[a-f\d]{2}/gi)?.map((value) => Number.parseInt(value, 16)) ?? [
      255, 255, 255,
    ];
    target.push(255);
    if (source.every((value, index) => value === target[index])) return;
    const stack = [[x, y]];
    const matches = (index: number) =>
      source.every((value, offset) => image.data[index + offset] === value);
    while (stack.length) {
      const point = stack.pop();
      if (!point) break;
      const [px, py] = point;
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      const index = (py * canvas.width + px) * 4;
      if (!matches(index)) continue;
      for (let offset = 0; offset < 4; offset += 1) image.data[index + offset] = target[offset];
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    ctx.putImageData(image, 0, 0);
  };

  const drawShape = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !shapeBaseRef.current) return;
    ctx.putImageData(shapeBaseRef.current, 0, 0);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = brushSize;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    if (tool === 'line') drawLine(start, end);
    else if (tool === 'rect') {
      if (filledShape) ctx.fillRect(x, y, w, h);
      else ctx.strokeRect(x, y, w, h);
    } else if (tool === 'circle') {
      ctx.beginPath();
      ctx.ellipse(
        x + w / 2,
        y + h / 2,
        Math.max(0.5, w / 2),
        Math.max(0.5, h / 2),
        0,
        0,
        Math.PI * 2
      );
      if (filledShape) ctx.fill();
      else ctx.stroke();
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getPosition(event);
    pushUndo();
    setCoords(point);
    if (tool === 'fill') {
      floodFill(point.x, point.y);
      setRevision((value) => value + 1);
      return;
    }
    drawingRef.current = true;
    startRef.current = point;
    lastRef.current = point;
    const ctx = event.currentTarget.getContext('2d');
    shapeBaseRef.current = ctx
      ? copyImageData(ctx.getImageData(0, 0, event.currentTarget.width, event.currentTarget.height))
      : null;
    if (tool === 'brush' || tool === 'eraser') drawLine(point, point, tool === 'eraser');
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getPosition(event);
    setCoords(point);
    if (!drawingRef.current) return;
    if (tool === 'brush' || tool === 'eraser') {
      drawLine(lastRef.current ?? point, point, tool === 'eraser');
      lastRef.current = point;
    } else if (startRef.current) drawShape(startRef.current, point);
    setRevision((value) => value + 1);
  };
  const handlePointerUp = () => {
    if (drawingRef.current) setRevision((value) => value + 1);
    drawingRef.current = false;
    startRef.current = null;
    lastRef.current = null;
    shapeBaseRef.current = null;
  };

  const restore = (
    source: React.MutableRefObject<ImageData[]>,
    destination: React.MutableRefObject<ImageData[]>
  ) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const image = source.current[source.current.length - 1];
    if (!canvas || !ctx || !image) return;
    destination.current = [
      ...destination.current,
      copyImageData(ctx.getImageData(0, 0, canvas.width, canvas.height)),
    ].slice(-30);
    source.current = source.current.slice(0, -1);
    ctx.putImageData(image, 0, 0);
    setRevision((value) => value + 1);
    setHistoryVersion((value) => value + 1);
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pushUndo();
    fillBlack(canvas);
    setRevision((value) => value + 1);
  };
  const handleImport = async (file?: File) => {
    if (!file || !canvasRef.current) return;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      pushUndo();
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const ratio = Math.min(width / image.width, height / image.height);
      const w = image.width * ratio;
      const h = image.height * ratio;
      ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
      setRevision((value) => value + 1);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="sdt-tab-form">
      <div className="sdt-toolbar-row sdt-draw-tools">
        {TOOLS.map(([value, label]) => (
          <button
            key={value}
            className={`sdt-tool-btn ${tool === value ? 'active' : ''}`}
            onClick={() => setTool(value)}
          >
            {label}
          </button>
        ))}
        <input
          type="color"
          className="sdt-color-input"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
        <label>
          大小
          <input
            type="range"
            className="sdt-range"
            min={1}
            max={30}
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
          />
        </label>
        <span className="mono">{brushSize}px</span>
        {(tool === 'rect' || tool === 'circle') && (
          <label className="sdt-check">
            <input
              type="checkbox"
              checked={filledShape}
              onChange={(event) => setFilledShape(event.target.checked)}
            />
            填充
          </label>
        )}
      </div>
      <div className="sdt-toolbar-row">
        <button
          className="sdt-btn small"
          onClick={() => restore(undoRef, redoRef)}
          disabled={!undoRef.current.length}
        >
          <FontAwesomeIcon icon={faRotateLeft} /> 撤销
        </button>
        <button
          className="sdt-btn small"
          onClick={() => restore(redoRef, undoRef)}
          disabled={!redoRef.current.length}
        >
          <FontAwesomeIcon icon={faRotateRight} /> 重做
        </button>
        <button className="sdt-btn small" onClick={handleClearCanvas}>
          <FontAwesomeIcon icon={faTrash} /> 清画布
        </button>
        <span className="sdt-spacer" />
        <button
          className="sdt-btn sdt-clear-screen-btn"
          onClick={() => void onClearDisplay()}
          disabled={busy}
        >
          <FontAwesomeIcon icon={faEraser} /> 清屏
        </button>
        <button
          className="sdt-btn primary"
          onClick={() =>
            canvasRef.current &&
            void onSend({
              canvas: canvasRef.current,
              description: `绘制画面 ${width}×${height}`,
              bgColor: '#000000',
              metadata: {
                类型: '绘制',
                画布: `${width}×${height}`,
                最后工具: TOOLS.find(([value]) => value === tool)?.[1] ?? tool,
                颜色: color,
                笔刷: brushSize,
              },
            })
          }
          disabled={busy}
        >
          <FontAwesomeIcon icon={faPaperPlane} /> 发送
        </button>
      </div>

      <details className="sdt-advanced-panel">
        <summary>高级绘制设置</summary>
        <div className="sdt-advanced-content sdt-toolbar-row">
          <button className="sdt-btn small" onClick={() => fileInputRef.current?.click()}>
            <FontAwesomeIcon icon={faFolderOpen} /> 导入底图
          </button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="image/*"
            onChange={(event) => {
              void handleImport(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <label>
            放大
            <select
              className="sdt-select compact"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            >
              <option value={1}>适应</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
              <option value={8}>8×</option>
            </select>
          </label>
          <label className="sdt-check">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(event) => setShowGrid(event.target.checked)}
            />
            像素网格
          </label>
        </div>
      </details>

      <div className="sdt-canvas-wrap" ref={wrapRef} data-history-version={historyVersion}>
        <div
          className={`sdt-draw-canvas-frame ${showGrid ? 'grid' : ''}`}
          style={
            displaySize
              ? ({
                  width: displaySize.w,
                  height: displaySize.h,
                  '--pixel-x': `${displaySize.w / width}px`,
                  '--pixel-y': `${displaySize.h / height}px`,
                } as React.CSSProperties)
              : undefined
          }
        >
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
          {showGrid && <div className="sdt-pixel-grid" />}
        </div>
      </div>
      <div className="sdt-canvas-status">
        <span>
          画布 {width}×{height} · {TOOLS.find(([value]) => value === tool)?.[1]}
        </span>
        <span>{coords ? `(${coords.x}, ${coords.y})` : '(--, --)'}</span>
      </div>
    </div>
  );
};
