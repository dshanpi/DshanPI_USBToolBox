"""示例：用户如何写【自己的】SPI 屏幕驱动并使用它。

这个文件演示了"扩展点"——用户（不能改包源码）在自己的工作区目录里写一个驱动类，
继承 ``SpiDriver``，填入自己屏幕的初始化序列与寻址方式，然后在脚本里直接用。

这里以一个"通用 SPI 单色 LCD"模板为例（类名 MyCustomLcd）：
  - 复用包内置的 ``render_text`` 做文字→帧缓冲（省得自己写字模）
  - 在 ``init()`` 里下发用户屏幕的初始化命令（占位，按你的屏改）
  - 在 ``display()`` 里按你屏幕的寻址方式写显存（占位，按你的屏改）

把本文件存到「Python 产测工具」的用户目录（点界面"另存到用户目录"），脚本里即可
``from custom_spi_lcd import MyCustomLcd`` 复用。

无硬件时脚本会在输出台打印 ASCII 预览，方便先看渲染效果。
"""

from usbtoolbox.tester import UsbToolBoxClient
from usbtoolbox.tester.drivers import SpiDriver
from usbtoolbox.tester.oled import render_text, preview_ascii


class MyCustomLcd(SpiDriver):
    """用户自定义 SPI 单色 LCD 驱动（模板）。

    改这三处即可适配你的屏：
      1. 类属性：SPI 模式/速率/CS（SPI 传输层参数）
      2. INIT_CMDS：你屏幕控制器的初始化命令序列
      3. _write_page()：你屏幕的页/列寻址方式与数据布局
    """

    spi_mode = 0
    spi_speed_mhz = 8
    spi_cs = 0

    width = 128
    height = 64

    # 占位：替换成你屏幕的真实初始化序列
    INIT_CMDS = bytes([
        0xAE,             # 显示关（占位）
        0xA1, 0xC8,       # 段映射 + COM 方向（按你的屏调整）
        0xAF,             # 显示开
    ])

    def init(self) -> "MyCustomLcd":
        """芯片特有初始化：复位 + 发 INIT_CMDS。SPI 传输层已由 SpiDriver.open() 准备好。"""
        # 硬复位（DC/RST 由 SpiTester 的 GPIO 控制；DC=GPIO4, RST=GPIO5）
        self.spi.set_rst(False)
        import time; time.sleep(0.01)
        self.spi.set_rst(True)
        time.sleep(0.05)
        # 发命令：DC=低 = 命令
        self.spi.set_dc(False)
        self.spi.write(self.INIT_CMDS)
        return self

    def display(self, page_bytes):
        """写一帧到显存。这里复用 SSD1306 的 Page Addressing 写法作模板——
        按你的控制器改寻址（例如 ST7789 是行列窗口 + RGB565）。
        """
        pages = self.height // 8
        for p in range(pages):
            # 设页 + 列地址（3 条命令合并为一次 DC=0 写）
            self.spi.set_dc(False)
            self.spi.write(bytes([0xB0 | p, 0x00, 0x10]))
            # 写该页数据（DC=1，分块）
            self.spi.set_dc(True)
            row = page_bytes[p * self.width:(p + 1) * self.width]
            for off in range(0, len(row), 64):
                self.spi.write(bytes(row[off:off + 64]))

    def show_text(self, text: str, y: int = 24) -> None:
        self.display(render_text(text, self.width, self.height, y0=y))


def main() -> int:
    client = UsbToolBoxClient("http://127.0.0.1:8765")
    text = "Hello, Custom LCD!"

    if not client.health().get("ch347Available"):
        # 无硬件：预览渲染
        print(preview_ascii(render_text(text, 128, 64, y0=24), 128, 64))
        return 0

    # 有硬件：用 with 自动管理 open/close
    with MyCustomLcd(client, index=0) as lcd:
        lcd.init()
        lcd.show_text(text)
        print("已显示:", text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
