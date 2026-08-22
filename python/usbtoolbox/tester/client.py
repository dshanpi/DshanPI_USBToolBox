"""USBToolBox 本地 HTTP REST 服务的薄客户端（纯标准库实现，无需 pip 依赖）。

封装与主进程内嵌服务（默认 ``http://127.0.0.1:8765``）的 HTTP 通信：
GET/POST、错误 → 异常、字节 ↔ hex 字符串的编解码。上层 ``SerialTester`` /
``I2CTester`` / ``SpiTester`` / ``ModbusTester`` 都建立在本类之上。

仅依赖 Python 标准库（``urllib``），因此随软件内置的可嵌入 Python 即可直接运行，
无需 ``pip install`` 任何东西。
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional


class UsbToolBoxError(RuntimeError):
    """与 USBToolBox 服务通信或设备操作失败时抛出。"""


def _to_hex(data: bytes) -> str:
    return data.hex()


def _from_hex(s: str) -> bytes:
    return bytes.fromhex(s) if s else b""


class UsbToolBoxClient:
    """USBToolBox 内嵌 HTTP 服务的客户端（基于标准库 urllib）。

    :param base_url: 服务地址，默认 ``http://127.0.0.1:8765``。
    :param timeout:  单次请求超时（秒），默认 5。
    """

    def __init__(self, base_url: str = "http://127.0.0.1:8765", timeout: float = 5.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # ─── 底层 HTTP ─────────────────────────────────────

    def _request(self, method: str, path: str, *, json_body: Optional[dict] = None,
                 params: Optional[dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        if params:
            # 过滤 None，拼到 query string
            clean = {k: v for k, v in params.items() if v is not None}
            if clean:
                url = f"{url}?{urllib.parse.urlencode(clean)}"

        data: Optional[bytes] = None
        headers = {"Accept": "application/json"}
        if json_body is not None:
            data = json.dumps(json_body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace") if e.fp else ""
            msg = body
            try:
                msg = json.loads(body).get("error", body)
            except (ValueError, AttributeError):
                pass
            raise UsbToolBoxError(f"{method} {path} -> HTTP {e.code}: {msg}") from e
        except urllib.error.URLError as e:
            raise UsbToolBoxError(f"请求 {method} {path} 失败：{e.reason}") from e

        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except ValueError:
            return raw.decode("utf-8", "replace")

    def _get(self, path: str, params: Optional[dict] = None) -> Any:
        return self._request("GET", path, params=params)

    def _post(self, path: str, json_body: Optional[dict] = None) -> Any:
        return self._request("POST", path, json_body=json_body)

    # ─── 通用 ──────────────────────────────────────────

    def health(self) -> Dict[str, Any]:
        """服务健康状态，含 ``ch347Available``。"""
        return self._get("/health")

    def list_devices(self) -> List[Dict[str, Any]]:
        """列出 CH347 设备。"""
        return self._get("/devices")

    # ─── CH347 设备 ────────────────────────────────────

    def ch347_open(self, index: int) -> None:
        self._post("/ch347/open", {"index": index})

    def ch347_close(self, index: int) -> None:
        self._post("/ch347/close", {"index": index})

    # ─── CH347 SPI ─────────────────────────────────────

    def spi_init(self, index: int, *, mode: Optional[int] = None, speed_mhz: Optional[int] = None,
                 cs: Optional[int] = None, data_bits: Optional[int] = None,
                 byte_order: Optional[int] = None) -> None:
        body: Dict[str, Any] = {"index": index}
        if mode is not None:
            body["mode"] = mode
        if speed_mhz is not None:
            body["speedMhz"] = speed_mhz
        if cs is not None:
            body["cs"] = cs
        if data_bits is not None:
            body["dataBits"] = data_bits
        if byte_order is not None:
            body["byteOrder"] = byte_order
        self._post("/ch347/spi/init", body)

    def spi_transfer(self, index: int, tx: bytes, cs: Optional[int] = None) -> bytes:
        """SPI 全双工：发送 ``tx``，返回等长接收数据。"""
        body: Dict[str, Any] = {"index": index, "txData": _to_hex(tx)}
        if cs is not None:
            body["cs"] = cs
        return _from_hex(self._post("/ch347/spi/transfer", body)["data"])

    def spi_write(self, index: int, tx: bytes, cs: Optional[int] = None) -> None:
        """SPI 只写。"""
        body: Dict[str, Any] = {"index": index, "txData": _to_hex(tx)}
        if cs is not None:
            body["cs"] = cs
        self._post("/ch347/spi/write", body)

    def spi_read(self, index: int, read_len: int, cs: Optional[int] = None) -> bytes:
        """SPI 只读 ``read_len`` 字节。"""
        body: Dict[str, Any] = {"index": index, "readLen": read_len}
        if cs is not None:
            body["cs"] = cs
        return _from_hex(self._post("/ch347/spi/read", body)["data"])

    # ─── CH347 I2C ─────────────────────────────────────

    def i2c_transfer(self, index: int, write_data: bytes, read_len: int = 0, *,
                     speed_khz: Optional[int] = None, scl_stretch: Optional[bool] = None,
                     delay_ms: Optional[int] = None) -> bytes:
        """I2C 传输：``write_data`` 首字节应为 ``addr<<1``；``read_len>0`` 时返回读到的数据。"""
        body: Dict[str, Any] = {
            "index": index, "writeData": _to_hex(write_data), "readLen": read_len,
        }
        if speed_khz is not None:
            body["speedKhz"] = speed_khz
        if scl_stretch is not None:
            body["sclStretch"] = scl_stretch
        if delay_ms is not None:
            body["delayMs"] = delay_ms
        return _from_hex(self._post("/ch347/i2c/transfer", body)["data"])

    def i2c_scan(self, index: int, *, speed_khz: Optional[int] = None,
                 scl_stretch: Optional[bool] = None, delay_ms: Optional[int] = None) -> List[int]:
        """扫描 1-127 地址，返回有应答的 7 位地址列表。"""
        body: Dict[str, Any] = {"index": index}
        if speed_khz is not None:
            body["speedKhz"] = speed_khz
        if scl_stretch is not None:
            body["sclStretch"] = scl_stretch
        if delay_ms is not None:
            body["delayMs"] = delay_ms
        return self._post("/ch347/i2c/scan", body)["addresses"]

    # ─── CH347 GPIO ────────────────────────────────────

    def gpio_set(self, index: int, enable: int, dir_out: int, data_out: int) -> None:
        """GPIO 设置：``enable`` / ``dir_out`` / ``data_out`` 为 GPIO0-7 的位掩码。"""
        self._post("/ch347/gpio/set", {
            "index": index, "enable": enable, "dirOut": dir_out, "dataOut": data_out,
        })

    # ─── 串口 ──────────────────────────────────────────

    def serial_ports(self) -> List[Dict[str, Any]]:
        """列出主机串口。"""
        return self._get("/serial/ports")

    def serial_open(self, port: str, baud_rate: int, *, data_bits: int = 8, stop_bits: int = 1,
                    parity: str = "none", flow_control: str = "none") -> None:
        self._post("/serial/open", {
            "port": port, "baudRate": baud_rate, "dataBits": data_bits, "stopBits": stop_bits,
            "parity": parity, "flowControl": flow_control,
        })

    def serial_close(self, port: str) -> None:
        self._post("/serial/close", {"port": port})

    def serial_write(self, port: str, data: bytes) -> None:
        self._post("/serial/write", {"port": port, "data": _to_hex(data)})

    def serial_read(self, port: str, max_bytes: int = 4096) -> bytes:
        """从串口读缓冲 drain 最多 ``max_bytes`` 字节（非阻塞）。"""
        return _from_hex(self._get("/serial/read", {"port": port, "max": max_bytes})["data"])
