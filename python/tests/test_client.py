"""client / serial / i2c / spi 针对 Mock HTTP 服务的单元测试（无需硬件 / 应用）。"""

import os
import sys
import unittest

# 让 tests 能 import 到 usbtoolbox 包（python/ 目录加入 sys.path）
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usbtoolbox.tester import (  # noqa: E402
    UsbToolBoxClient, UsbToolBoxError, SpiTester, I2CTester,
    SerialTester, MatchMode,
)
from tests.mock_server import MockServer  # noqa: E402


class TestClientAgainstMock(unittest.TestCase):
    def setUp(self):
        self._mock = MockServer()
        self.base_url = self._mock.__enter__()
        self.client = UsbToolBoxClient(self.base_url, timeout=2.0)

    def tearDown(self):
        self._mock.__exit__(None, None, None)

    def test_health(self):
        h = self.client.health()
        self.assertEqual(h["status"], "ok")
        self.assertTrue(h["ch347Available"])

    def test_list_devices(self):
        devs = self.client.list_devices()
        self.assertEqual(devs[0]["index"], 0)

    def test_spi_transfer_echo(self):
        out = self.client.spi_transfer(0, bytes([0x9F, 0x00]))
        self.assertEqual(out, bytes([0x9F, 0x00]))  # mock 回显

    def test_spi_read(self):
        self.assertEqual(self.client.spi_read(0, 3), bytes([0xA5, 0xA5, 0xA5]))

    def test_i2c_scan(self):
        self.assertEqual(self.client.i2c_scan(0), [0x50, 0x68])

    def test_error_maps_to_exception(self):
        with self.assertRaises(UsbToolBoxError):
            self.client._get("/does-not-exist")


class TestHigherLevel(unittest.TestCase):
    def setUp(self):
        self._mock = MockServer()
        self.client = UsbToolBoxClient(self._mock.__enter__(), timeout=2.0)

    def tearDown(self):
        self._mock.__exit__(None, None, None)

    def test_spi_tester_transfer(self):
        spi = SpiTester(self.client, index=0).open()
        spi.init(mode=0, speed_mhz=8, cs=0)
        self.assertEqual(spi.transfer(b"\x01\x02"), b"\x01\x02")
        spi.close()

    def test_i2c_tester_read_reg(self):
        i2c = I2CTester(self.client, index=0).open()
        data = i2c.read_reg(0x50, 0x00, 4)
        self.assertEqual(data, bytes([0x5A] * 4))
        i2c.close()

    def test_serial_send_expect(self):
        # mock 把 write 回显到读缓冲，可验证 send_expect 命中
        ser = SerialTester(self.client, "COM-MOCK").open(115200)
        r = ser.send_expect(b"PING", b"PING", match=MatchMode.EXACT, timeout=1.0)
        self.assertTrue(r.passed)
        ser.close()


if __name__ == "__main__":
    unittest.main()
