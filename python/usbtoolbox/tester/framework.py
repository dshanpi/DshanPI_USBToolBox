"""统一产测框架雏形。

提供命名测试计划 / 工站、注册可混合（串口 / Modbus / I²C / SPI）的测试步骤、
顺序执行 + NG 重测、以及 JSON / CSV 报告输出。

每个步骤是一个无参可调用对象，约定：
    - 返回真值（或 ``(True, detail)``）→ 通过；
    - 返回假值（或 ``(False, detail)``）→ 失败；
    - 抛异常 → 失败，异常信息记入 error。

本轮为雏形：顺序执行 + 重试 + JSON/CSV。HTML 报告、并行、SN 条码枪接入等为后续增量。
"""

from __future__ import annotations

import csv
import io
import json
import time
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Tuple, Union

#: 步骤函数返回值：bool 或 (bool, detail)
StepReturn = Union[bool, Tuple[bool, str]]
StepFn = Callable[[], StepReturn]


@dataclass
class StepResult:
    """单步结果。"""

    name: str
    passed: bool
    detail: str = ""
    elapsed: float = 0.0
    timestamp: float = 0.0
    attempts: int = 1
    error: Optional[str] = None


@dataclass
class TestReport:
    """一次测试计划的整体报告。"""

    sn: str
    plan_name: str
    station: str
    timestamp: float
    results: List[StepResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        """整体判定：全部步骤通过才 PASS。"""
        return all(r.passed for r in self.results) and len(self.results) > 0

    def to_dict(self) -> dict:
        return {
            "sn": self.sn,
            "planName": self.plan_name,
            "station": self.station,
            "timestamp": self.timestamp,
            "overall": "PASS" if self.passed else "FAIL",
            "results": [
                {
                    "name": r.name, "passed": r.passed, "detail": r.detail,
                    "elapsed": round(r.elapsed, 4), "attempts": r.attempts,
                    "error": r.error,
                }
                for r in self.results
            ],
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=indent)

    def to_csv(self) -> str:
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["sn", "plan", "station", "step", "passed", "detail", "elapsed", "attempts", "error"])
        for r in self.results:
            w.writerow([self.sn, self.plan_name, self.station, r.name,
                        "PASS" if r.passed else "FAIL", r.detail, round(r.elapsed, 4),
                        r.attempts, r.error or ""])
        return out.getvalue()

    def to_html(self) -> str:
        """生成可视化 HTML 报告（自包含，无外部资源，可直接浏览器打开）。"""
        import html as _html

        overall = "PASS" if self.passed else "FAIL"
        overall_color = "#3fb950" if self.passed else "#f85149"
        ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.timestamp))
        rows = []
        for i, r in enumerate(self.results, 1):
            status = "PASS" if r.passed else "FAIL"
            color = "#3fb950" if r.passed else "#f85149"
            detail = _html.escape(r.detail or "")
            if r.error:
                detail += f'<div class="err">{_html.escape(r.error)}</div>'
            rows.append(
                f"<tr><td>{i}</td><td>{_html.escape(r.name)}</td>"
                f'<td style="color:{color};font-weight:600">{status}</td>'
                f"<td>{detail}</td><td>{r.elapsed * 1000:.0f} ms</td><td>{r.attempts}</td></tr>"
            )
        rows_html = "\n".join(rows)
        return f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>产测报告 {_html.escape(self.sn)}</title>
<style>
  body {{ font-family: 'Segoe UI','Microsoft YaHei',sans-serif; background:#0d1117; color:#c9d1d9; margin:0; padding:24px; }}
  .card {{ max-width:960px; margin:0 auto; background:#161b22; border:1px solid #30363d; border-radius:10px; padding:20px 24px; }}
  h1 {{ font-size:20px; margin:0 0 4px; }}
  .meta {{ color:#8b949e; font-size:13px; margin-bottom:16px; }}
  .badge {{ display:inline-block; padding:4px 14px; border-radius:6px; font-weight:700; color:#fff; background:{overall_color}; }}
  table {{ width:100%; border-collapse:collapse; margin-top:14px; font-size:13px; }}
  th,td {{ text-align:left; padding:8px 10px; border-bottom:1px solid #30363d; vertical-align:top; }}
  th {{ color:#8b949e; font-weight:600; }}
  .err {{ color:#f85149; font-family:Consolas,monospace; font-size:12px; margin-top:4px; white-space:pre-wrap; }}
</style></head><body>
<div class="card">
  <h1>产测报告 <span class="badge">{overall}</span></h1>
  <div class="meta">
    SN: <b>{_html.escape(self.sn)}</b> &nbsp;|&nbsp; 计划: {_html.escape(self.plan_name)}
    &nbsp;|&nbsp; 工站: {_html.escape(self.station or '-')} &nbsp;|&nbsp; 时间: {ts}
  </div>
  <table>
    <thead><tr><th>#</th><th>步骤</th><th>结果</th><th>详情</th><th>耗时</th><th>尝试</th></tr></thead>
    <tbody>
{rows_html}
    </tbody>
  </table>
</div></body></html>"""

    def save_json(self, path: str) -> None:
        with open(path, "w", encoding="utf-8") as f:
            f.write(self.to_json())

    def save_csv(self, path: str) -> None:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(self.to_csv())

    def save_html(self, path: str) -> None:
        with open(path, "w", encoding="utf-8") as f:
            f.write(self.to_html())


@dataclass
class _Step:
    name: str
    fn: StepFn
    retries: int = 0
    stop_on_fail: bool = False


class TestPlan:
    """测试计划：注册步骤后对某个 SN 顺序执行，返回 :class:`TestReport`。

    :param name:    计划名。
    :param station: 工站名。
    """

    def __init__(self, name: str, station: str = ""):
        self.name = name
        self.station = station
        self._steps: List[_Step] = []

    def add_step(self, name: str, fn: StepFn, *, retries: int = 0,
                 stop_on_fail: bool = False) -> "TestPlan":
        """注册一个测试步骤（可链式调用）。"""
        self._steps.append(_Step(name=name, fn=fn, retries=retries, stop_on_fail=stop_on_fail))
        return self

    @staticmethod
    def _normalize(ret: StepReturn) -> Tuple[bool, str]:
        if isinstance(ret, tuple):
            return bool(ret[0]), str(ret[1]) if len(ret) > 1 else ""
        return bool(ret), ""

    def run(self, sn: str) -> TestReport:
        """对给定 SN 顺序执行所有步骤（含重试），返回报告。"""
        report = TestReport(sn=sn, plan_name=self.name, station=self.station, timestamp=time.time())
        for step in self._steps:
            attempt = 0
            result = StepResult(name=step.name, passed=False, timestamp=time.time())
            while attempt <= step.retries:
                attempt += 1
                start = time.time()
                try:
                    passed, detail = self._normalize(step.fn())
                    result = StepResult(name=step.name, passed=passed, detail=detail,
                                        elapsed=time.time() - start, timestamp=start, attempts=attempt)
                except Exception as e:  # noqa: BLE001 — 步骤任何异常都记为失败
                    result = StepResult(name=step.name, passed=False, elapsed=time.time() - start,
                                        timestamp=start, attempts=attempt, error=str(e))
                if result.passed:
                    break
            report.results.append(result)
            if not result.passed and step.stop_on_fail:
                break
        return report
