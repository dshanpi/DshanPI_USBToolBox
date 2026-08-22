"""串口产测封装。

在 :class:`UsbToolBoxClient` 之上提供产测友好的串口能力：
打开/配置、发送并等待期望响应（支持精确/正则/hex 通配三种匹配）、批量步骤序列、
ANSI 转义剥离、结构化结果。

注意：底层串口读取是非阻塞 drain（服务端环形缓冲），这里用轮询 + 超时实现"等待响应"。
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Union

from .client import UsbToolBoxClient

# 剥离 ANSI 转义序列（CSI / 颜色等），跨包累积时也适用
_ANSI_RE = re.compile(rb"\x1b\[[0-9;?]*[ -/]*[@-~]")


def strip_ansi(data: bytes) -> bytes:
    """剥离 ANSI 转义序列。"""
    return _ANSI_RE.sub(b"", data)


class MatchMode(str, Enum):
    """期望响应的匹配方式。

    通常无需手动指定——``send_expect`` / ``SerialStep`` 会按 ``expect`` 的内容自动推断：
    ``/pattern/`` → 正则；含 ``??`` 或纯 hex（如 ``"A5 01 5A"``）→ hex 通配；其余 → 精确包含。
    """

    EXACT = "exact"      #: 精确包含匹配（响应包含期望子串即通过）
    REGEX = "regex"      #: 正则匹配
    HEX_WILDCARD = "hex" #: 十六进制通配（如 "A5 ?? 5A"，?? 匹配任意一字节）


def _hex_wildcard_to_regex(pattern: str) -> re.Pattern:
    """把 "A5 ?? 5A" 形式的 hex 通配模式编译成字节正则。"""
    tokens = pattern.replace(",", " ").split()
    parts: List[bytes] = []
    for tok in tokens:
        if tok in ("??", "**", "xx", "XX"):
            parts.append(b".")
        else:
            parts.append(re.escape(bytes([int(tok, 16)])))
    return re.compile(b"".join(parts), re.DOTALL)


def _to_bytes(data) -> bytes:
    """把多种输入统一转成 bytes（与 SpiTester 一致的灵活输入）。

    支持：bytes/bytearray（原样）、int（单字节）、str（hex 串，如 "A1 C8"）、list[int]。
    """
    if isinstance(data, (bytes, bytearray)):
        return bytes(data)
    if isinstance(data, int):
        return bytes([data & 0xFF])
    if isinstance(data, str):
        cleaned = data.replace("0x", "").replace("0X", "")
        cleaned = "".join(c for c in cleaned if c not in " ,\t")
        return bytes.fromhex(cleaned)
    return bytes((int(v) & 0xFF) for v in data)


def _is_hex_str(s: str) -> bool:
    """判断字符串是否"看起来像 hex"：去空格/逗号后是偶数长度的纯 hex。"""
    cleaned = s.replace("0x", "").replace("0X", "")
    cleaned = "".join(c for c in cleaned if c not in " ,\t")
    if not cleaned or len(cleaned) % 2 != 0:
        return False
    return all(c in "0123456789abcdefABCDEF" for c in cleaned)


def _infer_match(expect) -> MatchMode:
    """按 expect 的内容自动推断匹配模式，省去手动传 match=。

    - str 且以 /.../ 包裹 → REGEX（如 r"/\\d+\\.\\d+/"，注意转义）
    - str 含 ?? 或全是 hex → HEX_WILDCARD（如 "A5 ?? 5A" / "A5015A"）
    - 其余（普通文本/bytes）→ EXACT
    """
    if isinstance(expect, str):
        if len(expect) >= 2 and expect.startswith("/") and expect.endswith("/"):
            return MatchMode.REGEX
        if "??" in expect or _is_hex_str(expect):
            return MatchMode.HEX_WILDCARD
    return MatchMode.EXACT


def _expect_to_pattern(expect, mode: MatchMode, encoding: str = "utf-8") -> bytes:
    """把 expect（含 //、hex 通配、普通文本）按模式转成可搜索的字节模式（EXACT 时为子串）。"""
    if mode == MatchMode.REGEX:
        s = expect.decode(encoding) if isinstance(expect, bytes) else expect
        s = s[1:-1] if len(s) >= 2 and s.startswith("/") and s.endswith("/") else s
        return s.encode(encoding)
    if mode == MatchMode.HEX_WILDCARD:
        s = expect.decode() if isinstance(expect, bytes) else expect
        return _hex_wildcard_to_regex(s).pattern  # 返回编译后的字节正则 pattern
    # EXACT：转成字节子串
    return expect if isinstance(expect, bytes) else expect.encode(encoding)


@dataclass
class SerialStep:
    """一个串口测试步骤。

    :param send:   要发送的数据。str 按文本编码（如 ``"AT\\r\\n"``）；int/list/bytes 发原始字节。
    :param expect: 期望响应。模式**自动推断**（/正则/、含??或纯hex→通配、其余→精确包含），
                   一般无需填 ``match``。
    :param match:  手动指定匹配模式（一般留给自动推断）。
    """

    label: str
    send: Union[bytes, str, int, list]
    expect: Optional[Union[bytes, str]] = None
    match: Optional[MatchMode] = None   #: None = 自动推断（推荐）
    timeout: float = 1.0       #: 等待响应秒数
    retries: int = 0           #: 失败重试次数
    interval: float = 0.0      #: 发送前等待秒数
    encoding: str = "utf-8"    #: send/expect 为 str 时的编码


