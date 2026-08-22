"""示例：串口模组 AT 命令测试（握手 → 查版本 → 批量序列 → 报告）。

演示 SerialTester 的完整能力：列端口、打开、发送并等待期望响应（精确/正则/hex 通配三种匹配）、
批量步骤序列（含超时/重试/间隔/标签）、ANSI 自动剥离、结构化报告。

典型场景：测一个带 AT 指令的模组（WiFi/蓝牙/4G 模组等），验证握手与版本号是否正常。

接线：USB 转串口模组接好（COM 口名在运行台输出里可见，或手动指定 PORT）。
运行前：在「Python 产测工具」页点「开启接口」开启设备接口（默认 8765）。

用法::

    python serial_at_module_test.py [BASE_URL] [PORT] [BAUD]
"""

import sys

from usbtoolbox.tester import UsbToolBoxClient, SerialTester, SerialStep

# ── 默认参数（可经命令行覆盖）──
DEFAULT_PORT = ""          # 空 = 自动选第一个串口
DEFAULT_BAUD = 115200


def pick_port(client: UsbToolBoxClient, preferred: str) -> str:
    """选择串口：指定了就用指定的；否则自动取第一个可用端口。找不到则抛错。"""
    if preferred:
        return preferred
    ports = client.serial_ports()
    if not ports:
        raise RuntimeError("未发现任何串口，请接好 USB 转串口模组后重试")
    name = ports[0]["name"]
    print(f"未指定端口，自动选择：{name}（共 {len(ports)} 个可用）")
    return name


def decode_some(b: bytes, limit: int = 40) -> str:
    """把收到的字节可读化：优先当 UTF-8 文本，失败则用 hex。"""
    txt = b.decode("utf-8", "ignore").strip()
    if txt:
        return txt[:limit]
    return b[:limit].hex(" ")


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
    port = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PORT
    baud = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_BAUD

    client = UsbToolBoxClient(base_url)
    try:
        ok = client.health().get("ch347Available")
        print("health: ch347Available =", ok)
    except Exception as e:
        print("（设备接口未开启或不可达）", e)
        return 1

    port = pick_port(client, port)
    print(f"使用串口 {port} @ {baud} baud")

    ser = SerialTester(client, port).open(baud)
    passed_all = True
    with ser:
        # 1) 握手：发 AT，期望 OK（普通文本自动精确匹配，1s 超时）
        r = ser.send_expect("AT\r\n", "OK", timeout=1.0)
        print(f"[握手] AT -> {'PASS' if r.passed else 'FAIL'} | 收到: {decode_some(r.received)!r}")
        if not r.passed:
            print("握手失败：模组无响应或波特率不对，终止测试。", file=sys.stderr)
            return 1

        # 2) 查版本：AT+GMR，期望返回版本号（/.../ 自动按正则匹配，1.5s 超时）
        r = ser.send_expect("AT+GMR\r\n", r"/\d+\.\d+/", timeout=1.5)
        print(f"[版本] AT+GMR -> {'PASS' if r.passed else 'FAIL'} | 收到: {decode_some(r.received)!r}")

        # 3) 批量步骤序列：每步含标签/超时/重试/间隔，一次执行拿全部结果
        #    匹配模式自动推断：/正则/ → 正则；含 ?? 或纯 hex → hex 通配；其余 → 精确包含
        steps = [
            SerialStep("查询信号", "AT+CSQ\r\n", r"/:\s*\d+,/", timeout=1.0, retries=1),
            SerialStep("回显关", "ATE0\r\n", "OK", timeout=1.0),
            # 私有帧：send 用 list 发原始字节（str 会当文本编码）；expect 含 ?? 自动 hex 通配
            SerialStep("自定义帧", [0xA5, 0x01, 0x5A], "A5 ?? 5A", timeout=1.0),
        ]
        print("\n[批量序列] 执行 {} 步...".format(len(steps)))
        results = ser.run_sequence(steps)
        for res in results:
            status = "PASS" if res.passed else "FAIL"
            if not res.passed:
                passed_all = False
            print(f"  {res.label}: {status}（尝试 {res.attempts} 次）| {decode_some(res.received)!r}")

    # with 退出已自动关闭串口

    # 4) 输出测试报告（JSON）
    report = {
        "sn": "SN-SERIAL-0001",
        "planName": "串口模组测试",
        "station": "ST-SERIAL",
        "overall": "PASS" if passed_all else "FAIL",
        "steps": [
            {"label": res.label, "passed": res.passed, "attempts": res.attempts,
             "received": decode_some(res.received)}
            for res in results
        ],
    }
    import json
    print("\n=== 测试报告 ===")
    print(json.dumps(report, ensure_ascii=False, indent=2))

    print("\n=== 测试结束 ===")
    return 0 if passed_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
