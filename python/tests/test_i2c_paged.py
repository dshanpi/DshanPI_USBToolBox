"""I2C 页写（page-write）拆分逻辑的单元测试，验证按页边界分块、不回绕。"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usbtoolbox.tester import UsbToolBoxClient, I2CTester  # noqa: E402
from tests.mock_server import MockServer  # noqa: E402


def _first_data_byte(hex_str: str) -> int:
    """writeData hex 第一个字节是 slave<<1，第二个起是 reg/data。返回 data 部分字节数。"""
    bs = bytes.fromhex(hex_str)
    return len(bs) - 2  # 减去 slave + reg(8bit)


class TestPagedWrite(unittest.TestCase):
    def setUp(self):
        self._mock = MockServer()
        self.base = self._mock.__enter__()
        self.client = UsbToolBoxClient(self.base, timeout=2.0)

    def tearDown(self):
        self._mock.__exit__(None, None, None)

    def test_no_page_single_write(self):
        """不填 page_size → 单次整块写（保持原行为）。"""
        i2c = I2CTester(self.client, index=0).open()
        i2c.write_reg(0x50, 0x00, b"\x01\x02\x03\x04")
        self.assertEqual(len(self._mock.i2c_writes), 1)
        i2c.close()

    def test_page8_splits_16bytes_into_2(self):
        """8 字节页、写 16 字节 → 应拆成 2 次，各 8 字节数据。"""
        i2c = I2CTester(self.client, index=0).open()
        payload = bytes(range(16))  # 0x00..0x0F
        i2c.write_reg(0x50, 0x00, payload, page_size=8, write_delay_ms=0)
        writes = self._mock.i2c_writes
        self.assertEqual(len(writes), 2)
        # 第一次：reg=0，data=0..7
        b0 = bytes.fromhex(writes[0])
        self.assertEqual(b0[0], 0x50 << 1)   # slave<<1
        self.assertEqual(b0[1], 0x00)        # reg 0
        self.assertEqual(b0[2:], bytes(range(8)))
        # 第二次：reg=8，data=8..15（跨页边界后从下一页起，未回绕）
        b1 = bytes.fromhex(writes[1])
        self.assertEqual(b1[1], 0x08)        # reg 8
        self.assertEqual(b1[2:], bytes(range(8, 16)))
        i2c.close()

    def test_page_boundary_alignment(self):
        """起始地址非页对齐：写到 0x05，页大小 8，写 10 字节 →
        第一块只写到页边界(0x05..0x07=3字节)，第二块从 0x08 起。"""
        i2c = I2CTester(self.client, index=0).open()
        payload = bytes([0xAA] * 10)
        i2c.write_reg(0x50, 0x05, payload, page_size=8, write_delay_ms=0)
        writes = self._mock.i2c_writes
        self.assertEqual(len(writes), 2)
        b0 = bytes.fromhex(writes[0])
        self.assertEqual(b0[1], 0x05)             # reg 5
        self.assertEqual(len(b0[2:]), 3)          # 0x05,0x06,0x07 到页边界
        b1 = bytes.fromhex(writes[1])
        self.assertEqual(b1[1], 0x08)             # reg 8 起新页
        self.assertEqual(len(b1[2:]), 7)          # 剩余 7 字节
        i2c.close()

    def test_write_block_paged(self):
        """write_block 同样支持 page_size。"""
        i2c = I2CTester(self.client, index=0).open()
        i2c.write_block(0x50, 0x00, b"\x01" * 20, page_size=8, write_delay_ms=0)
        self.assertEqual(len(self._mock.i2c_writes), 3)  # 8+8+4
        i2c.close()

    def test_chunked_read(self):
        """read_reg 分块读：读 16 字节按 chunk=8 应拆成 2 次传输，寄存器地址递增。"""
        i2c = I2CTester(self.client, index=0).open()
        i2c.read_reg(0x50, 0x00, 16, chunk=8)
        # read 也会触发 i2c_writes 记录（writeData 含 slave+reg）
        # 第一次 reg=0，第二次 reg=8
        ws = self._mock.i2c_writes
        self.assertGreaterEqual(len(ws), 2)
        b0 = bytes.fromhex(ws[0])
        b1 = bytes.fromhex(ws[1])
        self.assertEqual(b0[1], 0x00)
        self.assertEqual(b1[1], 0x08)
        i2c.close()


if __name__ == "__main__":
    unittest.main()
