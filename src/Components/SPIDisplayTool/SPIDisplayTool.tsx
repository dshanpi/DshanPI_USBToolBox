import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { sharedDevice } from '../SPITool/sharedDevice';
import { loadOledFont } from '../../Library/SSD1306';
import { useModalDialog } from '../../Hooks';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { useSpiEngine, type DisplayCommandRow, type SpiConfig } from './hooks/useSpiEngine';
import {
  canvasToBytes,
  rotateCanvasToDisplay,
  rotateRegionToDisplay,
  type ContentRegion,
  type ContentSendInfo,
  type ContentSendResult,
  type DisplayHistoryEntry,
  type DisplayPreview,
  type DisplayRotation,
  type DisplayTemplate,
  type DisplayTransferState,
  type ScreenDisplayType,
} from './Components/tabs/common';
import { LeftPanel } from './Components/LeftPanel';
import { MiddlePanel, type ContentTab } from './Components/MiddlePanel';
import { RightPanel, type LogEntry } from './Components/RightPanel';
import {
  asRecord,
  optionalNumber,
  optionalString,
  registerAssistantContributor,
} from '../AIAssistant/assistantBridge';
import {
  canvasToRGB565Bytes,
  getContentBBox,
  type Rgb565ByteOrder,
} from './Components/tabs/rgb565';
import './SPIDisplayTool.css';

/** 分辨率预设条目类型。 */
export interface ResolutionPreset {
  /** 选项 key，'custom' 为可自定义输入 */
  key: string;
  /** 用户可见的标签 */
  label: string;
  /** 该预设的逻辑宽度（像素） */
  width: number;
  /** 该预设的逻辑高度（像素，需为 8 的倍数 —— SSD1306 page 整除要求） */
  height: number;
}

/** 内置分辨率预设 —— 仅列出常见 SPI 单色/彩屏分辨率，不绑定特定型号。
 *  比如同样 128×64 可能是 SSD1306 / SH1106 / UC1701 等多个驱动 IC，
 *  这里只关心 Canvas 大小，初始化命令由用户的"初始化命令表"提供。 */
const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { key: '128x32', label: '128 × 32', width: 128, height: 32 },
  { key: '128x64', label: '128 × 64', width: 128, height: 64 },
  { key: '128x128', label: '128 × 128', width: 128, height: 128 },
  { key: '135x240', label: '135 × 240', width: 135, height: 240 },
  { key: '240x240', label: '240 × 240', width: 240, height: 240 },
  { key: '240x135', label: '240 × 135', width: 240, height: 135 },
  { key: '240x320', label: '240 × 320', width: 240, height: 320 },
  { key: '320x240', label: '320 × 240', width: 320, height: 240 },
  { key: '320x480', label: '320 × 480', width: 320, height: 480 },
  { key: 'custom', label: '自定义', width: 128, height: 64 },
];

/**
 * SSD1306 (UG-2864TMBEG01) 默认初始化命令表 —— 对照数据手册 SSD1306 Rev 1.1 + 参考代码
 * spi_oled.c (ReferenceCode/04_oled_use_spidev_ok/) 校正后的版本，可点亮屏幕不花屏。
 *
 * 关键值的说明（来自数据手册第 10.1 节）：
 *   AE       — 显示关闭
 *   A8 3F    — MUX 1/64（128×64 屏必须 0x3F；0x1F 是 128×32 屏才用）
 *   D3 00    — 显示偏移 = 0（10.1.15）
 *   40       — 显示起始行 = 0（10.1.6）
 *   8D 14    — 电荷泵开启（使能内部 7-9V 升压，VCC 由内部生成）
 *   A1       — Segment Re-map：列 127→SEG0（与 C8 配合实现 180° 旋转，适配大多数 0.96" 模块）
 *   C8       — COM 输出扫描方向反向（COM[N-1]→COM0）
 *   DA 12    — COM Pins 硬件配置：交替（Alternative）+ 不左右翻转（标准 128×64 模块）
 *   81 CF    — 对比度（参考代码用 CF 更亮；0x7F 会偏暗）
 *   D9 F1    — Pre-charge Period（关键！缺失会导致驱动不足产生花屏；参考代码 F1）
 *   DB 30    — VCOMH 电平 0.83×Vcc（关键！缺失会导致 OLED 闪烁和不稳定显示）
 *   A4       — 输出从 GDDRAM 读（不是强制全亮 A5）
 *   A6       — 正常显示（不反相）
 *   D5 80    — 时钟分频/振荡频率：bit[3:0]=8 是复位默认值，
 *              过去用 D5 00 会让振荡器频率降到最低 → 显示时序乱 → 花屏。改成 80 修复
 *   AF       — 显示开启
 *
 * 顺序参考 spi_oled.c oled_init() 实际能正常点亮 0.96" 黄蓝屏的命令序列。
 */
const DEFAULT_SSD1306_INIT_ROWS: Omit<DisplayCommandRow, 'id'>[] = [
  { type: 'delay', data: '100000' }, // 上电等待
  { type: 'cmd', data: 'AE' }, // 显示关闭
  { type: 'cmd', data: '00' }, // 列低地址 = 0
  { type: 'cmd', data: '10' }, // 列高地址 = 0
  { type: 'cmd', data: '40' }, // 起始行 = 0
  { type: 'cmd', data: 'B0' }, // 页地址 = 0
  { type: 'cmd', data: '81 CF' }, // 对比度（0xCF 亮度合适，过暗用 0x7F）
  { type: 'cmd', data: 'A1' }, // Segment Re-map 列翻转
  { type: 'cmd', data: 'A6' }, // 正常显示（非反相）
  { type: 'cmd', data: 'A8 3F' }, // MUX = 1/64（128×64 屏必须）
  { type: 'cmd', data: 'C8' }, // COM 扫描方向反向
  { type: 'cmd', data: 'D3 00' }, // 显示偏移 = 0
  { type: 'cmd', data: 'D5 80' }, // 时钟分频/振荡频率（复位默认 0x80，原 0x00 会花屏！）
  { type: 'cmd', data: 'D9 F1' }, // Pre-charge Period（关键，缺失会驱动不足）
  { type: 'cmd', data: 'DA 12' }, // COM Pins 硬件配置（交替）
  { type: 'cmd', data: 'DB 30' }, // VCOMH 电平（关键，缺失会闪烁/花屏）
  { type: 'cmd', data: '8D 14' }, // 电荷泵开启

  // 清屏：逐页（B0~B7）写 64+64 字节 0（每页拆两次，避免 CH347 缓冲溢出）。
  // 实测一次性 128 字节在连续发送 8 次时后面会丢包，64 字节更稳。
  // 逐页写，每页拆两半：Bx+00+10 → 64×00 → 64×00
  { type: 'cmd', data: 'B0' },
  { type: 'cmd', data: '00' },
  { type: 'cmd', data: '10' },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  { type: 'cmd', data: 'B1' },
  { type: 'cmd', data: '00' },
  { type: 'cmd', data: '10' },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  { type: 'cmd', data: 'B2' },
  { type: 'cmd', data: '00' },
  { type: 'cmd', data: '10' },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  { type: 'cmd', data: 'B3' },
  { type: 'cmd', data: '00' },
  { type: 'cmd', data: '10' },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  { type: 'cmd', data: 'B4' },
  { type: 'cmd', data: '00' },
  { type: 'cmd', data: '10' },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  { type: 'cmd', data: 'B5' },
  { type: 'cmd', data: '00' },
  { type: 'cmd', data: '10' },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  { type: 'cmd', data: 'B6' },
  { type: 'cmd', data: '00' },
  { type: 'cmd', data: '10' },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  { type: 'cmd', data: 'B7' },
  { type: 'cmd', data: '00' },
  { type: 'cmd', data: '10' },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },
  {
    type: 'data',
    data: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
  },

  { type: 'cmd', data: 'AF' }, // 显示开启（此时 GDDRAM 已全清 → 黑屏，不花屏）
  { type: 'delay', data: '100000' }, // 数据手册 tAF：AFh 后 SEG/COM 需 100ms 才完全 ON。延时不足会导致首次发送显示不稳（多发几次才正常）
];

/**
 * ST7789V 1.14 英寸 8 针蓝板 135×240 竖屏初始化表（实物验证通过）。
 *
 * 参数逐项复刻蓝板资料根目录中的面板专用初始化表
 * “1.14 寸初始化HSD+ST7789V-2018-12-06.txt”（N114-2413THBIG01-H13），
 * SPI 时序按配套参考例程的实际波形配置为 Mode 3、MSB First（例程在复位前及
 * 字节之间保持 SCK 高电平）。MADCTL=0x00，
 * 显示窗口为 X=52..186、Y=40..279，因此逻辑坐标偏移为 X+52、Y+40。
 */
