"""SSD1306 OLED 文字显示助手（基于 SPI，纯标准库，自带 8x8 点阵字体）。

软件内置的 Python 运行时没有 PIL/字体库，因此本模块自带一套公有领域 8x8 ASCII 点阵字体
（font8x8_basic 风格），把文字渲染成 SSD1306 的 page-major 帧缓冲（每字节 8 个垂直像素，
LSB = 该 page 顶行），再通过 SPI 逐页写入显存。

初始化序列与字节布局对齐桌面「SPI 点屏工具」的 SSD1306 128x64 预设（A1+C8 旋转、
Page Addressing、写显存期间不关显示），因此显示方向与界面预览一致。

接线约定（与桌面工具一致）：DC 接 CH347 GPIO4，RST 接 GPIO5；CS 由 SPI 写自动控制。
"""

from __future__ import annotations

import time
from typing import List

from .drivers import SpiDriver

# ─── 内置 8x8 点阵字体（font8x8_basic，公有领域）──────────────────
# 每个字符 8 字节，byte[行] 自顶向下；字节内 bit0 = 最左列（LSB-first 横向）。
# 仅收录可打印 ASCII 0x20–0x7E；未收录字符渲染为 '?'。
_FONT_HEX = {
    " ": "00 00 00 00 00 00 00 00", "!": "18 3C 3C 18 18 00 18 00",
    "\"": "36 36 00 00 00 00 00 00", "#": "36 36 7F 36 7F 36 36 00",
    "$": "0C 3E 03 1E 30 1F 0C 00", "%": "00 63 33 18 0C 66 63 00",
    "&": "1C 36 1C 6E 3B 33 6E 00", "'": "06 06 03 00 00 00 00 00",
    "(": "18 0C 06 06 06 0C 18 00", ")": "06 0C 18 18 18 0C 06 00",
    "*": "00 66 3C FF 3C 66 00 00", "+": "00 0C 0C 3F 0C 0C 00 00",
    ",": "00 00 00 00 00 0C 0C 06", "-": "00 00 00 3F 00 00 00 00",
    ".": "00 00 00 00 00 0C 0C 00", "/": "60 30 18 0C 06 03 01 00",
    "0": "3E 63 73 7B 6F 67 3E 00", "1": "0C 0E 0C 0C 0C 0C 3F 00",
    "2": "1E 33 30 1C 06 33 3F 00", "3": "1E 33 30 1C 30 33 1E 00",
    "4": "38 3C 36 33 7F 30 78 00", "5": "3F 03 1F 30 30 33 1E 00",
    "6": "1C 06 03 1F 33 33 1E 00", "7": "3F 33 30 18 0C 0C 0C 00",
    "8": "1E 33 33 1E 33 33 1E 00", "9": "1E 33 33 3E 30 18 0E 00",
    ":": "00 0C 0C 00 00 0C 0C 00", ";": "00 0C 0C 00 00 0C 0C 06",
    "<": "18 0C 06 03 06 0C 18 00", "=": "00 00 3F 00 00 3F 00 00",
    ">": "06 0C 18 30 18 0C 06 00", "?": "1E 33 30 18 0C 00 0C 00",
    "@": "3E 63 7B 7B 7B 03 1E 00", "A": "0C 1E 33 33 3F 33 33 00",
    "B": "3F 66 66 3E 66 66 3F 00", "C": "3C 66 03 03 03 66 3C 00",
    "D": "1F 36 66 66 66 36 1F 00", "E": "7F 46 16 1E 16 46 7F 00",
    "F": "7F 46 16 1E 16 06 0F 00", "G": "3C 66 03 03 73 66 7C 00",
    "H": "33 33 33 3F 33 33 33 00", "I": "1E 0C 0C 0C 0C 0C 1E 00",
    "J": "78 30 30 30 33 33 1E 00", "K": "67 66 36 1E 36 66 67 00",
    "L": "0F 06 06 06 46 66 7F 00", "M": "63 77 7F 7F 6B 63 63 00",
    "N": "63 67 6F 7B 73 63 63 00", "O": "1C 36 63 63 63 36 1C 00",
    "P": "3F 66 66 3E 06 06 0F 00", "Q": "1E 33 33 33 3B 1E 38 00",
    "R": "3F 66 66 3E 36 66 67 00", "S": "1E 33 07 0E 38 33 1E 00",
    "T": "3F 2D 0C 0C 0C 0C 1E 00", "U": "33 33 33 33 33 33 3F 00",
    "V": "33 33 33 33 33 1E 0C 00", "W": "63 63 63 6B 7F 77 63 00",
    "X": "63 63 36 1C 1C 36 63 00", "Y": "33 33 33 1E 0C 0C 1E 00",
    "Z": "7F 63 31 18 4C 66 7F 00", "[": "1E 06 06 06 06 06 1E 00",
    "\\": "03 06 0C 18 30 60 40 00", "]": "1E 18 18 18 18 18 1E 00",
    "^": "08 1C 36 63 00 00 00 00", "_": "00 00 00 00 00 00 00 FF",
    "`": "0C 0C 18 00 00 00 00 00", "a": "00 00 1E 30 3E 33 6E 00",
    "b": "07 06 06 3E 66 66 3B 00", "c": "00 00 1E 33 03 33 1E 00",
    "d": "38 30 30 3E 33 33 6E 00", "e": "00 00 1E 33 3F 03 1E 00",
    "f": "1C 36 06 0F 06 06 0F 00", "g": "00 00 6E 33 33 3E 30 1F",
    "h": "07 06 36 6E 66 66 67 00", "i": "0C 00 0E 0C 0C 0C 1E 00",
    "j": "30 00 30 30 30 33 33 1E", "k": "07 06 66 36 1E 36 67 00",
    "l": "0E 0C 0C 0C 0C 0C 1E 00", "m": "00 00 33 7F 7F 6B 63 00",
    "n": "00 00 1F 33 33 33 33 00", "o": "00 00 1E 33 33 33 1E 00",
    "p": "00 00 3B 66 66 3E 06 0F", "q": "00 00 6E 33 33 3E 30 78",
    "r": "00 00 3B 6E 66 06 0F 00", "s": "00 00 3E 03 1E 30 1F 00",
    "t": "08 0C 3E 0C 0C 2C 18 00", "u": "00 00 33 33 33 33 6E 00",
    "v": "00 00 33 33 33 1E 0C 00", "w": "00 00 63 6B 7F 7F 36 00",
    "x": "00 00 63 36 1C 36 63 00", "y": "00 00 33 33 33 3E 30 1F",
    "z": "00 00 3F 19 0C 26 3F 00", "{": "38 0C 0C 07 0C 0C 38 00",
    "|": "18 18 18 18 18 18 18 00", "}": "07 0C 0C 38 0C 0C 07 00",
    "~": "6E 3B 00 00 00 00 00 00",
}

