/**
 * RGB565 相关工具：把 Canvas 像素转成 RGB565 字节、求内容外接矩形。
 * 用于 ST7796U2、ST7789V 等 RGB 屏的帧/区域推送（displayType === 'rgb565'）。
 */

/** RGB565 单个像素的两个字节在 SPI 总线上的发送顺序。 */
export type Rgb565ByteOrder = 'little' | 'big';

/**
 * 把 Canvas 的指定区域转成 RGB565 字节数组。
 *
 * 字节序默认保持原 ST7796 通路的小端 [lo,hi]；ST7789V 预设使用大端 [hi,lo]。
 * 例如红色 0xF800：little -> [0x00, 0xF8]，big -> [0xF8, 0x00]。
 *
 * @param canvas 源 Canvas
 * @param x/y/w/h 区域，默认整张 Canvas
 */
export function canvasToRGB565Bytes(
  canvas: HTMLCanvasElement,
  x = 0,
  y = 0,
  w?: number,
  h?: number,
  byteOrder: Rgb565ByteOrder = 'little'
): number[] {
  const W = w ?? canvas.width;
  const H = h ?? canvas.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(x, y, W, H).data;
  const out: number[] = new Array(W * H * 2);
  for (let i = 0, p = 0; i < img.length; i += 4, p += 2) {
    const r = img[i];
    const g = img[i + 1];
    const b = img[i + 2];
    const rgb565 = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
    const lo = rgb565 & 0xff;
    const hi = (rgb565 >> 8) & 0xff;
    out[p] = byteOrder === 'big' ? hi : lo;
    out[p + 1] = byteOrder === 'big' ? lo : hi;
  }
  return out;
}

/** 解析 #rrggbb 为 [r,g,b]。非法则返回 [0,0,0]。 */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/**
 * 求 Canvas 中与背景色不同的像素的外接矩形（局刷用）。
 * 用于只推文字/图片那块小区域，避免推整屏 307KB。
 *
 * @param canvas 源 Canvas
 * @param bgHex 背景色（#rrggbb），默认黑色
 * @param tol 抗锯齿容差（0-255），默认 32
 * @returns 外接矩形 {x,y,w,h}；若全屏都是背景色则返回 null
 */
export function getContentBBox(
  canvas: HTMLCanvasElement,
  bgHex = '#000000',
  tol = 32
): { x: number; y: number; w: number; h: number } | null {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, W, H).data;
  const [br, bgc, bb] = hexToRgb(bgHex);
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = img[i];
      const g = img[i + 1];
      const b = img[i + 2];
      if (Math.abs(r - br) > tol || Math.abs(g - bgc) > tol || Math.abs(b - bb) > tol) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
