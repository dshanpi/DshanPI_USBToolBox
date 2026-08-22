"""产测配置加载（纯标准库，无需 PyYAML）。

支持 YAML 子集与 JSON。YAML 子集覆盖产测配置常见写法：
  - 嵌套映射（缩进，建议 2 空格）
  - 列表（``- item``）
  - 标量：int / float / true|false / null|~ / 带引号或裸字符串
  - 整行注释与行内 ``#`` 注释（引号内的 # 不当注释）

不追求完整 YAML 规范，只为读产测配置（默认端口、波特率、CH347 参数、base_url 等）。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple


# ─── YAML 子集解析 ────────────────────────────────────

def _strip_comment(line: str) -> str:
    """去掉行内注释（引号内的 # 不处理）。"""
    out = []
    quote = None
    for ch in line:
        if quote:
            out.append(ch)
            if ch == quote:
                quote = None
        elif ch in ("'", '"'):
            quote = ch
            out.append(ch)
        elif ch == "#":
            break
        else:
            out.append(ch)
    return "".join(out).rstrip()


def _parse_scalar(s: str) -> Any:
    s = s.strip()
    if s == "" or s in ("null", "~", "Null", "NULL"):
        return None
    if s in ("true", "True", "TRUE"):
        return True
    if s in ("false", "False", "FALSE"):
        return False
    if (s[0] == '"' and s[-1] == '"') or (s[0] == "'" and s[-1] == "'"):
        return s[1:-1]
    # 数字
    try:
        return int(s, 0) if s.lower().startswith("0x") else int(s)
    except ValueError:
        pass
    try:
        return float(s)
    except ValueError:
        pass
    return s


def _indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def parse_yaml(text: str) -> Any:
    """把 YAML 子集文本解析成 Python 对象。"""
    # 预处理：去注释、丢空行，保留缩进
    raw_lines: List[str] = []
    for ln in text.splitlines():
        stripped = _strip_comment(ln)
        if stripped.strip() == "":
            continue
        raw_lines.append(stripped)
    if not raw_lines:
        return {}

    pos = 0

    def parse_block(indent: int) -> Any:
        nonlocal pos
        # 判断是列表还是映射
        first = raw_lines[pos]
        if first.lstrip().startswith("- "):
            return parse_list(indent)
        return parse_map(indent)

    def parse_list(indent: int) -> List[Any]:
        nonlocal pos
        items: List[Any] = []
        while pos < len(raw_lines):
            line = raw_lines[pos]
            cur = _indent_of(line)
            if cur < indent or not line.lstrip().startswith("- "):
                break
            content = line.lstrip()[2:]  # 去掉 "- "
            if content.strip() == "":
                pos += 1
                items.append(parse_block(indent + 2))
            elif ":" in content and not _looks_like_scalar_with_colon(content):
                # 行内起一个映射：把 "- key: val" 当作该缩进+2 的映射首行
                raw_lines[pos] = " " * (cur + 2) + content
                items.append(parse_map(cur + 2))
            else:
                items.append(_parse_scalar(content))
                pos += 1
        return items

    def parse_map(indent: int) -> Dict[str, Any]:
        nonlocal pos
        result: Dict[str, Any] = {}
        while pos < len(raw_lines):
            line = raw_lines[pos]
            cur = _indent_of(line)
            if cur < indent:
                break
            if line.lstrip().startswith("- "):
                break
            key, _, val = line.lstrip().partition(":")
            key = key.strip()
            val = val.strip()
            if val == "":
                # 子块
                pos += 1
                if pos < len(raw_lines) and _indent_of(raw_lines[pos]) > cur:
                    result[key] = parse_block(_indent_of(raw_lines[pos]))
                else:
                    result[key] = None
            else:
                result[key] = _parse_scalar(val)
                pos += 1
        return result

    def _looks_like_scalar_with_colon(content: str) -> bool:
        # "- http://x" 这种含 ":" 但其实是标量
        key = content.split(":", 1)[0]
        return "/" in key or " " in key.strip()

    return parse_block(_indent_of(raw_lines[0]))


def load_config_text(text: str) -> Dict[str, Any]:
    """从文本加载配置：先试 JSON，再试 YAML 子集。"""
    text = text.strip()
    if not text:
        return {}
    if text[0] in "{[":
        try:
            return json.loads(text)
        except ValueError:
            pass
    result = parse_yaml(text)
    return result if isinstance(result, dict) else {"value": result}


def load_config_file(path: str) -> Dict[str, Any]:
    """从 .yaml / .yml / .json 文件加载配置。"""
    with open(path, "r", encoding="utf-8") as f:
        return load_config_text(f.read())


# ─── 强类型配置封装 ──────────────────────────────────

@dataclass
class TesterConfig:
    """产测默认参数。可由 :func:`TesterConfig.from_dict` / :func:`from_file` 构造。"""

    base_url: str = "http://127.0.0.1:8765"
    timeout: float = 5.0
    #: 串口默认
    serial_port: str = ""
    baud_rate: int = 115200
    data_bits: int = 8
    stop_bits: int = 1
    parity: str = "none"
    #: CH347 默认
    ch347_index: int = 0
    spi_mode: int = 0
    spi_speed_mhz: int = 8
    spi_cs: int = 0
    i2c_speed_khz: int = 100
    #: 其余自定义项原样保留
    extra: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TesterConfig":
        d = dict(data or {})
        known = {f for f in cls.__dataclass_fields__ if f != "extra"}  # type: ignore[attr-defined]
        # 支持 camelCase 与 snake_case 两种 key
        def pick(*names, default):
            for n in names:
                if n in d:
                    return d.pop(n)
            return default
        cfg = cls(
            base_url=pick("base_url", "baseUrl", default=cls.base_url),
            timeout=pick("timeout", default=cls.timeout),
            serial_port=pick("serial_port", "serialPort", "port", default=cls.serial_port),
            baud_rate=pick("baud_rate", "baudRate", "baud", default=cls.baud_rate),
            data_bits=pick("data_bits", "dataBits", default=cls.data_bits),
            stop_bits=pick("stop_bits", "stopBits", default=cls.stop_bits),
            parity=pick("parity", default=cls.parity),
            ch347_index=pick("ch347_index", "ch347Index", "index", default=cls.ch347_index),
            spi_mode=pick("spi_mode", "spiMode", default=cls.spi_mode),
            spi_speed_mhz=pick("spi_speed_mhz", "spiSpeedMhz", default=cls.spi_speed_mhz),
            spi_cs=pick("spi_cs", "spiCs", default=cls.spi_cs),
            i2c_speed_khz=pick("i2c_speed_khz", "i2cSpeedKhz", default=cls.i2c_speed_khz),
        )
        # 剩余未识别的 key 全部放进 extra
        cfg.extra = {k: v for k, v in d.items() if k not in known}
        return cfg

    @classmethod
    def from_file(cls, path: str) -> "TesterConfig":
        return cls.from_dict(load_config_file(path))

    def make_client(self):
        """用本配置创建 :class:`UsbToolBoxClient`。"""
        from .client import UsbToolBoxClient
        return UsbToolBoxClient(self.base_url, timeout=self.timeout)
