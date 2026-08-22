"""SerialTester 自动推断匹配模式 + 灵活输入的单元测试。"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usbtoolbox.tester.serial_tester import (  # noqa: E402
    _to_bytes, _is_hex_str, _infer_match, MatchMode,
)
from usbtoolbox.tester import UsbToolBoxClient, SerialTester, SerialStep  # noqa: E402
from tests.mock_server import MockServer  # noqa: E402


class TestInferMatch(unittest.TestCase):
    def test_plain_text_exact(self):
        self.assertEqual(_infer_match("OK"), MatchMode.EXACT)
        self.assertEqual(_infer_match("AT\r\n"), MatchMode.EXACT)

    def test_regex_slash(self):
        self.assertEqual(_infer_match(r"/\d+\.\d+/"), MatchMode.REGEX)
        self.assertEqual(_infer_match(r"/:\s*\d+,/"), MatchMode.REGEX)

    def test_hex_wildcard(self):
        self.assertEqual(_infer_match("A5 ?? 5A"), MatchMode.HEX_WILDCARD)
        self.assertEqual(_infer_match("A5 ?? ?? 5A"), MatchMode.HEX_WILDCARD)

    def test_pure_hex(self):
        self.assertEqual(_infer_match("A5 01 5A"), MatchMode.HEX_WILDCARD)
        self.assertEqual(_infer_match("A5015A"), MatchMode.HEX_WILDCARD)

    def test_bytes_exact(self):
        self.assertEqual(_infer_match(b"OK"), MatchMode.EXACT)


class TestIsHex(unittest.TestCase):
    def test_hex(self):
        self.assertTrue(_is_hex_str("A5 01 5A"))
        self.assertTrue(_is_hex_str("A5015A"))

    def test_not_hex(self):
        self.assertFalse(_is_hex_str("OK"))
        self.assertFalse(_is_hex_str("AT\r\n"))
        self.assertFalse(_is_hex_str("A5 B"))  # 奇数长度


class TestToBytes(unittest.TestCase):
    def test_int(self):
        self.assertEqual(_to_bytes(0xA5), b"\xa5")

    def test_list(self):
        self.assertEqual(_to_bytes([0xA5, 0x01]), b"\xa5\x01")

    def test_hex_str(self):
        self.assertEqual(_to_bytes("A5 01"), b"\xa5\x01")

    def test_bytes(self):
        self.assertEqual(_to_bytes(b"\xa5"), b"\xa5")


class TestSendExpectAutoInfer(unittest.TestCase):
    def setUp(self):
        self._mock = MockServer()
        self.client = UsbToolBoxClient(self._mock.__enter__(), timeout=2.0)

    def tearDown(self):
        self._mock.__exit__(None, None, None)

    def test_exact_auto(self):
        ser = SerialTester(self.client, "COM-MOCK").open(115200)
        # mock 把 write 回显到读缓冲，发 "OK" 会读回 "OK" → 精确包含命中
        r = ser.send_expect("OK", "OK", timeout=1.0)
        self.assertTrue(r.passed)
        ser.close()

    def test_regex_auto(self):
        ser = SerialTester(self.client, "COM-MOCK").open(115200)
        r = ser.send_expect("1234.5", r"/\d+\.\d+/", timeout=1.0)
        self.assertTrue(r.passed)
        ser.close()

    def test_hex_wildcard_auto(self):
        ser = SerialTester(self.client, "COM-MOCK").open(115200)
        # send 原始 hex 字节用 list（str 会被当文本编码）；expect 含 ?? 自动 hex 通配
        r = ser.send_expect([0xA5, 0x01, 0x5A], "A5 ?? 5A", timeout=1.0)
        self.assertTrue(r.passed)
        ser.close()


if __name__ == "__main__":
    unittest.main()
