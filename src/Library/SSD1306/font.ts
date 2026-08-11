/**
 * SSD1306 OLED 文字渲染工具 — 通过 TTF 字体 (Source Han Sans SC) 生成 SSD1306 帧缓冲字节。
 *
 * 实现原理：
 *   1. 用 FontFace API 加载 res/font/SourceHanSansSC-Normal-Min.ttf 到浏览器
 *   2. 用 Canvas 2D 在内存中绘制文字（黑底白字）
 *   3. 读取像素数据，按阈值转成 1-bit 单色位图
 *   4. 按 SSD1306 page-column 字节布局打包：
 *        - 每 page = 8 行像素，128 列宽
 *        - 每个字节代表一列中 8 个垂直像素，LSB = 该 page 的顶行
 *        - 帧缓冲顺序：page 0 col 0..127, page 1 col 0..127, ..., page 7 col 0..127
 *
 * 参考资料：
 *   - SSD1306 Datasheet Rev 1.1 (ReferenceCode/oled/SSD1306-Revision 1.1 (Charge Pump).pdf)
 *   - UG-2864TMBEG01 模块规格 (ReferenceCode/oled/SPEC UG-2864TMBEG01 .pdf)
 *
 * 注意：res/font/ 目录在项目根，使用 Vite 的 ?url 导入 — 见 src/vite-env.d.ts 中的类型声明。
 */

// 通过 Vite 的 ?url 后缀把 TTF 作为静态资源导入，构建时自动复制到 dist
// 路径：src/Library/SSD1306/ → ../../../res/font/ = 项目根/res/font/
import fontUrl from '../../../res/font/SourceHanSansSC-Normal-Min.ttf?url';

/** 字体在 document.fonts 中注册时使用的 family 名（避免与系统已装字体冲突）。 */
export const OLED_FONT_FAMILY = 'SourceHanSansSC-OLED';

/** 单例 Promise — 保证 TTF 全局只加载一次。 */
let fontLoadPromise: Promise<void> | null = null;

/**
 * 加载内置 Source Han Sans SC TTF 字体到 document.fonts。
 * 幂等 — 重复调用返回同一个 Promise；加载失败后允许下次重试。
 *
 * @returns 字体加载完成的 Promise
 */
export function loadOledFont(): Promise<void> {
  if (fontLoadPromise) return fontLoadPromise;
  fontLoadPromise = (async () => {
    const fontFace = new FontFace(OLED_FONT_FAMILY, `url(${fontUrl})`);
    await fontFace.load();
    document.fonts.add(fontFace);
  })().catch((e) => {
    console.error('[ssd1306Font] Font load failed:', e);
    fontLoadPromise = null; // 允许下次重试
    throw e;
  });
  return fontLoadPromise;
}

/** 把任意 Canvas 像素转成 SSD1306 字节布局的可选参数。 */
export interface CanvasToBytesOptions {
  /** 1-bit 阈值（0-255），像素亮度 ≥ 阈值则点亮。默认 128。 */
  threshold?: number;
  /** 反色：true 时已点亮像素变暗、未点亮像素变亮。默认 false。 */
  invert?: boolean;
}

/**
 * 把 Canvas 像素按 SSD1306 page-column 格式打包成字节数组。
 *
 * Canvas 高度必须是 8 的倍数（每 8 行像素 = 1 page）。
 * 阈值化基于红通道亮度（适合黑底白前景的图形）。
 *
 * @param canvas 源 Canvas（任意宽度，高度需为 8 的倍数）
 * @param options 阈值/反色参数
 * @returns 字节数组，长度 = canvas.width × (canvas.height / 8)，page-major 顺序
 */
export function canvasToSSD1306Bytes(
  canvas: HTMLCanvasElement,
  options: CanvasToBytesOptions = {}
): number[] {
  const threshold = options.threshold ?? 128;
  const invert = options.invert ?? false;
  const width = canvas.width;
  const height = canvas.height;

  if (height % 8 !== 0) {
    throw new Error(`SSD1306 height must be a multiple of 8 (got ${height})`);
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to acquire 2D canvas context');

  const img = ctx.getImageData(0, 0, width, height).data;
  const pages = height / 8;
  const out: number[] = new Array(width * pages);

  // 按 SSD1306 字节布局打包：page-major，每字节 LSB = 该 page 顶行像素
  for (let p = 0; p < pages; p++) {
    for (let xPos = 0; xPos < width; xPos++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const yPos = p * 8 + bit;
        // 取红通道作亮度（白色 R=255，黑色 R=0，灰阶介于其间）
        const idx = (yPos * width + xPos) * 4;
        const lit = img[idx] >= threshold;
        if (lit !== invert) byte |= 1 << bit; // 异或实现 invert
      }
      out[p * width + xPos] = byte;
    }
  }
  return out;
}

/** 文字渲染参数。 */
export interface SSD1306RenderOptions extends CanvasToBytesOptions {
  /** Canvas 宽度（像素）。SSD1306 全屏 = 128。默认 128。 */
  width?: number;
  /** Canvas 高度（像素），必须是 8 的倍数。默认 16（黄色区高度）。 */
  height?: number;
  /** 字号（像素高）。默认 height-2，留 1 像素上下边距。中文建议 14-16。 */
  fontSize?: number;
  /** 水平对齐。默认 'center'。 */
  align?: 'left' | 'center' | 'right';
}

/**
 * 把字符串渲染成 SSD1306 字节数组。
 *
 * 调用前必须先 await loadOledFont()，否则会回退到系统字体（可能不支持中文）。
 *
 * @param text 要显示的文字（支持中英日韩等任意 Unicode）
 * @param options 渲染参数，详见 SSD1306RenderOptions
 * @returns 字节数组，长度 = width × (height/8)，page-major 顺序，可直接通过 SPI 发往 SSD1306
 */
export function renderTextToSSD1306Bytes(
  text: string,
  options: SSD1306RenderOptions = {}
): number[] {
  const width = options.width ?? 128;
  const height = options.height ?? 16;
  const fontSize = options.fontSize ?? Math.max(8, height - 2);
  const align = options.align ?? 'center';

  // 创建离屏 Canvas（不挂到 DOM 上，避免浏览器额外开销）
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D canvas context');

  // 黑底白字 — 白色像素 = SSD1306 点亮
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  // 字体回退链：自家 OLED 字体 → 系统 sans-serif（防止字体没加载完时崩溃）
  ctx.font = `${fontSize}px "${OLED_FONT_FAMILY}", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  // 关闭抗锯齿 — 1-bit 屏幕上像素硬边比灰阶更清晰
  ctx.imageSmoothingEnabled = false;

  const drawX = align === 'left' ? 0 : align === 'right' ? width : width / 2;
  ctx.fillText(text, drawX, height / 2);

  return canvasToSSD1306Bytes(canvas, options);
}

/**
 * 把字节数组转成空格分隔的大写十六进制字符串。
 * 与现有 SPI workflow step 的 hex 数据格式一致。
 *
 * @example
 *   bytesToHex([0x12, 0xAB, 0xFF]) === '12 AB FF'
 */
export function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
