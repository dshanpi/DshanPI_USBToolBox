import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCloudArrowUp,
  faEraser,
  faFolderOpen,
  faPaperPlane,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { readFile } from '@tauri-apps/plugin-fs';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { TabContext } from './common';

type ScaleMode = 'stretch' | 'contain' | 'cover' | 'custom' | 'tile';
type MonoMode = 'color' | 'threshold' | 'dither';
const SCALE_LABELS: Record<ScaleMode, string> = {
  stretch: '拉伸填满',
  contain: '等比完整显示',
  cover: '等比填充裁剪',
  custom: '自定义缩放定位',
  tile: '平铺',
};

function applyPixelProcessing(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  channelOrder: 'rgb' | 'bgr',
  monoMode: MonoMode,
  threshold: number
) {
  if (channelOrder === 'rgb' && monoMode === 'color') return;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  if (channelOrder === 'bgr') {
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      data[index] = data[index + 2];
      data[index + 2] = red;
    }
  }
  if (monoMode === 'threshold') {
    for (let index = 0; index < data.length; index += 4) {
      const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const value = luminance >= threshold ? 255 : 0;
      data[index] = data[index + 1] = data[index + 2] = value;
    }
  } else if (monoMode === 'dither') {
    const values = new Float32Array(width * height);
    for (let index = 0; index < values.length; index += 1) {
      const offset = index * 4;
      values[index] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const next = values[index] >= threshold ? 255 : 0;
        const error = values[index] - next;
        values[index] = next;
        if (x + 1 < width) values[index + 1] += (error * 7) / 16;
        if (y + 1 < height) {
          if (x > 0) values[index + width - 1] += (error * 3) / 16;
          values[index + width] += (error * 5) / 16;
          if (x + 1 < width) values[index + width + 1] += error / 16;
        }
      }
    }
    for (let index = 0; index < values.length; index += 1) {
      const offset = index * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = values[index];
    }
  }
  ctx.putImageData(image, 0, 0);
}

