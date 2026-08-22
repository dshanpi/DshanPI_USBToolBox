"""TestPlan / TestReport / ParallelRunner 的单元测试（纯逻辑，无需硬件）。"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usbtoolbox.tester import TestPlan, ParallelRunner, all_ok  # noqa: E402


class TestFramework(unittest.TestCase):
    def test_pass_and_fail_and_retry(self):
        state = {"n": 0}

        def flaky():
            state["n"] += 1
            return state["n"] >= 2  # 第一次失败，第二次通过

        plan = TestPlan("demo", station="ST")
        plan.add_step("always-ok", lambda: (True, "ok detail"))
        plan.add_step("flaky", flaky, retries=1)
        report = plan.run("SN-1")

        self.assertTrue(report.passed)
        self.assertEqual(report.results[0].detail, "ok detail")
        self.assertEqual(report.results[1].attempts, 2)

    def test_exception_is_failure(self):
        def boom():
            raise RuntimeError("hardware gone")

        plan = TestPlan("demo")
        plan.add_step("boom", boom)
        report = plan.run("SN-2")
        self.assertFalse(report.passed)
        self.assertEqual(report.results[0].error, "hardware gone")

    def test_stop_on_fail(self):
        plan = TestPlan("demo")
        plan.add_step("fail", lambda: False, stop_on_fail=True)
        plan.add_step("never", lambda: True)
        report = plan.run("SN-3")
        self.assertEqual(len(report.results), 1)  # 第二步未执行

    def test_report_formats(self):
        plan = TestPlan("demo", station="ST-9")
        plan.add_step("a", lambda: True)
        report = plan.run("SN-4")
        self.assertIn('"overall": "PASS"', report.to_json())
        self.assertIn("SN-4", report.to_csv())
        html = report.to_html()
        self.assertIn("<table", html)
        self.assertIn("SN-4", html)


class TestParallel(unittest.TestCase):
    def test_runs_all_and_isolates_errors(self):
        runner = ParallelRunner(max_workers=4)
        runner.add("ok", lambda: 42)
        runner.add("bad", lambda: (_ for _ in ()).throw(ValueError("x")))
        results = runner.run()
        self.assertEqual(results["ok"].value, 42)
        self.assertTrue(results["ok"].ok)
        self.assertFalse(results["bad"].ok)
        self.assertFalse(all_ok(results))


if __name__ == "__main__":
    unittest.main()
