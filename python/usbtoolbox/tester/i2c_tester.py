"""I2C 产测封装（基于 CH347）。

在 :class:`UsbToolBoxClient` 之上提供寄存器读写、块读写、总线扫描与写后回读校验。

I2C 写缓冲约定（与桌面 I2C 工具一致）：
    读：write_data = [addr<<1, regHi?, regLo]，read_len = N
    写：write_data = [addr<<1, regHi?, regLo, *payload]，read_len = 0
其中 16 位寄存器地址高字节在前。
"""

from __future__ import annotations

from typing import List, Optional

from .client import UsbToolBoxClient, UsbToolBoxError

import time


class I2CTester:
    """I2C 产测器。

    :param client: 已连接的 :class:`UsbToolBoxClient`。
    :param index:  CH347 设备索引。
    :param speed_khz: I2C 速度（kHz），可选。
    """

    def __init__(self, client: UsbToolBoxClient, index: int = 0, *, speed_khz: Optional[int] = None):
        self.client = client
        self.index = index
        self.speed_khz = speed_khz

    def open(self) -> "I2CTester":
        """打开 CH347 设备。"""
        self.client.ch347_open(self.index)
        return self

    def close(self) -> None:
        """关闭 CH347 设备。"""
        self.client.ch347_close(self.index)

    # ─── 上下文管理：with I2CTester(...) as i2c 自动 open/close ───
    def __enter__(self) -> "I2CTester":
        return self.open()

    def __exit__(self, *exc) -> None:
        self.close()

    def scan(self) -> List[int]:
        """扫描 1-127 地址，返回有应答的 7 位地址列表。"""
        return self.client.i2c_scan(self.index, speed_khz=self.speed_khz)

    @staticmethod
    def _reg_bytes(reg: int, reg_width: int) -> bytes:
        if reg_width == 16:
            return bytes([(reg >> 8) & 0xFF, reg & 0xFF])
        return bytes([reg & 0xFF])

    def read_reg(self, addr: int, reg: int, length: int = 1, *, reg_width: int = 8,
                 chunk: Optional[int] = None) -> bytes:
        """从从机 ``addr`` 的寄存器 ``reg`` 读 ``length`` 字节。

        :param chunk: 分块读大小。某些 I²C EEPROM 在高速率下一次读较多字节会 NACK，
            分块（每次读 ``chunk`` 字节、自动递增寄存器地址）可显著提升稳定性。
            留空则单次整块读。
        """
        if chunk and chunk > 0 and length > chunk:
            out = bytearray()
            off = 0
            while off < length:
                take = min(chunk, length - off)
                cur = reg + off
                wd = bytes([addr << 1]) + self._reg_bytes(cur, reg_width)
                out += self.client.i2c_transfer(self.index, wd, take, speed_khz=self.speed_khz)
                off += take
            return bytes(out)
        write_data = bytes([addr << 1]) + self._reg_bytes(reg, reg_width)
        return self.client.i2c_transfer(self.index, write_data, length, speed_khz=self.speed_khz)

    def write_reg(self, addr: int, reg: int, payload: bytes, *, reg_width: int = 8,
                  verify: bool = False, page_size: Optional[int] = None,
                  write_delay_ms: float = 5.0) -> None:
        """向从机 ``addr`` 的寄存器 ``reg`` 写 ``payload``。

        :param page_size: EEPROM 页大小。填了则按页边界拆分多次小写、每次后等 ``write_delay_ms``（tWR），
            避免一次写超过页大小导致地址回绕覆盖（24Cxx 系列典型页大小 8/16/32/64）。
            留空则单次整块写（适合传感器等无页概念器件）。
        :param write_delay_ms: 每次页写后等待芯片内部写完成的延时（毫秒），仅 ``page_size`` 生效时使用。
        :param verify: 写后回读比对。
        """
        if page_size and page_size > 0:
            self._write_paged(addr, reg, payload, reg_width=reg_width,
                              page_size=page_size, write_delay_ms=write_delay_ms)
        else:
            write_data = bytes([addr << 1]) + self._reg_bytes(reg, reg_width) + payload
            self.client.i2c_transfer(self.index, write_data, 0, speed_khz=self.speed_khz)
        if verify:
            back = self.read_reg(addr, reg, len(payload), reg_width=reg_width)
            if back != payload:
                raise UsbToolBoxError(
                    f"I2C 回读校验失败 @0x{addr:02x} reg 0x{reg:x}: 写 {payload.hex()} 读回 {back.hex()}"
                )

    def _write_paged(self, addr: int, reg: int, payload: bytes, *, reg_width: int,
                     page_size: int, write_delay_ms: float) -> None:
        """按页边界拆分多次小写，每次后等 tWR，避免页写回绕覆盖。"""
        # 单次写能容纳的数据字节：缓冲上限留余量
        reg_bytes = reg_width // 8
        max_buf = 60
        chunk = min(page_size, max_buf - reg_bytes)
        off = 0
        while off < len(payload):
            cur_reg = reg + off
            page_boundary = (cur_reg // page_size + 1) * page_size
            max_by_page = page_boundary - cur_reg
            take = min(chunk, max_by_page, len(payload) - off)
            write_data = (bytes([addr << 1]) + self._reg_bytes(cur_reg, reg_width)
                          + payload[off:off + take])
            self.client.i2c_transfer(self.index, write_data, 0, speed_khz=self.speed_khz)
            off += take
            # tWR：每次页写后都等芯片内部写完成（含最后一次）。
            # 若只在中间等、最后一次不等，紧接的回读校验/下一操作会撞上 EEPROM 的 busy
            # 周期 -> NACK -> "I2C transfer failed"（HTTP 400）。
            time.sleep(write_delay_ms / 1000.0)

    def read_block(self, addr: int, reg: int, length: int, *, reg_width: int = 8,
                   chunk: Optional[int] = None) -> bytes:
        """块读（多字节连续读）。``chunk`` 见 :meth:`read_reg`。"""
        return self.read_reg(addr, reg, length, reg_width=reg_width, chunk=chunk)

    def write_block(self, addr: int, reg: int, payload: bytes, *, reg_width: int = 8,
                    verify: bool = False, page_size: Optional[int] = None,
                    write_delay_ms: float = 5.0) -> None:
        """块写（多字节连续写）。参数同 :meth:`write_reg`。"""
        self.write_reg(addr, reg, payload, reg_width=reg_width, verify=verify,
                       page_size=page_size, write_delay_ms=write_delay_ms)