export const ImageTab: React.FC<TabContext> = ({
  width,
  height,
  onSend,
  onPreview,
  onClearDisplay,
  busy,
  displayType,
}) => {
  const [scaleMode, setScaleMode] = useState<ScaleMode>('contain');
  const [imageURL, setImageURL] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [channelOrder, setChannelOrder] = useState<'rgb' | 'bgr'>('rgb');
  const [monoMode, setMonoMode] = useState<MonoMode>(
    displayType === 'monochrome-page' ? 'threshold' : 'color'
  );
  const [threshold, setThreshold] = useState(128);
  const [background, setBackground] = useState('#000000');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragOriginRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(
    null
  );

  const replaceImageUrl = useCallback((url: string, name: string) => {
    setImageURL((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
    setImageName(name);
    setOffsetX(0);
    setOffsetY(0);
  }, []);

  const handleFile = useCallback(
    (file?: File | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.alert(`不是图片文件：${file.type || file.name}`);
        return;
      }
      replaceImageUrl(URL.createObjectURL(file), file.name);
    },
    [replaceImageUrl]
  );

  useEffect(() => {
    if (!imageURL) {
      setLoadedImage(null);
      onPreview(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.src = imageURL;
    void image.decode().then(() => {
      if (!cancelled) setLoadedImage(image);
    });
    return () => {
      cancelled = true;
    };
  }, [imageURL, onPreview]);

  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    let unlisten: (() => void) | undefined;
    void webview
      .onDragDropEvent(async ({ payload }) => {
        if (payload.type === 'over') return setDragging(true);
        if (payload.type === 'leave') return setDragging(false);
        if (payload.type !== 'drop' || !payload.paths.length) return;
        setDragging(false);
        const path = payload.paths[0];
        const extension = path.split('.').pop()?.toLowerCase() ?? '';
        const mime: Record<string, string> = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          bmp: 'image/bmp',
          webp: 'image/webp',
          gif: 'image/gif',
        };
        if (!mime[extension]) return;
        try {
          const data = await readFile(path);
          replaceImageUrl(
            URL.createObjectURL(new Blob([data], { type: mime[extension] })),
            path.split(/[/\\]/).pop() ?? 'image'
          );
        } catch (error) {
          console.error('Failed to read dropped image:', error);
        }
      })
      .then((dispose) => {
        unlisten = dispose;
      });
    return () => unlisten?.();
  }, [replaceImageUrl]);

  useEffect(
    () => () => {
      if (imageURL) URL.revokeObjectURL(imageURL);
    },
    [imageURL]
  );

  const renderToCanvas = useCallback(() => {
    if (!loadedImage) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    const image = loadedImage;
    if (scaleMode === 'stretch') {
      ctx.drawImage(image, 0, 0, width, height);
    } else if (scaleMode === 'tile') {
      const ratio = zoom / 100;
      const tileWidth = Math.max(1, image.width * ratio);
      const tileHeight = Math.max(1, image.height * ratio);
      for (let y = offsetY - tileHeight; y < height; y += tileHeight) {
        for (let x = offsetX - tileWidth; x < width; x += tileWidth)
          ctx.drawImage(image, x, y, tileWidth, tileHeight);
      }
    } else {
      const baseRatio =
        scaleMode === 'cover'
          ? Math.max(width / image.width, height / image.height)
          : scaleMode === 'contain'
            ? Math.min(width / image.width, height / image.height)
            : 1;
      const ratio = baseRatio * (zoom / 100);
      const drawWidth = image.width * ratio;
      const drawHeight = image.height * ratio;
      ctx.drawImage(
        image,
        (width - drawWidth) / 2 + offsetX,
        (height - drawHeight) / 2 + offsetY,
        drawWidth,
        drawHeight
      );
    }
    ctx.filter = 'none';
    applyPixelProcessing(ctx, width, height, channelOrder, monoMode, threshold);
    return canvas;
  }, [
    background,
    brightness,
    channelOrder,
    contrast,
    height,
    loadedImage,
    monoMode,
    offsetX,
    offsetY,
    saturation,
    scaleMode,
    threshold,
    width,
    zoom,
  ]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const canvas = renderToCanvas();
      if (!canvas) return;
      const visible = previewCanvasRef.current;
      if (visible) {
        visible.width = width;
        visible.height = height;
        visible.getContext('2d')?.drawImage(canvas, 0, 0);
      }
      onPreview({ canvas, description: `图片预览：${imageName}`, bgColor: background });
    });
    return () => cancelAnimationFrame(frame);
  }, [background, height, imageName, onPreview, renderToCanvas, width]);

  const handleSend = async () => {
    const canvas = renderToCanvas();
    if (!canvas) return;
    await onSend({
      canvas,
      description: `图片：${imageName} · ${SCALE_LABELS[scaleMode]}`,
      bgColor: background,
      metadata: {
        类型: '图片',
        文件: imageName,
        布局: SCALE_LABELS[scaleMode],
        缩放: `${zoom}%`,
        X: offsetX,
        Y: offsetY,
        亮度: `${brightness}%`,
        对比度: `${contrast}%`,
        饱和度: `${saturation}%`,
        通道: channelOrder.toUpperCase(),
        单色处理: monoMode,
        阈值: threshold,
        背景: background,
      },
    });
  };
  const handleClear = () => {
    setImageURL((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setImageName('');
    setLoadedImage(null);
    onPreview(null);
  };

  return (
    <div className="sdt-tab-form">
      <div className="sdt-toolbar-row">
        <label>
          布局
          <select
            className="sdt-select"
            value={scaleMode}
            onChange={(event) => setScaleMode(event.target.value as ScaleMode)}
          >
            {(Object.keys(SCALE_LABELS) as ScaleMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {SCALE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <button className="sdt-btn small" onClick={() => fileInputRef.current?.click()}>
          <FontAwesomeIcon icon={faFolderOpen} /> 选择图片
        </button>
        <span className="sdt-spacer" />
        <button className="sdt-btn" onClick={handleClear} disabled={!imageURL}>
          <FontAwesomeIcon icon={faXmark} /> 清空
        </button>
        <button
          className="sdt-btn sdt-clear-screen-btn"
          onClick={() => void onClearDisplay()}
          disabled={busy}
        >
          <FontAwesomeIcon icon={faEraser} /> 清屏
        </button>
        <button
          className="sdt-btn primary"
          onClick={() => void handleSend()}
          disabled={busy || !loadedImage}
        >
          <FontAwesomeIcon icon={faPaperPlane} /> 发送
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>

      <details className="sdt-advanced-panel">
        <summary>高级图片设置</summary>
        <div className="sdt-advanced-content">
          <div className="sdt-toolbar-row sdt-parameter-grid">
            <label>
              缩放 %
              <input
                className="sdt-input mono"
                type="number"
                min={10}
                max={800}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
            <label>
              X
              <input
                className="sdt-input mono"
                type="number"
                value={offsetX}
                onChange={(event) => setOffsetX(Number(event.target.value))}
              />
            </label>
            <label>
              Y
              <input
                className="sdt-input mono"
                type="number"
                value={offsetY}
                onChange={(event) => setOffsetY(Number(event.target.value))}
              />
            </label>
            <label>
              亮度
              <input
                className="sdt-input mono"
                type="number"
                min={0}
                max={300}
                value={brightness}
                onChange={(event) => setBrightness(Number(event.target.value))}
              />
            </label>
            <label>
              对比度
              <input
                className="sdt-input mono"
                type="number"
                min={0}
                max={300}
                value={contrast}
                onChange={(event) => setContrast(Number(event.target.value))}
              />
            </label>
            <label>
              饱和度
              <input
                className="sdt-input mono"
                type="number"
                min={0}
                max={300}
                value={saturation}
                onChange={(event) => setSaturation(Number(event.target.value))}
              />
            </label>
            <label>
              通道
              <select
                className="sdt-select"
                value={channelOrder}
                onChange={(event) => setChannelOrder(event.target.value as 'rgb' | 'bgr')}
              >
                <option value="rgb">RGB</option>
                <option value="bgr">BGR</option>
              </select>
            </label>
            <label>
              单色处理
              <select
                className="sdt-select"
                value={monoMode}
                onChange={(event) => setMonoMode(event.target.value as MonoMode)}
              >
                <option value="color">关闭</option>
                <option value="threshold">阈值</option>
                <option value="dither">Floyd–Steinberg</option>
              </select>
            </label>
            {monoMode !== 'color' && (
              <label>
                阈值
                <input
                  className="sdt-input mono"
                  type="number"
                  min={0}
                  max={255}
                  value={threshold}
                  onChange={(event) => setThreshold(Number(event.target.value))}
                />
              </label>
            )}
            <label>
              透明背景
              <input
                className="sdt-color-input"
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
              />
            </label>
          </div>
          <div className="sdt-advanced-hint">
            可调整定位、颜色通道和单色转换；拖动下方预览也会自动进入自定义定位模式。
          </div>
        </div>
      </details>

      <div
        className={`sdt-image-drop sdt-image-editor ${dragging ? 'dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
      >
        {loadedImage ? (
          <>
            <canvas
              ref={previewCanvasRef}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragOriginRef.current = {
                  clientX: event.clientX,
                  clientY: event.clientY,
                  x: offsetX,
                  y: offsetY,
                };
                if (scaleMode !== 'custom') setScaleMode('custom');
              }}
              onPointerMove={(event) => {
                const origin = dragOriginRef.current;
                if (!origin) return;
                const rect = event.currentTarget.getBoundingClientRect();
                setOffsetX(
                  Math.round(origin.x + ((event.clientX - origin.clientX) / rect.width) * width)
                );
                setOffsetY(
                  Math.round(origin.y + ((event.clientY - origin.clientY) / rect.height) * height)
                );
              }}
              onPointerUp={() => {
                dragOriginRef.current = null;
              }}
            />
            <div className="hint">{imageName}</div>
            <div className="sub-hint">拖动画面定位；参数变化只更新预览</div>
          </>
        ) : (
          <button className="sdt-drop-placeholder" onClick={() => fileInputRef.current?.click()}>
            <FontAwesomeIcon icon={faCloudArrowUp} className="icon" />
            <span>拖拽图片至此，或点击选择</span>
            <small>PNG / JPG / BMP / WEBP / GIF 第一帧</small>
          </button>
        )}
      </div>
    </div>
  );
};
