"""SpiTester 灵活输入与 cmd()/data() 便捷 API 的单元测试。"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usbtoolbox.tester import UsbToolBoxClient, SpiTester  # noqa: E402
from usbtoolbox.tester.spi_tester import _to_bytes  # noqa: E402
from tests.mock_server import MockServer  # noqa: E402


class TestToBytes(unittest.TestCase):
    def test_int(self):
        self.assertEqual(_to_bytes(0xAE), b"\xae")

    def test_list(self):
        self.assertEqual(_to_bytes([0xA1, 0xC8]), b"\xa1\xc8")

    def test_hex_str_with_spaces(self):
        self.assertEqual(_to_bytes("A1 C8"), b"\xa1\xc8")

    def test_hex_str_compact(self):
        self.assertEqual(_to_bytes("A1C8"), b"\xa1\xc8")

    def test_hex_str_with_0x(self):
        self.assertEqual(_to_bytes("0xA1 0xC8"), b"\xa1\xc8")

    def test_bytes_passthrough(self):
        self.assertEqual(_to_bytes(b"\xaf"), b"\xaf")


class TestCmdDataApi(unittest.TestCase):
    def setUp(self):
        self._mock = MockServer()
        self.client = UsbToolBoxClient(self._mock.__enter__(), timeout=2.0)

    def tearDown(self):
        self._mock.__exit__(None, None, None)

    def test_cmd_mixed_inputs(self):
        with SpiTester(self.client, index=0) as spi:
            spi.init()
            # 混用 int / list / hex 串，应全部成功且不抛异常
            spi.cmd(0xAE, [0xA1, 0xC8], "D9F1", "DB 30")

    def test_data_writes_in_data_mode(self):
        with SpiTester(self.client, index=0) as spi:
            spi.init()
            spi.data([0x01, 0x02, 0x03])   # list
            spi.data(b"\x04\x05")          # bytes

    def test_write_accepts_flexible_input(self):
        with SpiTester(self.client, index=0) as spi:
            spi.init()
            spi.write(0x9F)               # int
            spi.write([0x00, 0x00])       # list
            spi.write("A1C8")             # hex str


if __name__ == "__main__":
    unittest.main()