const DEFAULT_ST7789V_BLUE_114_135X240_INIT_ROWS: Omit<DisplayCommandRow, 'id'>[] = [
  { type: 'rst', data: 'LOW' },
  { type: 'delay', data: '100000' },
  { type: 'rst', data: 'HIGH' },
  { type: 'delay', data: '100000' },
  { type: 'bl', data: 'HIGH' },
  { type: 'cmd', data: '11' },
  { type: 'delay', data: '120000' },
  { type: 'cmd', data: '36' },
  { type: 'data', data: '00' },
  { type: 'cmd', data: '3A' },
  { type: 'data', data: '05' },
  { type: 'cmd', data: '21' },
  { type: 'cmd', data: 'B2' },
  { type: 'data', data: '05 05 00 33 33' },
  { type: 'cmd', data: 'B7' },
  { type: 'data', data: '23' },
  { type: 'cmd', data: 'BB' },
  { type: 'data', data: '22' },
  { type: 'cmd', data: 'C0' },
  { type: 'data', data: '2C' },
  { type: 'cmd', data: 'C2' },
  { type: 'data', data: '01' },
  { type: 'cmd', data: 'C3' },
  { type: 'data', data: '13' },
  { type: 'cmd', data: 'C4' },
  { type: 'data', data: '20' },
  { type: 'cmd', data: 'C6' },
  { type: 'data', data: '0F' },
  { type: 'cmd', data: 'D0' },
  { type: 'data', data: 'A4 A1' },
  { type: 'cmd', data: 'D6' },
  { type: 'data', data: 'A1' },
  { type: 'cmd', data: 'E0' },
  { type: 'data', data: '70 06 0C 08 09 27 2E 34 46 37 13 13 25 2A' },
  { type: 'cmd', data: 'E1' },
  { type: 'data', data: '70 04 08 09 07 03 2C 42 42 38 14 14 27 2C' },
  { type: 'cmd', data: '29' },
  { type: 'delay', data: '100000' },
];

/**
 * ST7735S 0.96 英寸 8 针蓝板 80×160 竖屏初始化表。
 *
 * 参数逐项取自配套资料“0.96寸初始化BOE+ST7735S.c”
 * （N096-1608TBBIG11-H13 / Newvision）。该面板使用 RGB565、MSB First，
 * 可视窗口为 X=24..103、Y=0..159，因此逻辑坐标偏移为 X+24、Y+0。
 * 参考例程在每个数据位的上升沿采样且字节结束后保持 SCK 高电平，
 * CH347 主预设使用与已验证 ST7789V 蓝板相同的 Mode 3 低速配置。
 */
const DEFAULT_ST7735S_BLUE_096_80X160_INIT_ROWS: Omit<DisplayCommandRow, 'id'>[] = [
  { type: 'rst', data: 'LOW' },
  { type: 'delay', data: '100000' },
  { type: 'rst', data: 'HIGH' },
  { type: 'delay', data: '100000' },
  { type: 'bl', data: 'HIGH' },
  { type: 'cmd', data: '11' },
  { type: 'delay', data: '120000' },
  { type: 'cmd', data: 'B1' },
  { type: 'data', data: '05 3C 3C' },
  { type: 'cmd', data: 'B2' },
  { type: 'data', data: '05 3C 3C' },
  { type: 'cmd', data: 'B3' },
  { type: 'data', data: '05 3C 3C 05 3C 3C' },
  { type: 'cmd', data: 'B4' },
  { type: 'data', data: '03' },
  { type: 'cmd', data: 'C0' },
  { type: 'data', data: '0E 0E 04' },
  { type: 'cmd', data: 'C1' },
  { type: 'data', data: 'C0' },
  { type: 'cmd', data: 'C2' },
  { type: 'data', data: '0D 00' },
  { type: 'cmd', data: 'C3' },
  { type: 'data', data: '8D 2A' },
  { type: 'cmd', data: 'C4' },
  { type: 'data', data: '8D EE' },
  { type: 'cmd', data: 'C5' },
  { type: 'data', data: '04' },
  { type: 'cmd', data: '36' },
  { type: 'data', data: '08' },
  { type: 'cmd', data: '3A' },
  { type: 'data', data: '05' },
  { type: 'cmd', data: 'E0' },
  { type: 'data', data: '05 1A 0B 15 3D 38 2E 30 2D 28 30 3B 00 01 02 10' },
  { type: 'cmd', data: 'E1' },
  { type: 'data', data: '05 1A 0B 15 36 2E 28 2B 2B 28 30 3B 00 01 02 10' },
  { type: 'cmd', data: '29' },
  { type: 'delay', data: '100000' },
];

/**
 * ST7789VW 1.33 英寸 7 针蓝板 240×240 初始化表。
 *
 * 参数逐项取自配套资料“1.33寸初始化HSD+ST7789.txt”；参考例程说明该模块
 * CS 已在 PCB 上直接接地、RGB565 高字节先发，并定义可视窗口为 0..239。
 * 例程还要求复位前 SCK 为高，因此 CH347 预设使用 Mode 3。
 */
const DEFAULT_ST7789VW_BLUE_133_240X240_INIT_ROWS: Omit<DisplayCommandRow, 'id'>[] = [
  { type: 'rst', data: 'LOW' },
  { type: 'delay', data: '100000' },
  { type: 'rst', data: 'HIGH' },
  { type: 'delay', data: '100000' },
  { type: 'bl', data: 'HIGH' },
  { type: 'cmd', data: '11' },
  { type: 'delay', data: '120000' },
  { type: 'cmd', data: '36' },
  { type: 'data', data: '00' },
  { type: 'cmd', data: '3A' },
  { type: 'data', data: '05' },
  { type: 'cmd', data: '21' },
  { type: 'cmd', data: 'B2' },
  { type: 'data', data: '1F 1F 00 33 33' },
  { type: 'cmd', data: 'B7' },
  { type: 'data', data: '12' },
  { type: 'cmd', data: 'BB' },
  { type: 'data', data: '2A' },
  { type: 'cmd', data: 'C0' },
  { type: 'data', data: '2C' },
  { type: 'cmd', data: 'C2' },
  { type: 'data', data: '01' },
  { type: 'cmd', data: 'C3' },
  { type: 'data', data: '07' },
  { type: 'cmd', data: 'C4' },
  { type: 'data', data: '20' },
  { type: 'cmd', data: 'C6' },
  { type: 'data', data: '13' },
  { type: 'cmd', data: 'D0' },
  { type: 'data', data: 'A4 A1' },
  { type: 'cmd', data: 'D6' },
  { type: 'data', data: 'A1' },
  { type: 'cmd', data: 'E0' },
  { type: 'data', data: 'F0 06 0D 0B 0A 07 2E 43 45 38 14 13 25 29' },
  { type: 'cmd', data: 'E1' },
  { type: 'data', data: 'F0 07 0A 08 07 23 2E 33 44 3A 16 17 26 2C' },
  { type: 'cmd', data: '11' },
  { type: 'delay', data: '100000' },
  { type: 'cmd', data: '29' },
  { type: 'delay', data: '100000' },
];

/** localStorage 中保存用户自定义屏幕预设的 key。 */
const SCREEN_PRESET_STORAGE_KEY = 'spi-display-screen-presets';

/** 屏幕预设的存储结构：屏型号 → 初始化命令表（不含 id，加载时重新分配）。 */
export interface SavedScreenPreset {
  /** 用户起的名字，下拉里显示这个 */
  name: string;
  /** 可选的分辨率提示（仅用于切换时同步画布尺寸；不强制） */
  width?: number;
  height?: number;
  /** 显示类型（用户预设可选；缺省按 monochrome-page 处理） */
  displayType?: ScreenDisplayType;
  /** RGB565 像素字节序与可视区域在控制器 GRAM 中的地址偏移。 */
  rgb565ByteOrder?: Rgb565ByteOrder;
  columnOffset?: number;
  rowOffset?: number;
  /** 初始化命令表，持久化时去掉 id */
  rows: Array<Omit<DisplayCommandRow, 'id'>>;
}

interface BuiltinScreenPreset {
  key: string;
  name: string;
  width: number;
  height: number;
  displayType: ScreenDisplayType;
  rgb565ByteOrder?: Rgb565ByteOrder;
  columnOffset?: number;
  rowOffset?: number;
  spiMode?: 0 | 1 | 2 | 3;
  spiFrequencyHz?: number;
  spiSpeedKey?: string;
  spiDataBits?: 8 | 16;
  spiByteOrder?: 0 | 1;
  rows: Omit<DisplayCommandRow, 'id'>[];
}

