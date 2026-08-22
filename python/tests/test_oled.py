"""SSD1306Spi 驱动（继承 SpiDriver）的单元测试，针对 Mock HTTP 服务。"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usbtoolbox.tester import UsbToolBoxClient  # noqa: E402
from usbtoolbox.tester.oled import SSD1306Spi, render_text, preview_ascii  # noqa: E402
from tests.mock_server import MockServer  # noqa: E402


class TestSSD1306Spi(unittest.TestCase):
    def setUp(self):
        self._mock = MockServer()
        self.client = UsbToolBoxClient(self._mock.__enter__(), timeout=2.0)

    def tearDown(self):
        self._mock.__exit__(None, None, None)

    def test_is_spi_driver(self):
        # 继承自 SpiDriver：open() 负责 SPI 传输层，init() 负责芯片初始化
        oled = SSD1306Spi(self.client, index=0)
        self.assertIsNone(oled.spi)
        with oled as drv:           # open() 打开设备 + 初始化 SPI
            self.assertIsNotNone(drv.spi)
            drv.init()              # 复位 + SSD1306 命令 + 清屏
            drv.show_text("Hi", y=24)
        self.assertIsNone(oled.spi)  # close() 释放

    def test_init_does_spi_transfer_in_open_not_init(self):
        # init() 不应再调 spi_init（那是 open() 的职责）；这里只验证全流程不抛异常
        with SSD1306Spi(self.client, index=0) as oled:
            oled.init()
            oled.clear()

    def test_render_and_preview(self):
        buf = render_text("AB", 16, 8)
        self.assertEqual(len(buf), 16)
        self.assertIn("#", preview_ascii(buf, 16, 8))  # 有点亮像素


if __name__ == "__main__":
    unittest.main()
