"""示例产测脚本：SPI Flash（如 W25Q 系列）读取 JEDEC ID 并校验。

演示如何用 usbtoolbox.tester 组合 SpiTester + TestPlan 编写一个最小产测流程。
运行前需：
  1. 在 USBToolBox 的「Python 产测工具」页启动 HTTP 服务（默认端口 8765）；
  2. CH347 已连接、SPI Flash 接好（CS=CS0）。

用法::

    python spi_flash_check.py [BASE_URL] [SN]
"""

import sys

from usbtoolbox.tester import UsbToolBoxClient, SpiTester, TestPlan


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
    sn = sys.argv[2] if len(sys.argv) > 2 else "DEMO-0001"

    client = UsbToolBoxClient(base_url)

    # 0) 服务可达性
    health = client.health()
    print("health:", health)
    if not health.get("ch347Available"):
        print("警告：CH347 DLL 不可用，后续步骤将失败（无硬件时仅演示流程）")

    spi = SpiTester(client, index=0)

    plan = TestPlan("SPI Flash 检测", station="ST-SPI-01")

    def step_open():
        spi.open()
        spi.init(mode=0, speed_mhz=8, cs=0, data_bits=8, byte_order=1)
        return True, "device opened & SPI inited"

    def step_jedec_id():
        # 0x9F = Read JEDEC ID：发 1 字节命令 + 读 3 字节（厂商/型号/容量）
        rx = spi.transfer(bytes([0x9F, 0x00, 0x00, 0x00]))
        jedec = rx[1:4]
        # 合法 ID 不应全 0 或全 FF
        ok = jedec not in (b"\x00\x00\x00", b"\xff\xff\xff")
        return ok, f"JEDEC ID = {jedec.hex()}"

    def step_close():
        spi.close()
        return True, "device closed"

    plan.add_step("打开设备", step_open, stop_on_fail=True)
    plan.add_step("读取 JEDEC ID", step_jedec_id, retries=1)
    plan.add_step("关闭设备", step_close)

    report = plan.run(sn)
    print(report.to_json())
    report.save_json(f"report_{sn}.json")
    report.save_csv(f"report_{sn}.csv")
    print("整体判定:", "PASS" if report.passed else "FAIL")
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
