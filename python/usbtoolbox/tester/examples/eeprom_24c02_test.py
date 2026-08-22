"""示例：24C02 EEPROM 读写测试（读 → 写 → 读 验证）。

24C02 是常见 I²C EEPROM：地址 0x50，2Kbit = 256 字节，**页大小 8 字节**。
本脚本演示完整产测流程：扫描 → 读取初始数据 → 写入测试数据 → 回读验证。

常见报错排查（``I2C transfer failed`` 来自 CH347 DLL，是硬件层返回失败，非脚本 bug）：
  - **速率不匹配**：脚本默认 100kHz。若失败，改 SPEED_KHZ=400 或 50 重试。
  - **一次读/写太多字节时序不稳**：脚本已用分块读（READ_CHUNK）+ 分页写（PAGE_SIZE）。
  - **上拉/接线**：SDA/SCL 加 4.7k 上拉、缩短连线。
  - **写周期未结束**：写后必须等 tWR（脚本已带 write_delay_ms=5）。

关键点：写时必须带 ``page_size=8``，否则一次写超过 8 字节会因页回绕覆盖（24Cxx 固有特性）。

接线：CH347 I2C → 24C02；SCL/SDA 接好，地址 0x50。
运行前：在「Python 产测工具」页点「开启接口」开启设备接口（默认 8765），接好 CH347。

用法::

    python eeprom_24c02_test.py [BASE_URL] [SPEED_KHZ]
"""

import sys

from usbtoolbox.tester import UsbToolBoxClient, I2CTester, UsbToolBoxError

# ── 24C02 参数（可按硬件调整）──
EEPROM_ADDR = 0x50     # 7 位从机地址（24Cxx A0-A2 全接地时为 0x50）
PAGE_SIZE = 8          # 24C02 页大小：8 字节
TEST_ADDR = 0x00       # 测试起始地址
TEST_LEN = 16          # 测试 16 字节（跨 2 个页，验证分页写）
READ_CHUNK = 8         # 分块读：一次读 8 字节，避免高速率下读 16 字节 NACK

# 速率：可经命令行第 2 个参数覆盖。100kHz 失败时改 400 或 50。
DEFAULT_SPEED_KHZ = 100


def read_reg_safe(i2c, addr, reg, length, *, label=""):
    """带诊断的读：失败时给出可操作提示，不直接抛。返回 (ok, data_or_none, msg)。"""
    try:
        data = i2c.read_reg(addr, reg, length, chunk=READ_CHUNK)
        return True, data, None
    except UsbToolBoxError as e:
        return False, None, f"{label}读失败：{e}（可改 SPEED_KHZ=400 或 50 重试，或检查上拉/接线）"


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
    speed_khz = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_SPEED_KHZ

    client = UsbToolBoxClient(base_url)
    try:
        ok = client.health().get("ch347Available")
        print("health: ch347Available =", ok)
    except Exception as e:
        print("（设备接口未开启或不可达）", e)
        return 1
    if not ok:
        print("CH347 不可用，请接好硬件并开启接口后重试。")
        return 1

    print(f"使用 I2C 速率 {speed_khz} kHz（读分块 {READ_CHUNK} 字节 / 写分页 {PAGE_SIZE} 字节）")
    with I2CTester(client, index=0, speed_khz=speed_khz) as i2c:
        # 1) 扫描确认 24C02 在线
        found = i2c.scan()
        print(f"扫描到设备: {[hex(a) for a in found]}")
        if EEPROM_ADDR not in found:
            print(f"错误：未发现 24C02（0x{EEPROM_ADDR:02x}）", file=sys.stderr)
            return 1

        # 2) 先读 1 字节做"探针"，验证读路径通（最小开销定位速率/接线问题）
        ok1, probe, msg1 = read_reg_safe(i2c, EEPROM_ADDR, TEST_ADDR, 1, label="[探针] ")
        if not ok1:
            print(msg1, file=sys.stderr)
            print("提示：扫描能过但读失败，通常是速率/上拉/接线问题，"
                  "请改 SPEED_KHZ 重试（如 400 或 50）。", file=sys.stderr)
            return 1
        print(f"[探针] 读 1 字节 @0x{TEST_ADDR:02x} = {probe.hex()} （读路径正常）")

        # 3) 读取初始数据（写前快照，确认读路径 + 看清测试前内容）
        ok2, original, msg2 = read_reg_safe(i2c, EEPROM_ADDR, TEST_ADDR, TEST_LEN, label="[写前] ")
        if not ok2:
            print(msg2, file=sys.stderr)
            return 1
        print(f"[写前] 读 {TEST_LEN} 字节 @0x{TEST_ADDR:02x}: {original.hex(' ')}")

        # 4) 写入测试数据：16 字节，跨 2 个页（验证分页写不回绕）
        test_data = bytes(range(0xA0, 0xA0 + TEST_LEN))  # 0xA0 0xA1 ... 0xAF
        print(f"[写入] 写 {TEST_LEN} 字节 @0x{TEST_ADDR:02x}: {test_data.hex(' ')}（页大小 {PAGE_SIZE}）")
        try:
            i2c.write_reg(EEPROM_ADDR, TEST_ADDR, test_data,
                          page_size=PAGE_SIZE, write_delay_ms=5, verify=True)
            print("[写入] 完成 + 回读校验通过 [PASS]")
        except UsbToolBoxError as e:
            print(f"[写入] 写入已发出，但回读校验未通过：{e}", file=sys.stderr)

        # 5) 再读一次，确认数据落盘正确
        ok3, readback, msg3 = read_reg_safe(i2c, EEPROM_ADDR, TEST_ADDR, TEST_LEN, label="[写后] ")
        if not ok3:
            print(msg3, file=sys.stderr)
            return 1
        print(f"[写后] 读 {TEST_LEN} 字节 @0x{TEST_ADDR:02x}: {readback.hex(' ')}")
        if readback == test_data:
            print("[PASS] 读写测试通过：写入数据 == 读回数据")
        else:
            print(f"[FAIL] 读写测试失败：期望 {test_data.hex(' ')}，实际 {readback.hex(' ')}", file=sys.stderr)

    print("\n=== 测试结束 ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