@dataclass
class SerialStepResult:
    """单步执行结果。"""

    label: str
    passed: bool
    sent: bytes
    received: bytes
    elapsed: float
    timestamp: float
    attempts: int = 1
    error: Optional[str] = None


class SerialTester:
    """串口产测器。

    :param client: 已连接的 :class:`UsbToolBoxClient`。
    :param port:   串口名（如 ``COM3`` / ``/dev/ttyUSB0``）。
    """

    def __init__(self, client: UsbToolBoxClient, port: str):
        self.client = client
        self.port = port

    # ─── 连接 ──────────────────────────────────────────

    def open(self, baud_rate: int, *, data_bits: int = 8, stop_bits: int = 1,
             parity: str = "none", flow_control: str = "none") -> "SerialTester":
        """打开串口（baud_rate 必填）。返回 self 支持链式。"""
        self.client.serial_open(self.port, baud_rate, data_bits=data_bits, stop_bits=stop_bits,
                                parity=parity, flow_control=flow_control)
        return self

    def close(self) -> None:
        """关闭串口。"""
        self.client.serial_close(self.port)

    # ─── 上下文管理：进入前需先 open()（baud_rate 必填，无法在 __enter__ 自动开），退出自动 close ───
    def __enter__(self) -> "SerialTester":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def flush_input(self) -> bytes:
        """清空并返回当前读缓冲里的残留数据。"""
        return self.client.serial_read(self.port, 65536)

    # ─── 收发 ──────────────────────────────────────────

    @staticmethod
    def _to_bytes_send(v, encoding: str) -> bytes:
        """send 的灵活输入：str 当文本（编码）→ bytes；int/list/bytes 直接转。
        与 SpiTester 不同——串口 send 的 str 默认按文本编码（AT 命令等），
        需发原始 hex 时用 bytes 或 list。"""
        if isinstance(v, str):
            return v.encode(encoding)
        return _to_bytes(v)

    def _matches(self, received: bytes, expect, mode: MatchMode, encoding: str) -> bool:
        if mode == MatchMode.EXACT:
            pat = expect if isinstance(expect, bytes) else expect.encode(encoding)
            return pat in received
        if mode == MatchMode.REGEX:
            s = expect.decode(encoding) if isinstance(expect, bytes) else expect
            s = s[1:-1] if len(s) >= 2 and s.startswith("/") and s.endswith("/") else s
            return re.search(s.encode(encoding), received, re.DOTALL) is not None
        if mode == MatchMode.HEX_WILDCARD:
            s = expect.decode() if isinstance(expect, bytes) else expect
            return _hex_wildcard_to_regex(s).search(received) is not None
        return False

    def send_expect(self, send, expect=None, *, match=None, timeout: float = 1.0,
                    strip_ansi_seq: bool = True, encoding: str = "utf-8") -> SerialStepResult:
        """发送数据并轮询读缓冲直到匹配期望或超时。

        :param send:   要发送的数据。str 按文本编码（如 ``"AT\\r\\n"``）；int/list/bytes 直接发原始字节。
        :param expect: 期望响应。模式**自动推断**，无需传 match：
            - 普通文本（如 ``"OK"``）→ 精确包含匹配
            - ``"/\\d+\\.\\d+/"``（/包裹）→ 正则匹配
            - 含 ``??`` 或纯 hex（如 ``"A5 ?? 5A"``）→ hex 通配
            - None → 仅发送不校验
        :param match:  手动指定模式（一般不用，留给自动推断）。
        :param timeout: 等待响应秒数。
        """
        start = time.time()
        send_bytes = self._to_bytes_send(send, encoding)
        self.flush_input()
        self.client.serial_write(self.port, send_bytes)

        if expect is None:
            return SerialStepResult(label="", passed=True, sent=send_bytes, received=b"",
                                    elapsed=time.time() - start, timestamp=start)

        mode = match if match is not None else _infer_match(expect)
        buf = b""
        deadline = start + timeout
        while time.time() < deadline:
            chunk = self.client.serial_read(self.port, 4096)
            if chunk:
                buf += chunk
                check = strip_ansi(buf) if strip_ansi_seq else buf
                if self._matches(check, expect, mode, encoding):
                    return SerialStepResult(label="", passed=True, sent=send_bytes, received=buf,
                                            elapsed=time.time() - start, timestamp=start)
            else:
                time.sleep(0.02)
        return SerialStepResult(label="", passed=False, sent=send_bytes, received=buf,
                                elapsed=time.time() - start, timestamp=start,
                                error="timeout waiting for expected response")

    # ─── 批量序列 ──────────────────────────────────────

    def run_sequence(self, steps: List[SerialStep]) -> List[SerialStepResult]:
        """按顺序执行步骤，返回每步结果（含重试）。"""
        results: List[SerialStepResult] = []
        for step in steps:
            if step.interval > 0:
                time.sleep(step.interval)
            attempt = 0
            last: Optional[SerialStepResult] = None
            while attempt <= step.retries:
                attempt += 1
                last = self.send_expect(step.send, step.expect, match=step.match,
                                        timeout=step.timeout, encoding=step.encoding)
                last.label = step.label
                last.attempts = attempt
                if last.passed:
                    break
            assert last is not None
            results.append(last)
        return results
