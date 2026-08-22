"""示例：用底层 API 一步步驱动 SSD1306 OLED 128x64 显示「Hello, SPI LCD!」。

设计上像桌面工具里"打开设备"那样：用 ``with SpiTester(...) as spi`` 一行打开设备
（自动 open/close），里面再用便捷的 ``cmd()/data()`` 把每条命令写出来——看得见、改得动，
扩展性最强。照着这个模式改命令序列/寻址方式即可适配任意 SPI 屏。

便捷 API（普通整数即可，无需 ``b"\\x.."`` 字节字面量）：
  with SpiTester(client, index=0) as spi:   打开 CH347 设备（自动 open/close）
      spi.init(...)                          初始化 SPI 传输层（默认 Mode0/8MHz/CS0）
      spi.set_rst(False/True)               RST = GPIO5 复位
      spi.cmd(0xAE, 0xA1, ...)              DC=0 发命令：传整数/列表/hex 串均可
      spi.data(...)                          DC=1 发数据：传整数/列表/bytes 均可
      spi.write(...)                         也可直接写（不切 DC）
  render_text(text, w, h, y0=)              文字→SSD1306 page-major 帧缓冲（仅渲染，不发硬件）

接线（与桌面工具一致）：CH347 SPI → SSD1306；DC→GPIO4，RST→GPIO5，CS→CS0。
运行前：在「Python 产测工具」页点「开启接口」开启设备接口（默认 8765），接好 CH347 与屏。

用法::

    python oled_ssd1306_hello.py [BASE_URL] [文本]
"""

import sys
import time

from usbtoolbox.tester import UsbToolBoxClient, SpiTester
from usbtoolbox.tester.oled import render_text, preview_ascii

WIDTH, HEIGHT, PAGES = 128, 64, 8


def init_display(spi: SpiTester) -> None:
    """硬复位 + 下发 SSD1306 初始化命令序列。"""
    spi.set_rst(False); time.sleep(0.01)   # 硬复位（RST = GPIO5）
    spi.set_rst(True); time.sleep(0.05)
    # 发 SSD1306 初始化命令：传普通整数即可，cmd() 自动 DC=0 + 转字节
    spi.cmd(
        0xAE,                 # 显示关
        0xA1,                 # 段重映射（列翻转）
        0xC8,                 # COM 扫描方向反向
        [0xA8, 0x3F],         # MUX = 1/64（128×64 必须）
        [0x81, 0xCF],         # 对比度
        [0xD9, 0xF1],         # 预充电周期
        [0xDA, 0x12],         # COM 引脚硬件配置
        [0xDB, 0x30],         # VCOMH 电平
        [0x8D, 0x14],         # 电荷泵开启
        0xAF,                 # 显示开启
    )
    time.sleep(0.1)  # 数据手册 tAF：AFh 后需等待


def write_frame(spi: SpiTester, frame: list) -> None:
    """逐页写显存（Page Addressing 模式）。

    每页：先 DC=0 发「设页 + 列地址」命令，再 DC=1 发该页 128 字节数据（按 64 字节分块）。
    全程不关显示——SSD1306 在显示开启时写 GDDRAM 不会撕裂。
    """
    for p in range(PAGES):
        spi.cmd([0xB0 | p, 0x00, 0x10])                       # 设 page + 列低/高 = 0
        spi.set_dc(True)                                       # 数据模式
        row = bytes(frame[p * WIDTH:(p + 1) * WIDTH])
        for off in range(0, len(row), 64):                    # 分块避免丢包
            spi.write(row[off:off + 64])


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
    text = sys.argv[2] if len(sys.argv) > 2 else "Hello, SPI LCD!"

    client = UsbToolBoxClient(base_url)
    try:
        ch347 = client.health().get("ch347Available")
        print("health: ch347Available =", ch347)
    except Exception as e:
        ch347 = False
        print("（设备接口未开启或不可达，仅预览渲染）", e)

    # 渲染文字到帧缓冲（纯计算，不碰硬件）
    frame = render_text(text, WIDTH, HEIGHT, y0=24)

    # 无设备接口/无硬件时，先在控制台预览渲染效果
    if not ch347:
        print(preview_ascii(frame, WIDTH, HEIGHT))
        return 0

    # 有硬件：打开设备（with 自动 open/close）→ 初始化 → 写显存
    with SpiTester(client, index=0) as spi:   # ← 像桌面工具"打开设备"一样，一步到位
        spi.init()                              # 初始化 SPI 传输层（默认 Mode0/8MHz/CS0）
        init_display(spi)                        # 复位 + SSD1306 初始化命令序列
        write_frame(spi, frame)                  # 逐页写显存显示文字
        print(f"已显示：{text!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