#: 字符 → 8 字节点阵
FONT8X8 = {ch: list(bytes.fromhex(h)) for ch, h in _FONT_HEX.items()}


def render_text(text: str, width: int = 128, height: int = 64, x0: int = 0, y0: int = 0) -> List[int]:
    """把文字渲染成 SSD1306 page-major 帧缓冲（长度 = width × height/8）。

    支持多行（``\\n``），每行高 8 像素。``y0`` 会按 8 对齐到 page。
    """
    pages = height // 8
    buf = [0] * (width * pages)
    cx = x0
    page = y0 // 8
    for ch in text:
        if ch == "\n":
            page += 1
            cx = x0
            continue
        glyph = FONT8X8.get(ch, FONT8X8["?"])
        if 0 <= page < pages:
            for col in range(8):
                xx = cx + col
                if 0 <= xx < width:
                    byte = 0
                    for row in range(8):
                        if (glyph[row] >> col) & 1:
                            byte |= 1 << row
                    buf[page * width + xx] |= byte
        cx += 8
    return buf


# ─── SSD1306 128x64 初始化命令（对齐桌面「SPI 点屏工具」预设）──────
# 多字节命令（如 A8 3F）以连续字节流形式在 DC=0 下发送即可。
_INIT_CMDS = bytes([
    0xAE,             # 显示关
    0x00, 0x10,       # 列地址低/高 = 0
    0x40,             # 起始行 = 0
    0xB0,             # 页 = 0
    0x81, 0xCF,       # 对比度
    0xA1,             # 段重映射（列翻转）
    0xA6,             # 正常显示
    0xA8, 0x3F,       # MUX = 1/64
    0xC8,             # COM 扫描反向
    0xD3, 0x00,       # 显示偏移 = 0
    0xD5, 0x80,       # 时钟分频/振荡
    0xD9, 0xF1,       # 预充电
    0xDA, 0x12,       # COM 引脚配置
    0xDB, 0x30,       # VCOMH
    0x8D, 0x14,       # 电荷泵开
    0xAF,             # 显示开
])


