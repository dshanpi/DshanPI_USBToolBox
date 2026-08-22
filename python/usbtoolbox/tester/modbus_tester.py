"""Modbus 产测封装（纯 Python 帧组装，走 USBToolBox 串口端点传输）。

Rust 后端不含 Modbus 逻辑：本模块在 Python 侧实现 RTU 的 CRC16 与帧组装、异常码解析，
并通过 :class:`UsbToolBoxClient` 的串口读写端点收发。亦提供 TCP MBAP 帧的构造/解析辅助
（当前 HTTP 切片仅暴露串口传输，TCP 待后续增量接入传输层）。

支持功能码：01 读线圈、02 读离散输入、03 读保持寄存器、04 读输入寄存器、
05 写单线圈、06 写单寄存器、15 写多线圈、16 写多寄存器。
"""

from __future__ import annotations

import time
from typing import List, Optional

from .client import UsbToolBoxClient

#: Modbus 异常码 → 文案
_EXCEPTION_TEXT = {
    0x01: "ILLEGAL FUNCTION",
    0x02: "ILLEGAL DATA ADDRESS",
    0x03: "ILLEGAL DATA VALUE",
    0x04: "SLAVE DEVICE FAILURE",
    0x05: "ACKNOWLEDGE",
    0x06: "SLAVE DEVICE BUSY",
    0x08: "MEMORY PARITY ERROR",
    0x0A: "GATEWAY PATH UNAVAILABLE",
    0x0B: "GATEWAY TARGET DEVICE FAILED TO RESPOND",
}


class ModbusError(RuntimeError):
    """Modbus 异常响应或帧/CRC 校验失败时抛出。"""


def crc16(data: bytes) -> int:
    """Modbus RTU CRC-16（多项式 0xA001），返回 16 位结果（低字节在前发送）。"""
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


def build_rtu_frame(unit: int, pdu: bytes) -> bytes:
    """组装 RTU 帧：unit + PDU + CRC(lo,hi)。"""
    body = bytes([unit]) + pdu
    crc = crc16(body)
    return body + bytes([crc & 0xFF, (crc >> 8) & 0xFF])


def build_tcp_frame(unit: int, pdu: bytes, transaction_id: int = 1) -> bytes:
    """组装 Modbus TCP（MBAP）帧 —— 供后续 TCP 传输使用。"""
    length = len(pdu) + 1  # unit + pdu
    mbap = bytes([
        (transaction_id >> 8) & 0xFF, transaction_id & 0xFF,
        0x00, 0x00,  # protocol id
        (length >> 8) & 0xFF, length & 0xFF,
        unit & 0xFF,
    ])
    return mbap + pdu


