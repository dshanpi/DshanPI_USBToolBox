"""SPI 产测封装（基于 CH347）。

在 :class:`UsbToolBoxClient` 之上提供 SPI 初始化、只写/只读/全双工，以及多步工作流执行
与 JSON 预设的加载/保存（预设格式兼容桌面 SPI 工具：``{name, steps:[{type,data,readLen}]}``）。

工作流步骤类型（与 SPI 工具一致）：
    send       —— MOSI 只写，data 为 hex
    duplex     —— 全双工，data 为 hex，返回等长读
    dc_low/dc_high   —— DC = GPIO4（命令/数据）
    reset_low/reset_high —— RST = GPIO5（复位/运行）
    delay      —— 延时，data 为微秒
    cs_low/cs_high   —— 片选；REST 切片下 SPI 写自动控制 CS，这两步按 no-op 处理
"""

from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

from .client import UsbToolBoxClient

# GPIO 位掩码：DC=GPIO4，RST=GPIO5（与桌面工具 useSpiEngine 一致）
_DC_MASK = 0x10
_RST_MASK = 0x20


def _to_bytes(data) -> bytes:
    """把多种输入统一转成 bytes，让用户写命令/数据时更顺心。

    支持的输入（按顺序尝试）：
      - bytes / bytearray        → 原样
      - int（单个命令/数据字节）   → bytes([v & 0xFF])
      - str                       → 当作 hex（忽略空格/逗号/0x），如 "A1 C8" / "A1C8" / "0xA1"
      - 其它可迭代对象（list 等）  → 每项当作一个字节（int）

    例：
      _to_bytes(0xAE)        == b"\\xAE"
      _to_bytes([0xA1, 0xC8]) == b"\\xA1\\xC8"
      _to_bytes("A1 C8")     == b"\\xA1\\xC8"
      _to_bytes(b"\\xAF")     == b"\\xAF"
    """
    if isinstance(data, (bytes, bytearray)):
        return bytes(data)
    if isinstance(data, int):
        return bytes([data & 0xFF])
    if isinstance(data, str):
        cleaned = data.replace("0x", "").replace("0X", "")
        cleaned = "".join(c for c in cleaned if c not in " ,\t")
        return bytes.fromhex(cleaned)
    # 可迭代：list / tuple / generator
    return bytes((int(v) & 0xFF) for v in data)


class SpiTester:
    """SPI 产测器。

    :param client: 已连接的 :class:`UsbToolBoxClient`。
    :param index:  CH347 设备索引。
    """

    def __init__(self, client: UsbToolBoxClient, index: int = 0):
        self.client = client
        self.index = index

    # ─── 连接 / 初始化 ─────────────────────────────────

    def open(self) -> "SpiTester":
        """打开 CH347 设备。"""
        self.client.ch347_open(self.index)
        return self

    def close(self) -> None:
        """关闭 CH347 设备。"""
        self.client.ch347_close(self.index)

    # ─── 上下文管理：with SpiTester(...) as spi 自动 open/close ───
    def __enter__(self) -> "SpiTester":
        return self.open()

    def __exit__(self, *exc) -> None:
        self.close()

    def init(self, *, mode: int = 0, speed_mhz: Optional[int] = 8, cs: int = 0,
             data_bits: int = 8, byte_order: int = 1) -> "SpiTester":
        """初始化 SPI 传输层。默认 Mode0 / 8MHz / CS0 / 8bit / MSB，通常无需传参。"""
        self.client.spi_init(self.index, mode=mode, speed_mhz=speed_mhz, cs=cs,
                             data_bits=data_bits, byte_order=byte_order)
        return self

    # ─── 单次传输 ──────────────────────────────────────

    def write(self, data, cs: Optional[int] = None) -> None:
        """SPI 只写。``data`` 支持灵活输入：int / list[int] / "A1 C8" hex 串 / bytes。"""
        self.client.spi_write(self.index, _to_bytes(data), cs)

    def read(self, length: int, cs: Optional[int] = None) -> bytes:
        return self.client.spi_read(self.index, length, cs)

    def transfer(self, data, cs: Optional[int] = None) -> bytes:
        """SPI 全双工。``data`` 支持灵活输入（同 write）。"""
        return self.client.spi_transfer(self.index, _to_bytes(data), cs)

    # ─── 命令 / 数据便捷发送（自动切 DC）────────────────

    def cmd(self, *cmds) -> None:
        """发送命令（DC=0 命令模式）。每个参数都会自动转字节，省去手写 ``b"..."``。

        支持的参数形式（可混用）：
            spi.cmd(0xAE)                # 单字节
            spi.cmd(0xA1, 0xC8)          # 多条命令，每条一次传输
            spi.cmd([0xA8, 0x3F])         # 一条多字节命令
            spi.cmd("A1C8", "D9 F1")      # hex 串

        等价于：``spi.set_dc(False); for c in cmds: spi.write(...)``
        """
        self.set_dc(False)
        for c in cmds:
            self.write(c)

    def data(self, data) -> None:
        """发送显存/参数数据（DC=1 数据模式）。``data`` 支持灵活输入（同 write）。

        等价于：``spi.set_dc(True); spi.write(data)``
        """
        self.set_dc(True)
        self.write(data)

    # ─── GPIO（DC / RST）─────────────────────────────

    def set_dc(self, high: bool) -> None:
        self.client.gpio_set(self.index, _DC_MASK, _DC_MASK, _DC_MASK if high else 0)

    def set_rst(self, high: bool) -> None:
        self.client.gpio_set(self.index, _RST_MASK, _RST_MASK, _RST_MASK if high else 0)

    # ─── 工作流 ────────────────────────────────────────

    def run_workflow(self, steps: List[Dict[str, Any]]) -> List[Optional[bytes]]:
        """执行一组工作流步骤，返回每步的读结果（无读结果为 None）。"""
        out: List[Optional[bytes]] = []
        for step in steps:
            t = step.get("type")
            data = step.get("data", "")
            if t == "send":
                self.write(bytes.fromhex(data.replace(" ", "")))
                out.append(None)
            elif t == "duplex":
                rx = self.transfer(bytes.fromhex(data.replace(" ", "")))
                out.append(rx)
            elif t == "dc_low":
                self.set_dc(False); out.append(None)
            elif t == "dc_high":
                self.set_dc(True); out.append(None)
            elif t == "reset_low":
                self.set_rst(False); out.append(None)
            elif t == "reset_high":
                self.set_rst(True); out.append(None)
            elif t == "delay":
                time.sleep((int(data) if str(data).isdigit() else 0) / 1_000_000)
                out.append(None)
            elif t in ("cs_low", "cs_high"):
                # 切片下 SPI 写自动控制 CS，这里 no-op
                out.append(None)
            else:
                out.append(None)
        return out

    # ─── 预设（兼容桌面 SPI 工具格式）──────────────────

    @staticmethod
    def load_preset(path: str) -> List[Dict[str, Any]]:
        """从 JSON 文件加载预设，返回 steps 列表。

        支持两种顶层结构：``{"name":..., "steps":[...]}`` 或直接的步骤数组。
        """
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data.get("steps", [])
        if isinstance(data, list):
            return data
        return []

    @staticmethod
    def save_preset(path: str, steps: List[Dict[str, Any]], name: str = "preset") -> None:
        """保存预设到 JSON 文件（与桌面 SPI 工具格式兼容）。"""
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"name": name, "steps": steps}, f, ensure_ascii=False, indent=2)

    def run_preset(self, path: str) -> List[Optional[bytes]]:
        """加载并执行预设工作流。"""
        return self.run_workflow(self.load_preset(path))
