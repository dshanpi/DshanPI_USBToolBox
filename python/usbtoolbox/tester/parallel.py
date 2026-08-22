"""多工具并行测试（线程池，纯标准库）。

产测常需同时验证多个外设（如同时跑串口模组与 I²C 传感器）。由于每个测试主要在等待
硬件响应（I/O 密集），用线程并发即可显著缩短节拍。

注意：底层 HTTP 服务与设备状态是共享的——并行的各任务应操作**不同的**设备 / 端口，
避免对同一物理设备并发下发命令。
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional


@dataclass
class ParallelResult:
    """单个并行任务的结果。"""

    name: str
    ok: bool
    value: Any = None
    error: Optional[str] = None
    elapsed: float = 0.0


class ParallelRunner:
    """并行执行一组命名任务。

    :param max_workers: 最大并发线程数，默认 4（对应多路 CH347 量产场景）。
    """

    def __init__(self, max_workers: int = 4):
        self.max_workers = max_workers
        self._tasks: List[tuple] = []  # (name, fn)

    def add(self, name: str, fn: Callable[[], Any]) -> "ParallelRunner":
        """注册一个无参任务（可链式调用）。"""
        self._tasks.append((name, fn))
        return self

    def run(self) -> Dict[str, ParallelResult]:
        """并发执行全部任务，返回 ``name -> ParallelResult``。

        任何任务抛异常都会被捕获记入对应结果的 ``error``，不影响其它任务。
        """
        results: Dict[str, ParallelResult] = {}

        def _wrap(name: str, fn: Callable[[], Any]) -> ParallelResult:
            start = time.time()
            try:
                value = fn()
                return ParallelResult(name=name, ok=True, value=value, elapsed=time.time() - start)
            except Exception as e:  # noqa: BLE001 — 隔离单任务失败
                return ParallelResult(name=name, ok=False, error=str(e), elapsed=time.time() - start)

        if not self._tasks:
            return results

        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futures = {pool.submit(_wrap, name, fn): name for name, fn in self._tasks}
            for fut in as_completed(futures):
                res = fut.result()
                results[res.name] = res
        return results


def all_ok(results: Dict[str, ParallelResult]) -> bool:
    """便捷判断：:meth:`ParallelRunner.run` 的结果是否全部通过。"""
    return len(results) > 0 and all(r.ok for r in results.values())