const BUILTIN_SCREEN_PRESETS: BuiltinScreenPreset[] = [
  {
    key: '__builtin:ssd1306-128x64',
    name: 'SSD1306 OLED 128×64',
    width: 128,
    height: 64,
    displayType: 'monochrome-page',
    rows: DEFAULT_SSD1306_INIT_ROWS,
  },
  {
    key: '__builtin:st7789v-blue-114-135x240',
    name: 'ST7789V 蓝板 1.14" 135×240',
    width: 135,
    height: 240,
    displayType: 'rgb565',
    rgb565ByteOrder: 'big',
    columnOffset: 52,
    rowOffset: 40,
    spiMode: 3,
    spiFrequencyHz: 937_500,
    spiSpeedKey: '0.9375',
    spiDataBits: 8,
    spiByteOrder: 1,
    rows: DEFAULT_ST7789V_BLUE_114_135X240_INIT_ROWS,
  },
  {
    key: '__builtin:st7735s-blue-096-80x160',
    name: 'ST7735S 蓝板 0.96" 80×160',
    width: 80,
    height: 160,
    displayType: 'rgb565',
    rgb565ByteOrder: 'big',
    columnOffset: 24,
    rowOffset: 0,
    spiMode: 3,
    spiFrequencyHz: 937_500,
    spiSpeedKey: '0.9375',
    spiDataBits: 8,
    spiByteOrder: 1,
    rows: DEFAULT_ST7735S_BLUE_096_80X160_INIT_ROWS,
  },
  {
    key: '__builtin:st7789vw-blue-133-240x240',
    name: 'ST7789VW 蓝板 1.33" 240×240',
    width: 240,
    height: 240,
    displayType: 'rgb565',
    rgb565ByteOrder: 'big',
    columnOffset: 0,
    rowOffset: 0,
    spiMode: 3,
    spiFrequencyHz: 937_500,
    spiSpeedKey: '0.9375',
    spiDataBits: 8,
    spiByteOrder: 1,
    rows: DEFAULT_ST7789VW_BLUE_133_240X240_INIT_ROWS,
  },
];

/** 从 localStorage 读取用户屏幕预设列表。 */
function loadScreenPresets(): SavedScreenPreset[] {
  try {
    const raw = localStorage.getItem(SCREEN_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is SavedScreenPreset => p && typeof p.name === 'string' && Array.isArray(p.rows)
    );
  } catch {
    return [];
  }
}

/** 持久化用户屏幕预设列表。 */
function saveScreenPresets(list: SavedScreenPreset[]): void {
  try {
    localStorage.setItem(SCREEN_PRESET_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota or disabled */
  }
}

/** 给当前时间生成 HH:MM:SS.mmm 字符串。 */
function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** 把内容请求的刷新区域约束到输出画布内，避免越界读取 Canvas 像素。 */
function normalizeContentRegion(
  region: ContentRegion,
  canvasWidth: number,
  canvasHeight: number
): ContentRegion | null {
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const right = Math.min(canvasWidth, Math.ceil(region.x + region.w));
  const bottom = Math.min(canvasHeight, Math.ceil(region.y + region.h));
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const clone = document.createElement('canvas');
  clone.width = source.width;
  clone.height = source.height;
  clone.getContext('2d')?.drawImage(source, 0, 0);
  return clone;
}

const INITIAL_TRANSFER_STATE: DisplayTransferState = {
  status: 'idle',
  description: '',
  sentBytes: 0,
  totalBytes: 0,
  elapsedMs: 0,
  estimatedRemainingMs: 0,
  throughputBytesPerSecond: 0,
  frameTimeMs: 0,
  actualFps: 0,
};

interface PreparedContent {
  preview: DisplayPreview;
  /** null 表示整屏传输；empty=true 表示自动局刷没有找到非背景内容。 */
  transferRegion: ContentRegion | null;
  empty: boolean;
}

const DISPLAY_TEMPLATE_STORAGE_KEY = 'usbtoolbox.spi-display.content-templates.v1';

function loadDisplayTemplates(): DisplayTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISPLAY_TEMPLATE_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as DisplayTemplate[]).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveDisplayTemplates(templates: DisplayTemplate[]): void {
  try {
    localStorage.setItem(DISPLAY_TEMPLATE_STORAGE_KEY, JSON.stringify(templates.slice(0, 8)));
  } catch {
    // 图片模板可能超过浏览器存储配额；调用方会保留本次会话中的模板。
  }
}

/**
 * SPI 点屏调试工具主组件。
 *
 * 三栏布局：
 *   - 左：硬件参数 + 初始化命令表 + 操作按钮
 *   - 中：5 Tab 显示内容编辑（文本/图片/视频/绘制/测试）
 *   - 右：LCD 模拟预览 + 日志控制台
 *
 * 与 SPI Tool 共享 sharedDevice 单例（同一 CH347 设备状态），
 * 所有 SPI/GPIO 调用通过 useSpiEngine hook 封装到后端 ch347_* 命令。
 */
