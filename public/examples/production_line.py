"""示例：综合产测流程（配置 + SN 条码 + 多工具并行 + HTML 报告）。

演示新特性的组合用法。运行前在「Python 产测工具」页启动 HTTP 服务。

用法::

    # 交互式（扫码枪/键盘输入 SN）
    python production_line.py config.yaml
    # 或用环境变量提供 SN（自动化）
    USBTOOLBOX_SN=SN20240001 python production_line.py config.yaml
"""

import sys

from usbtoolbox.tester import (
    TesterConfig, read_sn, TestPlan, ParallelRunner, all_ok,
    SerialTester, I2CTester,
)


def main() -> int:
    # 1) 读配置（YAML / JSON，零依赖）
    cfg_path = sys.argv[1] if len(sys.argv) > 1 else None
    cfg = TesterConfig.from_file(cfg_path) if cfg_path else TesterConfig()
    client = cfg.make_client()
    print("health:", client.health())

    # 2) 扫码/输入 SN（支持 USB 条码枪键盘楔入；或 USBTOOLBOX_SN 环境变量）
    sn = read_sn("请扫码/输入 SN：", retries=2)
    print("SN =", sn)

    # 3) 多工具并行预检（不同设备/端口，避免并发同一设备）
    runner = ParallelRunner(max_workers=2)
    if cfg.serial_port:
        runner.add("串口在线", lambda: bool(SerialTester(client, cfg.serial_port).open(cfg.baud_rate)) or True)
    runner.add("I2C 扫描", lambda: I2CTester(client, cfg.ch347_index, speed_khz=cfg.i2c_speed_khz).open().scan())
    pre = runner.run()
    for name, r in pre.items():
        print(f"  [并行] {name}: {'OK' if r.ok else 'FAIL'} {r.value if r.ok else r.error}")

    # 4) 正式测试计划
    plan = TestPlan("综合产测", station=cfg.extra.get("station", "ST"))
    plan.add_step("服务可达", lambda: (client.health().get("status") == "ok", "health ok"))
    plan.add_step("并行预检通过", lambda: (all_ok(pre), "parallel precheck"))

    report = plan.run(sn)
    print(report.to_json())

    # 5) 三种报告
    report.save_json(f"report_{sn}.json")
    report.save_csv(f"report_{sn}.csv")
    report.save_html(f"report_{sn}.html")
    print("整体:", "PASS" if report.passed else "FAIL")
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