class SSD1306Spi(SpiDriver):
    """通过 SPI 驱动 SSD1306 OLED（128x64），继承 :class:`SpiDriver`。

    作为"用封装好的基类写驱动"的范例：SPI 传输层（打开设备 + SPI 初始化）由 ``SpiDriver.open()``
    负责，本类只实现芯片级操作（复位 + SSD1306 初始化命令 + 显存写入）。

    生命周期（与所有 ``SpiDriver`` 子类一致）::

        with SSD1306Spi(client, index=0) as oled:   # open() 打开设备 + 初始化 SPI 传输层
            oled.init()                              # 芯片复位 + SSD1306 初始化序列 + 清屏
            oled.show_text("Hello, SPI LCD!", y=24)
        # 退出 with 自动 close()

    :param client: 已连接的 :class:`UsbToolBoxClient`。
    :param index:  CH347 设备索引。
    :param width:  屏宽，默认 128。
    :param height: 屏高，默认 64（须为 8 的倍数）。
    :param spi_mode/spi_speed_mhz/spi_cs: SPI 传输层参数（覆盖类属性默认值）。
    """

    # ── SpiDriver 传输层参数（可被子类/构造参数覆盖）──
    spi_mode = 0
    spi_speed_mhz = 8
    spi_cs = 0

    def __init__(self, client, *, index: int = 0, width: int = 128, height: int = 64,
                 spi_mode=None, spi_speed_mhz=None, spi_cs=None):
        super().__init__(client, index=index, spi_mode=spi_mode,
                         spi_speed_mhz=spi_speed_mhz, spi_cs=spi_cs)
        self.width = width
        self.height = height
        self.pages = height // 8

    def init(self, *, reset: bool = True) -> "SSD1306Spi":
        """芯片特有初始化：硬复位 + 下发 SSD1306 初始化序列 + 清屏。

        SPI 传输层已由 ``open()``（SpiDriver）准备好，此处只做芯片级操作。
        """
        if reset:
            self.spi.set_rst(False)
            time.sleep(0.01)
            self.spi.set_rst(True)
            time.sleep(0.05)
        self.spi.set_dc(False)             # 命令模式
        self.spi.write(_INIT_CMDS)
        time.sleep(0.1)                    # 数据手册 tAF：AFh 后需等待
        self.clear()
        return self

    def display(self, page_bytes: List[int]) -> None:
        """把一帧 page-major 字节写入显存（Page Addressing，逐页设地址 + 64 字节分块）。

        全程不关显示——SSD1306 在显示开启时写 GDDRAM 不会撕裂；每页地址命令合并为一次
        DC=0 写，避免连续发送时丢命令导致文字错位。
        """
        if len(page_bytes) != self.width * self.pages:
            raise ValueError(f"帧大小应为 {self.width * self.pages}，实际 {len(page_bytes)}")
        for p in range(self.pages):
            # 设 page + 列地址（3 条单字节命令合并为一次 DC=0 写）
            self.spi.set_dc(False)
            self.spi.write(bytes([0xB0 | p, 0x00, 0x10]))
            # 写本页数据（DC=1，按 64 字节分块）
            self.spi.set_dc(True)
            row = page_bytes[p * self.width:(p + 1) * self.width]
            for off in range(0, len(row), 64):
                self.spi.write(bytes(row[off:off + 64]))

    def clear(self) -> None:
        """清屏（全 0）。"""
        self.display([0] * (self.width * self.pages))

    def show_text(self, text: str, *, x: int = 0, y: int = 0) -> None:
        """清屏并显示文字（多行用 ``\\n``，每行 8 像素高）。"""
        self.display(render_text(text, self.width, self.height, x0=x, y0=y))


def preview_ascii(page_bytes: List[int], width: int = 128, height: int = 64) -> str:
    """把帧缓冲转成 ASCII 预览（点亮像素 '#'），便于无硬件时检查渲染效果。"""
    pages = height // 8
    lines = []
    for p in range(pages):
        for bit in range(8):
            row = []
            for x in range(width):
                lit = (page_bytes[p * width + x] >> bit) & 1
                row.append("#" if lit else ".")
            lines.append("".join(row))
    return "\n".join(lines)
