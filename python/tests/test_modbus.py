"""Modbus 纯 Python 实现的单元测试（CRC、帧、读写，针对内存假从机，无需硬件）。"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usbtoolbox.tester import ModbusTester, ModbusError, crc16, build_rtu_frame  # noqa: E402


class FakeModbusClient:
    """实现 ModbusTester 用到的 serial_* 接口，内存模拟一个保持寄存器从机（unit=1）。"""

    def __init__(self, unit=1, nregs=16):
        self.unit = unit
        self.regs = [0] * nregs
        self._buf = b""

    # — 传输层（被 ModbusTester 调用）—
    def serial_open(self, *a, **k):
        pass

    def serial_close(self, *a, **k):
        pass

    def serial_read(self, port, max_bytes=4096):
        out, self._buf = self._buf[:max_bytes], self._buf[max_bytes:]
        return out

    def serial_write(self, port, frame):
        self._buf += self._respond(frame)

    # — 从机逻辑 —
    def _respond(self, frame: bytes) -> bytes:
        unit, func = frame[0], frame[1]
        if unit != self.unit:
            return b""
        if func == 0x03:  # read holding
            start = (frame[2] << 8) | frame[3]
            count = (frame[4] << 8) | frame[5]
            data = b""
            for i in range(count):
                v = self.regs[start + i]
                data += bytes([(v >> 8) & 0xFF, v & 0xFF])
            body = bytes([unit, func, len(data)]) + data
        elif func == 0x06:  # write single
            addr = (frame[2] << 8) | frame[3]
            val = (frame[4] << 8) | frame[5]
            self.regs[addr] = val
            body = frame[:6]  # 回显
        elif func == 0x10:  # write multiple
            start = (frame[2] << 8) | frame[3]
            count = (frame[4] << 8) | frame[5]
            nbytes = frame[6]
            data = frame[7:7 + nbytes]
            for i in range(count):
                self.regs[start + i] = (data[i * 2] << 8) | data[i * 2 + 1]
            body = frame[:6]
        else:
            body = bytes([unit, func | 0x80, 0x01])  # illegal function
        crc = crc16(body)
        return body + bytes([crc & 0xFF, (crc >> 8) & 0xFF])


class TestCrc16(unittest.TestCase):
    def test_standard_check_value(self):
        # CRC-16/MODBUS 标准校验值："123456789" -> 0x4B37
        self.assertEqual(crc16(b"123456789"), 0x4B37)

    def test_frame_crc_roundtrip(self):
        frame = build_rtu_frame(1, bytes([0x03, 0x00, 0x00, 0x00, 0x01]))
        body, lo, hi = frame[:-2], frame[-2], frame[-1]
        self.assertEqual(crc16(body), lo | (hi << 8))


class TestModbusTester(unittest.TestCase):
    def setUp(self):
        self.fake = FakeModbusClient(unit=1)
        self.mb = ModbusTester(self.fake, "COM-FAKE", unit=1, response_timeout=0.5)

    def test_write_then_read(self):
        self.mb.write_register(2, 0x1234, verify=True)
        self.assertEqual(self.mb.read_holding_registers(2, 1), [0x1234])

    def test_write_multiple(self):
        self.mb.write_registers(0, [10, 20, 30], verify=True)
        self.assertEqual(self.mb.read_holding_registers(0, 3), [10, 20, 30])

    def test_exception_raised(self):
        # 功能码 04（输入寄存器）在假从机里未实现 -> 返回非法功能异常
        with self.assertRaises(ModbusError):
            self.mb.read_input_registers(0, 1)


if __name__ == "__main__":
    unittest.main()
