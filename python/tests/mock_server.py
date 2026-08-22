"""测试用：内存版 USBToolBox HTTP 服务 Mock。

用标准库 ``http.server`` 在后台线程跑一个最小服务，实现与真实 Rust 服务相同的端点契约
（hex 字节、{"error":...} 错误体），让 ``UsbToolBoxClient`` 的单测无需真实硬件 / 应用即可跑通。

仅用于测试。
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs


class _Handler(BaseHTTPRequestHandler):
    # 关闭访问日志，避免污染测试输出
    def log_message(self, *args):  # noqa: D401
        pass

    def _send(self, code: int, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        return json.loads(raw) if raw else {}

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/health":
            return self._send(200, {"status": "ok", "ch347Available": True})
        if path == "/devices":
            return self._send(200, [{"index": 0, "name": "CH347T: MOCK", "chipName": "CH347T"}])
        if path == "/serial/ports":
            return self._send(200, [{"name": "COM-MOCK", "vid": 0x1234, "pid": 0x5678,
                                     "manufacturer": "mock", "description": "mock", "serialNumber": ""}])
        if path == "/serial/read":
            q = parse_qs(parsed.query)
            port = q.get("port", [""])[0]
            data = self.server.serial_buffers.get(port, b"")  # type: ignore[attr-defined]
            self.server.serial_buffers[port] = b""            # type: ignore[attr-defined]
            return self._send(200, {"data": data.hex()})
        return self._send(404, {"error": f"no route {path}"})

    def do_POST(self):
        path = urlparse(self.path).path
        body = self._read_json()
        srv = self.server  # type: ignore[assignment]

        if path == "/ch347/open" or path == "/ch347/close":
            return self._send(200, {"ok": True})
        if path == "/ch347/spi/init":
            return self._send(200, {"ok": True})
        if path == "/ch347/spi/transfer":
            # 回显 txData（mock MISO = MOSI）
            return self._send(200, {"data": body.get("txData", "")})
        if path == "/ch347/spi/write":
            return self._send(200, {"ok": True})
        if path == "/ch347/spi/read":
            n = int(body.get("readLen", 0))
            return self._send(200, {"data": ("a5" * n)})
        if path == "/ch347/i2c/transfer":
            n = int(body.get("readLen", 0))
            # 记录每次事务的 writeData（hex，含读操作的寄存器地址部分），供测试断言分块行为
            if "writeData" in body:
                srv.i2c_writes.append(body.get("writeData", ""))  # type: ignore[attr-defined]
            return self._send(200, {"data": ("5a" * n)})
        if path == "/ch347/i2c/scan":
            return self._send(200, {"addresses": [0x50, 0x68]})
        if path == "/ch347/gpio/set":
            return self._send(200, {"ok": True})
        if path == "/serial/open" or path == "/serial/close":
            return self._send(200, {"ok": True})
        if path == "/serial/write":
            # 回显到该端口读缓冲，便于 send_expect 测试
            port = body.get("port", "")
            data = bytes.fromhex(body.get("data", ""))
            srv.serial_buffers[port] = srv.serial_buffers.get(port, b"") + data  # type: ignore[attr-defined]
            return self._send(200, {"ok": True})
        return self._send(404, {"error": f"no route {path}"})


class MockServer:
    """上下文管理器形式的 Mock 服务。

    用法::

        with MockServer() as base_url:
            client = UsbToolBoxClient(base_url)
            ...
    """

    def __init__(self, host: str = "127.0.0.1", port: int = 0):
        self._httpd = ThreadingHTTPServer((host, port), _Handler)
        self._httpd.serial_buffers = {}  # type: ignore[attr-defined]
        self._httpd.i2c_writes = []       # type: ignore[attr-defined]
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)

    @property
    def base_url(self) -> str:
        host, port = self._httpd.server_address[:2]
        return f"http://{host}:{port}"

    @property
    def i2c_writes(self) -> list:
        """记录的 I2C 写事务 writeData（hex 串列表）。"""
        return self._httpd.i2c_writes  # type: ignore[attr-defined]

    def __enter__(self) -> str:
        self._thread.start()
        return self.base_url

    def __exit__(self, *exc) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()
