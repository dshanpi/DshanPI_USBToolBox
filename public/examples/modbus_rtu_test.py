"""示例：Modbus RTU 从机测试（读保持寄存器 → 写校验 → 线圈 → 异常处理 → 报告）。

演示 ModbusTester 的完整能力：RTU 帧组装/CRC、功能码 01/03/05/06/15/16、
异常码解析与捕获、写后回读验证、批量寄存器读写断言。

典型场景：测一个 Modbus RTU 从机设备（PLC/仪表/变频器等，unit=1，9600 8N1），
验证保持寄存器与线圈读写是否正常。

接线：USB 转串口 → RS485 转换器 → 从机设备（A/B 接好）。
运行前：在「Python 产测工具」页点「开启接口」开启设备接口（默认 8765）。

用法::

    python modbus_rtu_test.py [BASE_URL] [PORT] [UNIT] [BAUD]
"""

import sys

from usbtoolbox.tester import UsbToolBoxClient, ModbusTester, ModbusError

# ── 默认参数（可经命令行覆盖）──
DEFAULT_PORT = ""
DEFAULT_UNIT = 1           # Modbus 从机地址
DEFAULT_BAUD = 9600        # Modbus RTU 常见波特率

# 测试寄存器/线圈地址规划（按你的设备改）
HOLD_REG = 0x0000          # 保持寄存器起始地址
HOLD_REG_COUNT = 4         # 一次读 4 个保持寄存器
WRITE_REG = 0x0010         # 可写保持寄存器地址（测试用，会被复原）
COIL = 0x0000              # 线圈起始地址
COIL_COUNT = 8             # 一次读 8 个线圈


def pick_port(client: UsbToolBoxClient, preferred: str) -> str:
    if preferred:
        return preferred
    ports = client.serial_ports()
    if not ports:
        raise RuntimeError("未发现任何串口，请接好 USB-RS485 后重试")
    name = ports[0]["name"]
    print(f"未指定端口，自动选择：{name}（共 {len(ports)} 个可用）")
    return name


def step(name, fn, results):
    """执行一步，捕获 Modbus 异常，记录结果。返回是否通过。"""
    try:
        fn()
        print(f"  [PASS] {name}")
        results.append({"label": name, "passed": True, "error": None})
        return True
    except ModbusError as e:
        print(f"  [FAIL] {name}：{e}")
        results.append({"label": name, "passed": False, "error": str(e)})
        return False
    except Exception as e:
        print(f"  [FAIL] {name}：{e}")
        results.append({"label": name, "passed": False, "error": str(e)})
        return False


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
    port = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PORT
    unit = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_UNIT
    baud = int(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_BAUD

    client = UsbToolBoxClient(base_url)
    try:
        ok = client.health().get("ch347Available")
        print("health: ch347Available =", ok)
    except Exception as e:
        print("（设备接口未开启或不可达）", e)
        return 1

    port = pick_port(client, port)
    print(f"Modbus RTU：串口 {port} @ {baud} baud，从机 unit={unit}")

    results = []
    mb = ModbusTester(client, port, unit=unit, response_timeout=1.0).open(baud)
    restored_hold = None
    restored_coil = None
    with mb:
        # 1) 读保持寄存器（功能码 03）—— 先快照，用于复原
        def read_hold():
            nonlocal restored_hold
            regs = mb.read_holding_registers(HOLD_REG, HOLD_REG_COUNT)
            restored_hold = regs
            print(f"    读保持寄存器 @0x{HOLD_REG:04x} ×{HOLD_REG_COUNT} = {[hex(r) for r in regs]}")
        step("读保持寄存器(03)", read_hold, results)

        # 2) 写单寄存器 + 回读验证（功能码 06，verify=True 自动回读比对）
        test_val = 0x1234
        def write_single():
            mb.write_register(WRITE_REG, test_val, verify=True)
            print(f"    写单寄存器 @0x{WRITE_REG:04x} = 0x{test_val:04x}（已回读校验）")
        step("写单寄存器(06)+校验", write_single, results)

        # 3) 写多寄存器 + 回读验证（功能码 16）
        test_vals = [10, 20, 30]
        def write_multi():
            mb.write_registers(WRITE_REG, test_vals, verify=True)
            print(f"    写多寄存器 @0x{WRITE_REG:04x} = {test_vals}（已回读校验）")
        step("写多寄存器(16)+校验", write_multi, results)

        # 4) 读线圈（功能码 01）—— 先快照复原
        def read_coils():
            nonlocal restored_coil
            coils = mb.read_coils(COIL, COIL_COUNT)
            restored_coil = coils
            print(f"    读线圈 @0x{COIL:04x} ×{COIL_COUNT} = {coils}")
        step("读线圈(01)", read_coils, results)

        # 5) 写单线圈 + 回读验证（功能码 05）
        def write_coil():
            mb.write_coil(COIL, True, verify=True)
            print(f"    写单线圈 @0x{COIL:04x} = True（已回读校验）")
        step("写单线圈(05)+校验", write_coil, results)

        # 6) 写多线圈（功能码 15）—— 恢复原始状态
        if restored_coil is not None:
            def restore_coils():
                mb.write_coils(COIL, restored_coil)
                print(f"    复原线圈 @0x{COIL:04x} = {restored_coil}")
            step("复原线圈(15)", restore_coils, results)

        # 7) 复原保持寄存器
        if restored_hold is not None:
            def restore_hold():
                mb.write_registers(WRITE_REG, restored_hold[:len(test_vals)], verify=False)
                print(f"    复原保持寄存器 @0x{WRITE_REG:04x}")
            step("复原保持寄存器(16)", restore_hold, results)

        # 8) 异常处理演示：读一个大概率非法的地址，验证异常码能被正确捕获
        def expect_exception():
            try:
                # 0xFFFF 通常是非法地址，应返回 Modbus 异常
                mb.read_holding_registers(0xFFFF, 1)
                # 若没抛异常，说明设备接受了非法地址（视设备而定，记为警告）
                print("    读非法地址 0xFFFF 未报异常（设备可能未做地址校验）")
            except ModbusError as e:
                print(f"    读非法地址 0xFFFF 正确抛出异常：{e}")
        step("异常码捕获演示", expect_exception, results)

    # with 退出已自动关闭串口

    # 9) 测试报告
    passed_all = all(r["passed"] for r in results)
    report = {
        "sn": "SN-MODBUS-0001",
        "planName": "Modbus RTU 从机测试",
        "station": "ST-MODBUS",
        "unit": unit,
        "overall": "PASS" if passed_all else "FAIL",
        "steps": results,
    }
    import json
    print("\n=== 测试报告 ===")
    print(json.dumps(report, ensure_ascii=False, indent=2))

    print("\n=== 测试结束 ===")
    return 0 if passed_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
