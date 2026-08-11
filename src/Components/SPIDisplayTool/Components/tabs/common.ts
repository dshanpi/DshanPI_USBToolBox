/**
 * Tab 公共类型定义。
 *
 * 所有 Tab 都遵循统一接口：先按内容方向渲染到内部 Canvas，再通过 onSend
 * 交给父组件统一旋转、生成预览并转换为屏幕需要的字节格式。
 *
 * 字节转换实现复用 Library/SSD1306/canvasToSSD1306Bytes，避免与字体渲染逻辑重复。
 */

import { canvasToSSD1306Bytes } from '../../../../Library/SSD1306';

/** 显示屏类型：决定推送通路。
 *  - monochrome-page：SSD1306 等 1-bit page 寻址屏，走 pushFramebuffer。
 *  - rgb565：ST7796 等 RGB565 屏，走 pushRgbRegion（CASET/RASET/RAMWR + 16bit）。 */
export type ScreenDisplayType = 'monochrome-page' | 'rgb565';

/** 内容顺时针旋转角度。 */
export type DisplayRotation = 0 | 90 | 180 | 270;

/**
 * 根据最终屏幕尺寸计算旋转前的内容画布尺寸。
 * 90°/270° 时先在交换宽高后的画布上排版，旋转后才能完整覆盖物理屏幕而不被裁剪。
 */
export function getContentCanvasSize(
  screenWidth: number,
  screenHeight: number,
  rotation: DisplayRotation
): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: screenHeight, height: screenWidth }
    : { width: screenWidth, height: screenHeight };
}

/** 把内容画布顺时针旋转到最终屏幕尺寸。 */
export function rotateCanvasToDisplay(
  source: HTMLCanvasElement,
  rotation: DisplayRotation,
  screenWidth: number,
  screenHeight: number
): HTMLCanvasElement {
  const output = document.createElement('canvas');
  output.width = screenWidth;
  output.height = screenHeight;
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire rotated canvas context');
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  if (rotation === 90) {
    ctx.translate(screenWidth, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(source, 0, 0, screenHeight, screenWidth);
  } else if (rotation === 180) {
    ctx.translate(screenWidth, screenHeight);
    ctx.rotate(Math.PI);
    ctx.drawImage(source, 0, 0, screenWidth, screenHeight);
  } else if (rotation === 270) {
    ctx.translate(0, screenHeight);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(source, 0, 0, screenHeight, screenWidth);
  } else {
    ctx.drawImage(source, 0, 0, screenWidth, screenHeight);
  }
  ctx.restore();
  return output;
}

/** 内容发送时可显式指定的源画布区域。 */
export interface ContentRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 各显示内容标签交给父组件处理的统一数据。 */
export interface ContentSendInfo {
  canvas: HTMLCanvasElement;
  description: string;
  bgColor?: string;
  /**
   * 必须写入的源画布区域。设置后优先于自动外接矩形与全屏刷新选项，
   * 主要用于扫描线等需要同时写入前景和背景像素的诊断图案。
   */
  region?: ContentRegion;
  /** 连续刷新时不为每一帧追加普通日志；底层错误仍会正常记录。 */
  silent?: boolean;
  /** 视频、扫描线、滚动文字等连续帧；成功后不写入普通发送历史。 */
  transient?: boolean;
  /** 内容已经是物理屏幕方向，重发历史/模板时避免再次旋转。 */
  prepared?: boolean;
  /** 写入发送历史、用于前后参数对比的内容参数。 */
  metadata?: Record<string, string | number | boolean>;
}

export type ContentSendStatus = 'sent' | 'preview-only' | 'cancelled' | 'failed' | 'busy';

export interface ContentSendResult {
  status: ContentSendStatus;
  bytes: number;
  elapsedMs: number;
}

export interface DisplayPreview {
  canvas: HTMLCanvasElement;
  description: string;
  region: ContentRegion | null;
}

export type TransferStatus = 'idle' | 'sending' | 'success' | 'cancelled' | 'error';

export interface DisplayTransferState {
  status: TransferStatus;
  description: string;
  sentBytes: number;
  totalBytes: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  throughputBytesPerSecond: number;
  frameTimeMs: number;
  actualFps: number;
  error?: string;
}

export interface DisplayHistoryEntry {
  id: number;
  timestamp: string;
  description: string;
  canvas: HTMLCanvasElement;
  region: ContentRegion | null;
  bytes: Uint8Array;
  displayType: ScreenDisplayType;
  width: number;
  height: number;
  elapsedMs: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface DisplayTemplate {
  id: string;
  name: string;
  description: string;
  imageDataUrl: string;
  width: number;
  height: number;
  createdAt: string;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * 把源画布上的区域坐标转换为旋转后的物理屏幕坐标。
 * 使用半开区间计算，区域尺寸在 90°/270° 时会交换。
 */
export function rotateRegionToDisplay(
  region: ContentRegion,
  rotation: DisplayRotation,
  sourceWidth: number,
  sourceHeight: number
): ContentRegion {
  if (rotation === 90) {
    return {
      x: sourceHeight - region.y - region.h,
      y: region.x,
      w: region.h,
      h: region.w,
    };
  }
  if (rotation === 180) {
    return {
      x: sourceWidth - region.x - region.w,
      y: sourceHeight - region.y - region.h,
      w: region.w,
      h: region.h,
    };
  }
  if (rotation === 270) {
    return {
      x: region.y,
      y: sourceWidth - region.x - region.w,
      w: region.h,
      h: region.w,
    };
  }
  return { ...region };
}

/** 给所有内容 Tab 通用的 props（父组件 MiddlePanel 传入）。 */
export interface TabContext {
  /** 旋转前内容画布宽度（像素）；90°/270° 时已与屏幕高度交换。 */
  width: number;
  /** 旋转前内容画布高度（像素）；最终输出画布仍使用真实屏幕尺寸。 */
  height: number;
  /** Tab 触发"发送"时调用：父组件负责旋转、取模、SPI 推送及 LCD 预览。 */
  onSend: (info: ContentSendInfo) => Promise<ContentSendResult>;
  /** 参数变化时提交待发送画面；null 表示当前标签暂无可预览内容。 */
  onPreview: (info: ContentSendInfo | null) => void;
  /** 强制向整块物理屏幕写入黑色，并清除发送预览。 */
  onClearDisplay: () => Promise<void>;
  /** 是否正在执行某个长任务（控件应禁用）。 */
  busy: boolean;
  /** 当前显示屏的数据类型，用于给测试内容提供适当提示。 */
  displayType: ScreenDisplayType;
  /** 从发送历史载入到绘制标签的可编辑底图。 */
  initialCanvas?: HTMLCanvasElement | null;
  onInitialCanvasConsumed?: () => void;
}

/**
 * 把 RGBA 像素 Canvas 转成 SSD1306 page-major 字节数组。
 * 直接复用 Library/SSD1306/canvasToSSD1306Bytes —— 此处仅作为别名导出，
 * 让 Tab 文件只导一个 common 模块就够。
 *
 * @param canvas 源 Canvas（高度需为 8 的倍数）
 * @param threshold 1-bit 阈值（0-255），默认 128
 */
export function canvasToBytes(canvas: HTMLCanvasElement, threshold = 128): number[] {
  return canvasToSSD1306Bytes(canvas, { threshold });
}