export const SPIDisplayTool: React.FC = () => {
  const deviceState = useSyncExternalStore(sharedDevice.subscribe, sharedDevice.getState);

  // 监听自动断开的 effect 在 log 定义之后（log 是依赖）

  // 自定义模态弹窗 —— 取代浏览器原生 prompt/confirm（避免显示 "localhost:3030"）。
  // modalNode 在 JSX 最后渲染；showPrompt/showConfirm/showAlert 是 async API
  const { showPrompt, showConfirm, showAlert, modalNode } = useModalDialog();

  // ─── SPI 配置 ─────────────────────────────────────
  // 全部参数都在 UI 中暴露给用户（参考 SPI Tool），与 useSpiEngine 的 SpiConfig 字段一一对应
  const [spiMode, setSpiMode] = useState(0);
  const [frequencyHz, setFrequencyHz] = useState(7_500_000);
  const [spiSpeed, setSpiSpeed] = useState('7.5');
  const [spiBits, setSpiBits] = useState('8');
  const [spiBitOrder, setSpiBitOrder] = useState('1'); // 1=MSB, 0=LSB
  // 用 useMemo 保证 spiCfg 引用稳定，避免 useCallback 依赖每次都失效
  const spiCfg: SpiConfig = useMemo(
    () => ({
      mode: spiMode,
      frequencyHz,
      cs: 0 as const,
      dataBits: (parseInt(spiBits) === 16 ? 16 : 8) as 8 | 16,
      byteOrder: (parseInt(spiBitOrder) === 0 ? 0 : 1) as 0 | 1,
    }),
    [spiMode, frequencyHz, spiBits, spiBitOrder]
  );

  // ─── 分辨率 ─────────────────────────────────────
  // 默认 128×64（最常见的 SSD1306/SH1106 OLED 尺寸）
  const [resolutionKey, setResolutionKey] = useState('128x64');
  const [width, setWidth] = useState(128);
  const [height, setHeight] = useState(64);

  /** 切换分辨率预设时同步宽高（不再绑定推荐频率 —— 用户自己选 SPI Speed）。 */
  const handleResolutionPresetChange = useCallback((key: string) => {
    setResolutionKey(key);
    const preset = RESOLUTION_PRESETS.find((r) => r.key === key);
    if (preset && key !== 'custom') {
      setWidth(preset.width);
      setHeight(preset.height);
    }
  }, []);

  // ─── 命令表 + 屏幕预设 state ──────────────────
  // state 在这里，callback 在 log 定义之后（log 是依赖）。
  // 命令表默认留空 —— 用户需要时从屏幕预设下拉里点 Load 加载内置 SSD1306 预设
  const [cmdRows, setCmdRows] = useState<DisplayCommandRow[]>([]);
  // 屏幕预设系统：内置 + 用户保存。持久化到 localStorage，与 SPI Tool 的预设系统风格一致。
  const [userScreenPresets, setUserScreenPresets] = useState<SavedScreenPreset[]>(() =>
    loadScreenPresets()
  );
  const [selectedScreenPreset, setSelectedScreenPreset] = useState<string>(
    BUILTIN_SCREEN_PRESETS[0]?.key ?? ''
  );
  // 当前预设的显示类型（决定推送通路：monochrome-page=pushFramebuffer, rgb565=pushRgbRegion）
  const [displayType, setDisplayType] = useState<ScreenDisplayType>(
    BUILTIN_SCREEN_PRESETS[0]?.displayType ?? 'monochrome-page'
  );
  const [rgb565ByteOrder, setRgb565ByteOrder] = useState<Rgb565ByteOrder>(
    BUILTIN_SCREEN_PRESETS[0]?.rgb565ByteOrder ?? 'little'
  );
  const [columnOffset, setColumnOffset] = useState(BUILTIN_SCREEN_PRESETS[0]?.columnOffset ?? 0);
  const [rowOffset, setRowOffset] = useState(BUILTIN_SCREEN_PRESETS[0]?.rowOffset ?? 0);
  // 单色 page 屏才要求高度按 8 对齐；RGB 屏必须保留 135 等真实像素高度。
  const canvasHeight = displayType === 'monochrome-page' ? Math.ceil(height / 8) * 8 : height;
  // 推送范围：full=整屏，partial=只推内容外接矩形（仅 rgb565 用；ST7796 整屏 307KB≈100s 太慢，默认局刷）
  const [refreshMode, setRefreshMode] = useState<'full' | 'partial'>('partial');
  const [refreshRegionMode, setRefreshRegionMode] = useState<'auto' | 'manual'>('auto');
  const [manualRefreshRegion, setManualRefreshRegion] = useState<ContentRegion>({
    x: 0,
    y: 0,
    w: width,
    h: canvasHeight,
  });

  // ─── Tab / 预览 / 日志 ──────────────────────
  const [activeTab, setActiveTab] = useState<ContentTab>('text');
  const [contentRotations, setContentRotations] = useState<Record<ContentTab, DisplayRotation>>({
    text: 0,
    image: 0,
    video: 0,
    draw: 0,
    test: 0,
  });
  const contentRotation = contentRotations[activeTab];
  const handleContentRotationChange = useCallback(
    (rotation: DisplayRotation) => {
      setContentRotations((current) => ({ ...current, [activeTab]: rotation }));
    },
    [activeTab]
  );
  const [draftPreview, setDraftPreview] = useState<DisplayPreview | null>(null);
  const [sentPreview, setSentPreview] = useState<DisplayPreview | null>(null);
  const [compareEntry, setCompareEntry] = useState<DisplayHistoryEntry | null>(null);
  const [transferState, setTransferState] = useState<DisplayTransferState>(INITIAL_TRANSFER_STATE);
  const [displayHistory, setDisplayHistory] = useState<DisplayHistoryEntry[]>([]);
  const [editorSeed, setEditorSeed] = useState<HTMLCanvasElement | null>(null);
  const [displayTemplates, setDisplayTemplates] = useState<DisplayTemplate[]>(loadDisplayTemplates);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const transferAbortRef = useRef<AbortController | null>(null);
  const lastSendInfoRef = useRef<ContentSendInfo | null>(null);
  const historyIdRef = useRef(1);
  const throughputRef = useRef(3000);
  const lastFrameCompletedAtRef = useRef(0);

  useEffect(() => {
    setManualRefreshRegion(
      (current) =>
        normalizeContentRegion(current, width, canvasHeight) ?? {
          x: 0,
          y: 0,
          w: width,
          h: canvasHeight,
        }
    );
  }, [canvasHeight, width]);

  /** 追加日志。autoLevel 根据消息内容自动判断（"error" 字样 → error）。 */
  const log = useCallback((message: string, isError = false) => {
    let level: LogEntry['level'] = 'info';
    if (isError || /error|fail|失败|错误/i.test(message)) level = 'error';
    else if (/ok|success|成功|completed|done/i.test(message)) level = 'success';
    setLogs((prev) => {
      const next = [...prev, { time: nowTime(), message, level }];
      if (next.length > 200) next.shift();
      return next;
    });
  }, []);

  // 监听自动断开：设备被拔掉时 sharedDevice 会把 autoDisconnected 置 true + online 置 false。
  // 用 ref 记录上一次状态，避免重复 log。
  const lastAutoDisconnected = useRef(false);
  useEffect(() => {
    if (deviceState.autoDisconnected && !lastAutoDisconnected.current) {
      log('⚠ 设备已断开连接（USB 被拔出或设备消失）', true);
    }
    lastAutoDisconnected.current = deviceState.autoDisconnected;
  }, [deviceState.autoDisconnected, log]);

  // ─── SPI 引擎 ───────────────────────────────
  const engine = useSpiEngine({
    deviceIndex: deviceState.deviceIndex ?? 0,
    connected: deviceState.online,
    connectionSession: deviceState.sessionId,
    log,
  });

  useEffect(() => {
    return registerAssistantContributor({
      id: 'spi-display',
      tool: 'spi-display-tool',
      getContext: () => ({
        deviceOnline: deviceState.online,
        config: {
          mode: spiMode,
          frequencyHz,
          cs: 0,
          bits: Number(spiBits),
          bitOrder: spiBitOrder === '1' ? 'MSB' : 'LSB',
          width,
          height,
          displayType,
          rgb565ByteOrder,
          columnOffset,
          rowOffset,
          refreshMode,
        },
        initializationRows: cmdRows.map(({ type, data }) => ({ type, data })),
        recentLogs: logs.slice(-35),
      }),
      supports: (action) =>
        action.type === 'spi-display.configure' || action.type === 'spi-display.init.replace',
      apply: (action) => {
        const payload = asRecord(action.payload);
        if (action.type === 'spi-display.configure') {
          const mode = optionalNumber(payload.mode, 'mode');
          const nextFrequency = optionalNumber(payload.frequencyHz, 'frequencyHz');
          const cs = optionalNumber(payload.cs, 'cs');
          const bits = optionalNumber(payload.bits, 'bits');
          const bitOrder = optionalString(payload.bitOrder, 'bitOrder');
          const nextWidth = optionalNumber(payload.width, 'width');
          const nextHeight = optionalNumber(payload.height, 'height');
          const nextDisplayType = optionalString(payload.displayType, 'displayType');
          const nextByteOrder = optionalString(payload.rgb565ByteOrder, 'rgb565ByteOrder');
          const nextColumnOffset = optionalNumber(payload.columnOffset, 'columnOffset');
          const nextRowOffset = optionalNumber(payload.rowOffset, 'rowOffset');
          if (mode !== undefined && ![0, 1, 2, 3].includes(mode))
            throw new Error('SPI Mode 必须是 0–3');
          if (
            nextFrequency !== undefined &&
            (!Number.isInteger(nextFrequency) ||
              nextFrequency < 100_000 ||
              nextFrequency > 60_000_000)
          ) {
            throw new Error('SPI 频率必须在 100 KHz–60 MHz 之间');
          }
          if (cs !== undefined && cs !== 0) throw new Error('当前硬件仅支持 CS0');
          if (bits !== undefined && ![8, 16].includes(bits))
            throw new Error('数据位必须是 8 或 16');
          if (bitOrder !== undefined && !['MSB', 'LSB'].includes(bitOrder))
            throw new Error('位序必须是 MSB 或 LSB');
          if (
            nextWidth !== undefined &&
            (!Number.isInteger(nextWidth) || nextWidth < 1 || nextWidth > 2048)
          )
            throw new Error('屏幕宽度必须在 1–2048 之间');
          if (
            nextHeight !== undefined &&
            (!Number.isInteger(nextHeight) || nextHeight < 1 || nextHeight > 2048)
          )
            throw new Error('屏幕高度必须在 1–2048 之间');
          if (
            nextDisplayType !== undefined &&
            !['monochrome-page', 'rgb565'].includes(nextDisplayType)
          )
            throw new Error('显示类型无效');
          if (nextByteOrder !== undefined && !['big', 'little'].includes(nextByteOrder))
            throw new Error('RGB565 字节序无效');
          if (
            nextColumnOffset !== undefined &&
            (!Number.isInteger(nextColumnOffset) || nextColumnOffset < 0 || nextColumnOffset > 4095)
          )
            throw new Error('列偏移超出范围');
          if (
            nextRowOffset !== undefined &&
            (!Number.isInteger(nextRowOffset) || nextRowOffset < 0 || nextRowOffset > 4095)
          )
            throw new Error('行偏移超出范围');

          if (mode !== undefined) setSpiMode(Math.trunc(mode));
          if (nextFrequency !== undefined) {
            const speedOptions = [0.46875, 0.9375, 1.875, 3.75, 7.5, 15, 30, 60];
            const requestedMhz = nextFrequency / 1_000_000;
            const closest = speedOptions.reduce((best, item) =>
              Math.abs(item - requestedMhz) < Math.abs(best - requestedMhz) ? item : best
            );
            setFrequencyHz(Math.round(closest * 1_000_000));
            setSpiSpeed(String(closest));
          }
          if (bits !== undefined) setSpiBits(String(Math.trunc(bits)));
          if (bitOrder !== undefined) setSpiBitOrder(bitOrder === 'MSB' ? '1' : '0');
          if (nextWidth !== undefined) setWidth(Math.trunc(nextWidth));
          if (nextHeight !== undefined) setHeight(Math.trunc(nextHeight));
          if (nextDisplayType !== undefined) setDisplayType(nextDisplayType as ScreenDisplayType);
          if (nextByteOrder !== undefined) setRgb565ByteOrder(nextByteOrder as Rgb565ByteOrder);
          if (nextColumnOffset !== undefined) setColumnOffset(Math.trunc(nextColumnOffset));
          if (nextRowOffset !== undefined) setRowOffset(Math.trunc(nextRowOffset));
          engine.markUnconfigured();
          log('AI 助手已成功填入点屏配置；请核对后手动运行初始化');
          return { message: '点屏 SPI 与画布配置' };
        }

        if (!Array.isArray(payload.rows) || payload.rows.length < 1 || payload.rows.length > 2000) {
          throw new Error('初始化序列必须包含 1–2000 行');
        }
        const allowed: DisplayCommandRow['type'][] = [
          'cmd',
          'data',
          'delay',
          'cs',
          'dc',
          'rst',
          'bl',
          'fill',
        ];
        const rows: DisplayCommandRow[] = payload.rows.map((raw, index) => {
          const row = asRecord(raw, `rows[${index}]`);
          const type = optionalString(row.type, `rows[${index}].type`) as
            | DisplayCommandRow['type']
            | undefined;
          const data = optionalString(row.data, `rows[${index}].data`);
          if (!type || !allowed.includes(type)) throw new Error(`第 ${index + 1} 行命令类型无效`);
          if (data === undefined) throw new Error(`第 ${index + 1} 行缺少 data`);
          const normalizedData = data.trim();
          if (
            ['cs', 'dc', 'rst', 'bl'].includes(type) &&
            !['HIGH', 'LOW'].includes(normalizedData.toUpperCase())
          ) {
            throw new Error(`第 ${index + 1} 行电平必须是 HIGH 或 LOW`);
          }
          if (type === 'cmd' || type === 'data') {
            if (!/^(?:[0-9a-fA-F]{2})(?:[\s,]+[0-9a-fA-F]{2})*$/.test(normalizedData)) {
              throw new Error(`第 ${index + 1} 行必须是两位十六进制字节序列`);
            }
            if (normalizedData.split(/[\s,]+/).length > 4096) {
              throw new Error(`第 ${index + 1} 行超过 4096 字节`);
            }
          }
          if (
            type === 'delay' &&
            (!/^\d+$/.test(normalizedData) || Number(normalizedData) > 600_000_000)
          ) {
            throw new Error(`第 ${index + 1} 行延时必须是 0–600000000 微秒的整数`);
          }
          if (type === 'fill') {
            const parts = normalizedData.split(/\s+/);
            const pixelCount = Number(parts[2]);
            if (
              parts.length !== 3 ||
              !/^[0-9a-fA-F]{2}$/.test(parts[0]) ||
              !/^[0-9a-fA-F]{2}$/.test(parts[1]) ||
              !Number.isInteger(pixelCount) ||
              pixelCount < 1 ||
              pixelCount > 4_194_304
            ) {
              throw new Error(`第 ${index + 1} 行填充格式应为“高字节 低字节 像素数”`);
            }
          }
          const storedData = ['cmd', 'data', 'fill'].includes(type)
            ? normalizedData.replace(/,/g, ' ').toUpperCase()
            : ['cs', 'dc', 'rst', 'bl'].includes(type)
              ? normalizedData.toUpperCase()
              : normalizedData;
          return {
            id: index + 1,
            type,
            data: storedData,
          };
        });
        setCmdRows(rows);
        log(`AI 助手已成功填入 ${rows.length} 条初始化命令；尚未发送`);
        return { message: `${rows.length} 条屏幕初始化命令` };
      },
    });
  }, [
    cmdRows,
    columnOffset,
    deviceState.online,
    displayType,
    engine,
    frequencyHz,
    height,
    log,
    logs,
    refreshMode,
    rgb565ByteOrder,
    rowOffset,
    spiBitOrder,
    spiBits,
    spiMode,
    width,
  ]);

  // ─── 屏幕预设回调 ─────────────────────────
  // 这些 callback 依赖 log，所以必须放在 log 定义之后

  /** 应用屏幕预设（内置或用户）到命令表。 */
  const applyScreenPreset = useCallback(
    (key: string) => {
      if (!key) return;
      let rows: Omit<DisplayCommandRow, 'id'>[] | undefined;
      let presetName = '';
      let presetWidth: number | undefined;
      let presetHeight: number | undefined;
      let presetDisplayType: ScreenDisplayType = 'monochrome-page';
      let presetRgb565ByteOrder: Rgb565ByteOrder = 'little';
      let presetColumnOffset = 0;
      let presetRowOffset = 0;
      let presetSpiMode: 0 | 1 | 2 | 3 | undefined;
      let presetSpiFrequencyHz: number | undefined;
      let presetSpiSpeedKey: string | undefined;
      let presetSpiDataBits: 8 | 16 | undefined;
      let presetSpiByteOrder: 0 | 1 | undefined;
      if (key.startsWith('__builtin:')) {
        const b = BUILTIN_SCREEN_PRESETS.find((p) => p.key === key);
        if (!b) return;
        rows = b.rows;
        presetName = b.name;
        presetWidth = b.width;
        presetHeight = b.height;
        presetDisplayType = b.displayType;
        presetRgb565ByteOrder = b.rgb565ByteOrder ?? 'little';
        presetColumnOffset = b.columnOffset ?? 0;
        presetRowOffset = b.rowOffset ?? 0;
        presetSpiMode = b.spiMode;
        presetSpiFrequencyHz = b.spiFrequencyHz;
        presetSpiSpeedKey = b.spiSpeedKey;
        presetSpiDataBits = b.spiDataBits;
        presetSpiByteOrder = b.spiByteOrder;
      } else if (key.startsWith('user:')) {
        const name = key.slice('user:'.length);
        const p = userScreenPresets.find((u) => u.name === name);
        if (!p) {
          log(`Preset not found: ${name}`, true);
          return;
        }
        rows = p.rows;
        presetName = name;
        presetWidth = p.width;
        presetHeight = p.height;
        presetDisplayType = p.displayType ?? 'monochrome-page';
        presetRgb565ByteOrder = p.rgb565ByteOrder ?? 'little';
        presetColumnOffset = p.columnOffset ?? 0;
        presetRowOffset = p.rowOffset ?? 0;
      }
      if (!rows) return;
      const newRows: DisplayCommandRow[] = rows.map((r, i) => ({ ...r, id: i + 1 }));
      setCmdRows(newRows);
      setDisplayType(presetDisplayType);
      setRgb565ByteOrder(presetRgb565ByteOrder);
      setColumnOffset(presetColumnOffset);
      setRowOffset(presetRowOffset);
      if (presetSpiMode !== undefined) setSpiMode(presetSpiMode);
      if (presetSpiFrequencyHz !== undefined) setFrequencyHz(presetSpiFrequencyHz);
      if (presetSpiSpeedKey !== undefined) setSpiSpeed(presetSpiSpeedKey);
      if (presetSpiDataBits !== undefined) setSpiBits(String(presetSpiDataBits));
      if (presetSpiByteOrder !== undefined) setSpiBitOrder(String(presetSpiByteOrder));
      // 如果预设指定了分辨率，同步改画布大小
      if (presetWidth && presetHeight) {
        const w = presetWidth,
          h = presetHeight;
        setWidth(w);
        setHeight(h);
        // 自动匹配分辨率下拉：若有预设 key 匹配就选它，否则选 custom
        const match = RESOLUTION_PRESETS.find((r) => r.width === w && r.height === h);
        setResolutionKey(match ? match.key : 'custom');
      }
      const spiHint =
        presetSpiMode !== undefined && presetSpiFrequencyHz !== undefined
          ? `, Mode ${presetSpiMode}, ${presetSpiFrequencyHz}Hz, ${presetSpiDataBits ?? 8}-bit, ${presetSpiByteOrder === 0 ? 'LSB' : 'MSB'}`
          : '';
      log(`屏幕预设加载: ${presetName} (${newRows.length} 行${spiHint})`);
    },
    [userScreenPresets, log]
  );

  /** 把当前命令表另存为用户屏幕预设。 */
  const saveCurrentAsScreenPreset = useCallback(async () => {
    if (!cmdRows.length) {
      log('命令表为空', true);
      return;
    }
    const name = (
      await showPrompt(
        '另存为屏幕预设',
        `屏幕预设 ${userScreenPresets.length + 1}`,
        `将下方 ${cmdRows.length} 行命令保存为可重用的屏幕预设`
      )
    )?.trim();
    if (!name) return;
    const exists = userScreenPresets.some((p) => p.name === name);
    if (
      exists &&
      !(await showConfirm(`预设 "${name}" 已存在`, '是否覆盖原有内容？', {
        okText: '覆盖',
        okDanger: true,
      }))
    )
      return;
    const stripped: SavedScreenPreset = {
      name,
      width,
      height,
      displayType,
      rgb565ByteOrder,
      columnOffset,
      rowOffset,
      rows: cmdRows.map(({ type, data }) => ({ type, data })),
    };
    const next = exists
      ? userScreenPresets.map((p) => (p.name === name ? stripped : p))
      : [...userScreenPresets, stripped];
    setUserScreenPresets(next);
    saveScreenPresets(next);
    setSelectedScreenPreset(`user:${name}`);
    log(`屏幕预设已保存: ${name} (${stripped.rows.length} 行)`);
  }, [
    cmdRows,
    userScreenPresets,
    width,
    height,
    displayType,
    rgb565ByteOrder,
    columnOffset,
    rowOffset,
    log,
    showPrompt,
    showConfirm,
  ]);

  /** 删除当前选中的用户屏幕预设。 */
  const deleteScreenPreset = useCallback(async () => {
    if (!selectedScreenPreset.startsWith('user:')) {
      log('内置预设不能删除', true);
      return;
    }
    const name = selectedScreenPreset.slice('user:'.length);
    if (
      !(await showConfirm(`删除屏幕预设 "${name}"`, '此操作无法撤销。', {
        okText: '删除',
        okDanger: true,
      }))
    )
      return;
    const next = userScreenPresets.filter((p) => p.name !== name);
    setUserScreenPresets(next);
    saveScreenPresets(next);
    setSelectedScreenPreset(
      BUILTIN_SCREEN_PRESETS[0]?.key ?? (next[0] ? `user:${next[0].name}` : '')
    );
    log(`屏幕预设已删除: ${name}`);
  }, [selectedScreenPreset, userScreenPresets, log, showConfirm]);

  // 设备连接由侧边栏的 DeviceConnectButton 统一管理（sharedDevice 单例 + 自动连接），
  // useSpiEngine 内部已监听 connected 变化在断开时复位 configuredRef，因此这里不再需要
  // 手动 markUnconfigured。仅监听 online 变化补一条日志（自动断开由上面的
  // autoDisconnected 监听器单独提示"USB 被拔出"）。
  const prevOnline = useRef(false);
  useEffect(() => {
    if (!prevOnline.current && deviceState.online) {
      const current = deviceState.devices.find((d) => d.index === deviceState.deviceIndex);
      const modeInfo = current
        ? `；${current.name}，ChipMode=${current.chipMode ?? '?'}, FuncType=${current.funcType ?? '?'}, IF=${current.interfaceNumber ?? '?'}`
        : '';
      log(`已连接 CH347 设备 #${deviceState.deviceIndex}${modeInfo}`);
    } else if (prevOnline.current && !deviceState.online && !deviceState.autoDisconnected) {
      log('已断开 CH347 设备');
    }
    prevOnline.current = deviceState.online;
  }, [
    deviceState.online,
    deviceState.deviceIndex,
    deviceState.autoDisconnected,
    deviceState.devices,
    log,
  ]);

  // 预加载 OLED TTF 字体（fire-and-forget）
  useEffect(() => {
    loadOledFont().catch(() => {
      /* ignore */
    });
  }, []);

  // 当任一 SPI 参数变化时，标记需要重新 init（下次操作会自动 init）。
  // 跟 SPI Tool 一致：mode/speed/cs/bits/bitOrder 全部纳入监听
  const cfgRef = useRef<string>('');
  useEffect(() => {
    const sig = `${spiMode}|${frequencyHz}|0|${spiBits}|${spiBitOrder}`;
    if (cfgRef.current && cfgRef.current !== sig) {
      engine.markUnconfigured();
      log('SPI 配置已修改，下次操作时会重新初始化');
    }
    cfgRef.current = sig;
  }, [spiMode, frequencyHz, spiBits, spiBitOrder, engine, log]);

  // ─── 操作处理 ───────────────────────────────

  /** 手动 Init SPI —— 把当前 spiCfg 立即下发到 CH347。改完参数立刻按可看到日志反馈。 */
  const handleInitSpi = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await engine.initSpi(spiCfg);
    } finally {
      setBusy(false);
    }
  }, [engine, spiCfg, busy]);

  const handleSendInit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    log(`开始执行初始化序列 (${cmdRows.length} 行)...`);
    try {
      await engine.runCommandTable(cmdRows, spiCfg);
    } finally {
      setBusy(false);
    }
  }, [cmdRows, spiCfg, engine, log, busy]);

  const handleReset = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await engine.hardReset();
    } catch (e) {
      log(`复位失败：${(e as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  }, [engine, log, busy]);

  /** 把标签生成的源画布转换成物理屏幕方向，并计算最终刷新区域。 */
  const prepareContent = useCallback(
    (info: ContentSendInfo): PreparedContent => {
      const outputCanvas = info.prepared
        ? cloneCanvas(info.canvas)
        : rotateCanvasToDisplay(info.canvas, contentRotation, width, canvasHeight);
      const description =
        info.prepared || contentRotation === 0
          ? info.description
          : `${info.description} · 顺时针旋转 ${contentRotation}°`;

      let transferRegion: ContentRegion | null = null;
      let empty = false;
      if (displayType === 'rgb565') {
        const explicitRegion = info.region
          ? normalizeContentRegion(
              info.prepared
                ? info.region
                : rotateRegionToDisplay(
                    info.region,
                    contentRotation,
                    info.canvas.width,
                    info.canvas.height
                  ),
              outputCanvas.width,
              outputCanvas.height
            )
          : null;

        if (explicitRegion) {
          transferRegion = explicitRegion;
        } else if (refreshMode === 'partial') {
          transferRegion =
            refreshRegionMode === 'manual'
              ? normalizeContentRegion(manualRefreshRegion, outputCanvas.width, outputCanvas.height)
              : getContentBBox(outputCanvas, info.bgColor ?? '#000000');
          empty = transferRegion === null;
        }
      }

      return {
        preview: {
          canvas: outputCanvas,
          description,
          region: transferRegion,
        },
        transferRegion,
        empty,
      };
    },
    [
      canvasHeight,
      contentRotation,
      displayType,
      manualRefreshRegion,
      refreshMode,
      refreshRegionMode,
      width,
    ]
  );

  /** 参数变化时仅更新“待发送预览”，不会访问 CH347。 */
  const handleTabPreview = useCallback(
    (info: ContentSendInfo | null) => {
      if (!info) {
        setDraftPreview(null);
        return;
      }
      setDraftPreview(prepareContent(info).preview);
    },
    [prepareContent]
  );

  /**
   * 统一内容发送入口：转换、进度统计、取消、已发送预览、历史和失败状态都在这里处理。
   * 视频/扫描等连续帧仍使用 ref 并发锁，避免多帧同时访问 CH347。
   */
  const sendingRef = useRef(false);
  const handleTabSend = useCallback(
    async (info: ContentSendInfo): Promise<ContentSendResult> => {
      if (sendingRef.current) return { status: 'busy', bytes: 0, elapsedMs: 0 };
      sendingRef.current = true;
      const startedAt = performance.now();
      let totalBytes = 0;
      try {
        const prepared = prepareContent(info);
        const { preview, transferRegion } = prepared;
        setDraftPreview(preview);

        if (!info.transient) {
          lastSendInfoRef.current = {
            ...info,
            canvas: cloneCanvas(info.canvas),
            region: info.region ? { ...info.region } : undefined,
          };
        }

        if (prepared.empty) {
          if (!info.silent) log(`${preview.description} -> 内容为空，跳过`);
          return { status: 'preview-only', bytes: 0, elapsedMs: performance.now() - startedAt };
        }
        if (!deviceState.online) {
          if (!info.silent) log(`(未连接，仅更新待发送预览) ${preview.description}`);
          return { status: 'preview-only', bytes: 0, elapsedMs: performance.now() - startedAt };
        }

        let payload: number[];
        let transfer: Promise<boolean>;
        const controller = new AbortController();
        transferAbortRef.current = controller;
        let lastProgressUpdate = 0;

        const updateProgress = (sentBytes: number, elapsedMs: number) => {
          const now = performance.now();
          if (sentBytes < totalBytes && now - lastProgressUpdate < 80) return;
          lastProgressUpdate = now;
          const measuredThroughput = elapsedMs > 0 ? (sentBytes * 1000) / elapsedMs : 0;
          const throughput = measuredThroughput > 0 ? measuredThroughput : throughputRef.current;
          setTransferState((current) => ({
            ...current,
            status: 'sending',
            sentBytes,
            totalBytes,
            elapsedMs,
            throughputBytesPerSecond: throughput,
            estimatedRemainingMs:
              throughput > 0 ? Math.max(0, ((totalBytes - sentBytes) * 1000) / throughput) : 0,
          }));
        };

        if (displayType === 'rgb565') {
          const region = transferRegion ?? {
            x: 0,
            y: 0,
            w: preview.canvas.width,
            h: preview.canvas.height,
          };
          payload = canvasToRGB565Bytes(
            preview.canvas,
            region.x,
            region.y,
            region.w,
            region.h,
            rgb565ByteOrder
          );
          totalBytes = payload.length;
          if (!info.silent) {
            log(
              `${preview.description} -> ${transferRegion ? '区域刷新' : '全屏刷新'} ${region.w}×${region.h} @ (${region.x},${region.y}), ${totalBytes}B...`
            );
          }
          transfer = engine.pushRgbRegion(
            payload,
            region.x + columnOffset,
            region.y + rowOffset,
            region.w,
            region.h,
            spiCfg,
            {
              signal: controller.signal,
              silent: info.silent,
              onProgress: ({ sentBytes, elapsedMs }) => updateProgress(sentBytes, elapsedMs),
            }
          );
        } else {
          payload = canvasToBytes(preview.canvas);
          totalBytes = payload.length;
          if (!info.silent) log(`${preview.description} -> 推送 ${totalBytes}B 显存...`);
          transfer = engine.pushFramebuffer(
            payload,
            preview.canvas.width,
            preview.canvas.height / 8,
            spiCfg,
            0,
            {
              signal: controller.signal,
              silent: info.silent,
              onProgress: ({ sentBytes, elapsedMs }) => updateProgress(sentBytes, elapsedMs),
            }
          );
        }

        setTransferState({
          ...INITIAL_TRANSFER_STATE,
          status: 'sending',
          description: preview.description,
          totalBytes,
          estimatedRemainingMs: (totalBytes * 1000) / Math.max(1, throughputRef.current),
          throughputBytesPerSecond: throughputRef.current,
        });

        const success = await transfer;
        const elapsedMs = performance.now() - startedAt;
        if (!success) {
          const cancelled = controller.signal.aborted;
          setTransferState((current) => ({
            ...current,
            status: cancelled ? 'cancelled' : 'error',
            elapsedMs,
            estimatedRemainingMs: 0,
            error: cancelled ? undefined : '显示内容发送未完成',
          }));
          return { status: cancelled ? 'cancelled' : 'failed', bytes: totalBytes, elapsedMs };
        }

        const throughput = totalBytes > 0 ? (totalBytes * 1000) / Math.max(1, elapsedMs) : 0;
        if (throughput > 0) throughputRef.current = throughput;
        const completedAt = performance.now();
        const actualFps =
          lastFrameCompletedAtRef.current > 0
            ? 1000 / Math.max(1, completedAt - lastFrameCompletedAtRef.current)
            : 1000 / Math.max(1, elapsedMs);
        lastFrameCompletedAtRef.current = completedAt;

        const sent = {
          canvas: cloneCanvas(preview.canvas),
          description: preview.description,
          region: preview.region ? { ...preview.region } : null,
        };
        setSentPreview(sent);
        setTransferState({
          status: 'success',
          description: preview.description,
          sentBytes: totalBytes,
          totalBytes,
          elapsedMs,
          estimatedRemainingMs: 0,
          throughputBytesPerSecond: throughput,
          frameTimeMs: elapsedMs,
          actualFps,
        });

        if (!info.transient) {
          const entry: DisplayHistoryEntry = {
            id: historyIdRef.current++,
            timestamp: nowTime(),
            description: preview.description,
            canvas: cloneCanvas(preview.canvas),
            region: preview.region ? { ...preview.region } : null,
            bytes: Uint8Array.from(payload),
            displayType,
            width: preview.canvas.width,
            height: preview.canvas.height,
            elapsedMs,
            metadata: info.metadata ? { ...info.metadata } : undefined,
          };
          setDisplayHistory((current) => [entry, ...current].slice(0, 20));
        }
        return { status: 'sent', bytes: totalBytes, elapsedMs };
      } catch (error) {
        const elapsedMs = performance.now() - startedAt;
        setTransferState((current) => ({
          ...current,
          status: 'error',
          elapsedMs,
          estimatedRemainingMs: 0,
          error: (error as Error).message,
        }));
        log(`显示内容发送失败: ${(error as Error).message}`, true);
        return { status: 'failed', bytes: totalBytes, elapsedMs };
      } finally {
        transferAbortRef.current = null;
        sendingRef.current = false;
      }
    },
    [
      columnOffset,
      deviceState.online,
      displayType,
      engine,
      log,
      prepareContent,
      rgb565ByteOrder,
      rowOffset,
      spiCfg,
    ]
  );

  const handleCancelTransfer = useCallback(() => {
    transferAbortRef.current?.abort();
  }, []);

  const handleRetryLastSend = useCallback(async () => {
    const info = lastSendInfoRef.current;
    if (!info) return;
    await handleTabSend({
      ...info,
      canvas: cloneCanvas(info.canvas),
      region: info.region ? { ...info.region } : undefined,
    });
  }, [handleTabSend]);

  const handleResendHistory = useCallback(
    async (id: number) => {
      const entry = displayHistory.find((item) => item.id === id);
      if (!entry) return;
      await handleTabSend({
        canvas: cloneCanvas(entry.canvas),
        description: `历史重发：${entry.description}`,
        region: entry.region ? { ...entry.region } : undefined,
        prepared: true,
        bgColor: '#000000',
        metadata: entry.metadata ? { ...entry.metadata } : undefined,
      });
    },
    [displayHistory, handleTabSend]
  );

  const handleExportHistory = useCallback(
    async (id: number) => {
      const entry = displayHistory.find((item) => item.id === id);
      if (!entry) return;
      const safeName = entry.description.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40) || 'display';
      const path = await save({
        title: '导出屏幕数据',
        defaultPath: `${safeName}_${entry.width}x${entry.height}.bin`,
        filters: [{ name: 'Binary framebuffer', extensions: ['bin'] }],
      });
      if (!path) return;
      await writeFile(path, entry.bytes);
      log(`显示数据已导出：${path}`);
    },
    [displayHistory, log]
  );

  const handleSaveHistoryAsTemplate = useCallback(
    async (id: number) => {
      const entry = displayHistory.find((item) => item.id === id);
      if (!entry) return;
      const name = await showPrompt(
        '保存内容模板',
        entry.description.slice(0, 30),
        '输入便于识别的模板名称'
      );
      if (!name?.trim()) return;
      const template: DisplayTemplate = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: name.trim(),
        description: entry.description,
        imageDataUrl: entry.canvas.toDataURL('image/png'),
        width: entry.width,
        height: entry.height,
        createdAt: new Date().toISOString(),
        metadata: entry.metadata ? { ...entry.metadata } : undefined,
      };
      setDisplayTemplates((current) => {
        const next = [template, ...current].slice(0, 8);
        saveDisplayTemplates(next);
        return next;
      });
      log(`内容模板已保存：${template.name}`);
    },
    [displayHistory, log, showPrompt]
  );

  const handleUseTemplate = useCallback(
    async (id: string) => {
      const template = displayTemplates.find((item) => item.id === id);
      if (!template) return;
      const image = new Image();
      image.src = template.imageDataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = template.width;
      canvas.height = template.height;
      canvas.getContext('2d')?.drawImage(image, 0, 0);
      await handleTabSend({
        canvas,
        description: `内容模板：${template.name}`,
        prepared: true,
        bgColor: '#000000',
        metadata: template.metadata ? { ...template.metadata } : undefined,
      });
    },
    [displayTemplates, handleTabSend]
  );

  const handleDeleteTemplate = useCallback((id: string) => {
    setDisplayTemplates((current) => {
      const next = current.filter((item) => item.id !== id);
      saveDisplayTemplates(next);
      return next;
    });
  }, []);

  const handleCompareHistory = useCallback(
    (id: number | null) => {
      if (id === null) {
        setCompareEntry(null);
        return;
      }
      const entry = displayHistory.find((item) => item.id === id);
      setCompareEntry(entry ?? null);
    },
    [displayHistory]
  );

  const handleEditHistory = useCallback(
    (id: number) => {
      const entry = displayHistory.find((item) => item.id === id);
      if (!entry) return;
      setContentRotations((current) => ({ ...current, draw: 0 }));
      setEditorSeed(cloneCanvas(entry.canvas));
      setActiveTab('draw');
      log(`已将历史画面载入绘制编辑器：${entry.description}`);
    },
    [displayHistory, log]
  );
  const handleEditorSeedConsumed = useCallback(() => setEditorSeed(null), []);

  const handleManualRefreshRegionChange = useCallback(
    (region: ContentRegion) => {
      const x = Math.max(0, Math.min(width - 1, Math.round(region.x)));
      const y = Math.max(0, Math.min(canvasHeight - 1, Math.round(region.y)));
      setManualRefreshRegion({
        x,
        y,
        w: Math.max(1, Math.min(width - x, Math.round(region.w))),
        h: Math.max(1, Math.min(canvasHeight - y, Math.round(region.h))),
      });
    },
    [canvasHeight, width]
  );

  /**
   * 强制清除整块屏幕显存。
   *
   * 不能复用 handleTabSend：RGB 屏处于“局部刷新”时，全黑画布没有内容外接矩形，
   * 会被当作空内容跳过。这里始终走全屏写入，并同步把右侧预览更新为黑屏。
   */
  const handleClearDisplay = useCallback(async () => {
    if (busy) return;
    if (sendingRef.current) {
      log('当前正在发送显示内容，请稍后再清屏');
      return;
    }

    sendingRef.current = true;
    const startedAt = performance.now();
    try {
      const blackPreview = document.createElement('canvas');
      blackPreview.width = width;
      blackPreview.height = canvasHeight;
      const previewContext = blackPreview.getContext('2d');
      if (!previewContext) throw new Error('无法创建清屏画布');
      previewContext.fillStyle = '#000000';
      previewContext.fillRect(0, 0, width, canvasHeight);
      setDraftPreview({ canvas: cloneCanvas(blackPreview), description: '清屏', region: null });

      if (!deviceState.online) {
        log('(未连接，仅更新待发送预览) 清屏');
        return;
      }

      let success: boolean;
      let totalBytes: number;
      const controller = new AbortController();
      transferAbortRef.current = controller;
      const updateClearProgress = (sentBytes: number, elapsedMs: number) => {
        const throughput = elapsedMs > 0 ? (sentBytes * 1000) / elapsedMs : throughputRef.current;
        setTransferState((current) => ({
          ...current,
          status: 'sending',
          sentBytes,
          elapsedMs,
          throughputBytesPerSecond: throughput,
          estimatedRemainingMs:
            throughput > 0 ? Math.max(0, ((totalBytes - sentBytes) * 1000) / throughput) : 0,
        }));
      };
      if (displayType === 'rgb565') {
        const blackBytes = new Array<number>(width * canvasHeight * 2).fill(0);
        totalBytes = blackBytes.length;
        log(
          `清屏 -> 全屏写黑色 ${width}×${canvasHeight}, ${blackBytes.length}B（不受局部刷新设置影响）...`
        );
        setTransferState({
          ...INITIAL_TRANSFER_STATE,
          status: 'sending',
          description: '清屏',
          totalBytes,
          estimatedRemainingMs: (totalBytes * 1000) / Math.max(1, throughputRef.current),
        });
        success = await engine.pushRgbRegion(
          blackBytes,
          columnOffset,
          rowOffset,
          width,
          canvasHeight,
          spiCfg,
          {
            signal: controller.signal,
            onProgress: ({ sentBytes, elapsedMs }) => updateClearProgress(sentBytes, elapsedMs),
          }
        );
      } else {
        const pageCount = canvasHeight / 8;
        const blackBytes = new Array<number>(width * pageCount).fill(0);
        totalBytes = blackBytes.length;
        log(`清屏 -> 推送 ${blackBytes.length}B 全零显存...`);
        setTransferState({
          ...INITIAL_TRANSFER_STATE,
          status: 'sending',
          description: '清屏',
          totalBytes,
          estimatedRemainingMs: (totalBytes * 1000) / Math.max(1, throughputRef.current),
        });
        success = await engine.pushFramebuffer(blackBytes, width, pageCount, spiCfg, 0, {
          signal: controller.signal,
          onProgress: ({ sentBytes, elapsedMs }) => updateClearProgress(sentBytes, elapsedMs),
        });
      }

      const elapsedMs = performance.now() - startedAt;
      if (success) {
        setSentPreview({ canvas: blackPreview, description: '清屏', region: null });
        setTransferState((current) => ({
          ...current,
          status: 'success',
          sentBytes: totalBytes,
          totalBytes,
          elapsedMs,
          estimatedRemainingMs: 0,
          frameTimeMs: elapsedMs,
        }));
        log(`清屏完成：${width}×${canvasHeight}`);
      } else if (controller.signal.aborted) {
        setTransferState((current) => ({
          ...current,
          status: 'cancelled',
          elapsedMs,
          estimatedRemainingMs: 0,
        }));
      } else {
        setTransferState((current) => ({
          ...current,
          status: 'error',
          elapsedMs,
          estimatedRemainingMs: 0,
          error: '清屏未完成',
        }));
        log('清屏未完成，请查看前面的错误日志', true);
      }
    } catch (error) {
      log(`清屏失败：${(error as Error).message}`, true);
    } finally {
      transferAbortRef.current = null;
      sendingRef.current = false;
    }
  }, [
    busy,
    width,
    canvasHeight,
    deviceState.online,
    displayType,
    engine,
    columnOffset,
    rowOffset,
    spiCfg,
    log,
  ]);

  return (
    <div className="spi-display-tool">
      <LeftPanel
        online={deviceState.online}
        frequencyHz={frequencyHz}
        onFrequencyChange={setFrequencyHz}
        spiSpeed={spiSpeed}
        onSpiSpeedChange={setSpiSpeed}
        spiMode={spiMode}
        onSpiModeChange={setSpiMode}
        spiBits={spiBits}
        onSpiBitsChange={setSpiBits}
        spiBitOrder={spiBitOrder}
        onSpiBitOrderChange={setSpiBitOrder}
        onInitSpi={handleInitSpi}
        width={width}
        height={height}
        rows={cmdRows}
        onRowsChange={setCmdRows}
        builtinScreenPresets={BUILTIN_SCREEN_PRESETS}
        userScreenPresets={userScreenPresets}
        selectedScreenPreset={selectedScreenPreset}
        onSelectedScreenPresetChange={setSelectedScreenPreset}
        onApplyScreenPreset={applyScreenPreset}
        onSaveAsScreenPreset={saveCurrentAsScreenPreset}
        onDeleteScreenPreset={deleteScreenPreset}
        showPrompt={showPrompt}
        showConfirm={showConfirm}
        showAlert={showAlert}
        onSendInit={handleSendInit}
        onReset={handleReset}
        busy={busy || transferState.status === 'sending'}
      />

      <MiddlePanel
        activeTab={activeTab}
        onTabChange={setActiveTab}
        width={width}
        height={canvasHeight}
        onSend={handleTabSend}
        onPreview={handleTabPreview}
        busy={busy || transferState.status === 'sending'}
        displayType={displayType}
        refreshMode={refreshMode}
        onRefreshModeChange={setRefreshMode}
        onClearDisplay={handleClearDisplay}
        rotation={contentRotation}
        onRotationChange={handleContentRotationChange}
        refreshRegionMode={refreshRegionMode}
        onRefreshRegionModeChange={setRefreshRegionMode}
        manualRefreshRegion={manualRefreshRegion}
        onManualRefreshRegionChange={handleManualRefreshRegionChange}
        columnOffset={columnOffset}
        rowOffset={rowOffset}
        initialCanvas={editorSeed}
        onInitialCanvasConsumed={handleEditorSeedConsumed}
      />

      <RightPanel
        online={deviceState.online}
        width={width}
        height={canvasHeight}
        displayType={displayType}
        draftPreview={draftPreview}
        sentPreview={sentPreview}
        compareEntry={compareEntry}
        transferState={transferState}
        onCancelTransfer={handleCancelTransfer}
        onRetryLastSend={() => void handleRetryLastSend()}
        refreshMode={refreshMode}
        refreshRegionMode={refreshRegionMode}
        manualRefreshRegion={manualRefreshRegion}
        onManualRefreshRegionChange={handleManualRefreshRegionChange}
        onEnableManualRegion={() => {
          setRefreshMode('partial');
          setRefreshRegionMode('manual');
        }}
        history={displayHistory}
        templates={displayTemplates}
        onResendHistory={(id) => void handleResendHistory(id)}
        onExportHistory={(id) => void handleExportHistory(id)}
        onSaveHistoryAsTemplate={(id) => void handleSaveHistoryAsTemplate(id)}
        onCompareHistory={handleCompareHistory}
        onEditHistory={handleEditHistory}
        onUseTemplate={(id) => void handleUseTemplate(id)}
        onDeleteTemplate={handleDeleteTemplate}
        resolutionPreset={resolutionKey}
        resolutionPresets={RESOLUTION_PRESETS}
        onResolutionPresetChange={handleResolutionPresetChange}
        onWidthChange={setWidth}
        onHeightChange={setHeight}
        logs={logs}
        onClearLogs={() => setLogs([])}
      />

      {/* 自定义模态弹窗 —— useModalDialog 内部管理状态，挂这一个节点即可 */}
      {modalNode}
    </div>
  );
};