class ModbusTester:
    """Modbus RTU 产测器（串口传输）。

    :param client: 已连接的 :class:`UsbToolBoxClient`。
    :param port:   串口名。
    :param unit:   从机地址（unit id）。
    :param response_timeout: 等待响应秒数。
    """

    def __init__(self, client: UsbToolBoxClient, port: str, unit: int = 1, *,
                 response_timeout: float = 1.0):
        self.client = client
        self.port = port
        self.unit = unit
        self.response_timeout = response_timeout

    def open(self, baud_rate: int = 9600, *, data_bits: int = 8, stop_bits: int = 1,
             parity: str = "none") -> "ModbusTester":
        """打开串口（默认 9600 8N1，Modbus RTU 常见配置）。返回 self 支持链式。"""
        self.client.serial_open(self.port, baud_rate, data_bits=data_bits, stop_bits=stop_bits,
                                parity=parity)
        return self

    def close(self) -> None:
        """关闭串口。"""
        self.client.serial_close(self.port)

    # ─── 上下文管理：进入前需先 open()，退出自动 close ───
    def __enter__(self) -> "ModbusTester":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # ─── 收发底层 ──────────────────────────────────────

    def _transact(self, pdu: bytes, expected_len: int) -> bytes:
        """发 RTU 请求并读回完整响应（按 expected_len 等待），返回响应 PDU（去掉 unit + CRC）。"""
        frame = build_rtu_frame(self.unit, pdu)
        # 清空残留
        self.client.serial_read(self.port, 65536)
        self.client.serial_write(self.port, frame)

        buf = b""
        deadline = time.time() + self.response_timeout
        # 异常响应固定 5 字节（unit+func|0x80+code+crc*2）
        target = max(expected_len, 5)
        while time.time() < deadline and len(buf) < target:
            chunk = self.client.serial_read(self.port, 256)
            if chunk:
                buf += chunk
            else:
                time.sleep(0.01)

        if len(buf) < 5:
            raise ModbusError(f"响应过短/超时：收到 {buf.hex()}")

        # 异常帧检查
        func = buf[1]
        if func & 0x80:
            code = buf[2]
            raise ModbusError(f"Modbus 异常 0x{code:02x}: {_EXCEPTION_TEXT.get(code, 'UNKNOWN')}")

        # CRC 校验（取前 expected_len 字节）
        resp = buf[:expected_len]
        body, crc_rx = resp[:-2], resp[-2] | (resp[-1] << 8)
        if crc16(body) != crc_rx:
            raise ModbusError(f"CRC 校验失败：{resp.hex()}")
        return body[1:]  # 去掉 unit，返回 PDU

    # ─── 读 ────────────────────────────────────────────

    def _read_bits(self, func: int, start: int, count: int) -> List[bool]:
        pdu = bytes([func, (start >> 8) & 0xFF, start & 0xFF, (count >> 8) & 0xFF, count & 0xFF])
        nbytes = (count + 7) // 8
        resp_pdu = self._transact(pdu, expected_len=1 + 1 + 1 + nbytes + 2)
        # resp_pdu = [func, byte_count, *data]
        data = resp_pdu[2:2 + resp_pdu[1]]
        bits: List[bool] = []
        for i in range(count):
            bits.append(bool((data[i // 8] >> (i % 8)) & 1))
        return bits

    def read_coils(self, start: int, count: int) -> List[bool]:
        """功能码 01。"""
        return self._read_bits(0x01, start, count)

    def read_discrete_inputs(self, start: int, count: int) -> List[bool]:
        """功能码 02。"""
        return self._read_bits(0x02, start, count)

    def _read_registers(self, func: int, start: int, count: int) -> List[int]:
        pdu = bytes([func, (start >> 8) & 0xFF, start & 0xFF, (count >> 8) & 0xFF, count & 0xFF])
        resp_pdu = self._transact(pdu, expected_len=1 + 1 + 1 + count * 2 + 2)
        data = resp_pdu[2:2 + resp_pdu[1]]
        return [(data[i * 2] << 8) | data[i * 2 + 1] for i in range(count)]

    def read_holding_registers(self, start: int, count: int) -> List[int]:
        """功能码 03。"""
        return self._read_registers(0x03, start, count)

    def read_input_registers(self, start: int, count: int) -> List[int]:
        """功能码 04。"""
        return self._read_registers(0x04, start, count)

    # ─── 写 ────────────────────────────────────────────

    def write_coil(self, addr: int, value: bool, *, verify: bool = False) -> None:
        """功能码 05。"""
        val = 0xFF00 if value else 0x0000
        pdu = bytes([0x05, (addr >> 8) & 0xFF, addr & 0xFF, (val >> 8) & 0xFF, val & 0xFF])
        self._transact(pdu, expected_len=8)
        if verify and self.read_coils(addr, 1)[0] != value:
            raise ModbusError(f"写线圈回读校验失败 @{addr}")

    def write_register(self, addr: int, value: int, *, verify: bool = False) -> None:
        """功能码 06。"""
        pdu = bytes([0x06, (addr >> 8) & 0xFF, addr & 0xFF, (value >> 8) & 0xFF, value & 0xFF])
        self._transact(pdu, expected_len=8)
        if verify and self.read_holding_registers(addr, 1)[0] != (value & 0xFFFF):
            raise ModbusError(f"写寄存器回读校验失败 @{addr}")

    def write_coils(self, start: int, values: List[bool], *, verify: bool = False) -> None:
        """功能码 15。"""
        count = len(values)
        nbytes = (count + 7) // 8
        data = bytearray(nbytes)
        for i, v in enumerate(values):
            if v:
                data[i // 8] |= 1 << (i % 8)
        pdu = bytes([0x0F, (start >> 8) & 0xFF, start & 0xFF,
                     (count >> 8) & 0xFF, count & 0xFF, nbytes]) + bytes(data)
        self._transact(pdu, expected_len=8)
        if verify and self.read_coils(start, count) != values:
            raise ModbusError(f"写多线圈回读校验失败 @{start}")

    def write_registers(self, start: int, values: List[int], *, verify: bool = False) -> None:
        """功能码 16。"""
        count = len(values)
        data = bytearray()
        for v in values:
            data += bytes([(v >> 8) & 0xFF, v & 0xFF])
        pdu = bytes([0x10, (start >> 8) & 0xFF, start & 0xFF,
                     (count >> 8) & 0xFF, count & 0xFF, count * 2]) + bytes(data)
        self._transact(pdu, expected_len=8)
        if verify:
            back = self.read_holding_registers(start, count)
            if back != [v & 0xFFFF for v in values]:
                raise ModbusError(f"写多寄存器回读校验失败 @{start}: 读回 {back}")
