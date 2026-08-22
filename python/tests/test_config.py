"""配置加载（YAML 子集 + JSON）与 SerialTester 匹配模式的单元测试。"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usbtoolbox.tester import (  # noqa: E402
    load_config_text, parse_yaml, TesterConfig, MatchMode, strip_ansi,
)
from usbtoolbox.tester.serial_tester import _hex_wildcard_to_regex  # noqa: E402


YAML_SAMPLE = """
# 产测配置示例
baseUrl: http://127.0.0.1:9000
baudRate: 9600
spiMode: 0
station: ST-01
limits:
  vmin: 3.2
  vmax: 3.4
ports:
  - COM3
  - COM4
enabled: true
note: "value: with colon"
"""


class TestYaml(unittest.TestCase):
    def test_scalars_and_nesting(self):
        d = parse_yaml(YAML_SAMPLE)
        self.assertEqual(d["baseUrl"], "http://127.0.0.1:9000")
        self.assertEqual(d["baudRate"], 9600)
        self.assertEqual(d["station"], "ST-01")
        self.assertTrue(d["enabled"])
        self.assertEqual(d["limits"]["vmin"], 3.2)
        self.assertEqual(d["limits"]["vmax"], 3.4)
        self.assertEqual(d["ports"], ["COM3", "COM4"])
        self.assertEqual(d["note"], "value: with colon")

    def test_json_fallback(self):
        d = load_config_text('{"baudRate": 115200, "port": "COM9"}')
        self.assertEqual(d["baudRate"], 115200)

    def test_tester_config_from_dict(self):
        cfg = TesterConfig.from_dict(parse_yaml(YAML_SAMPLE))
        self.assertEqual(cfg.base_url, "http://127.0.0.1:9000")
        self.assertEqual(cfg.baud_rate, 9600)
        # 未识别项进入 extra
        self.assertEqual(cfg.extra.get("station"), "ST-01")
        self.assertIn("limits", cfg.extra)


class TestSerialMatch(unittest.TestCase):
    def test_hex_wildcard(self):
        pat = _hex_wildcard_to_regex("A5 ?? 5A")
        self.assertIsNotNone(pat.search(bytes([0xA5, 0x10, 0x5A])))
        self.assertIsNone(pat.search(bytes([0xA5, 0x10, 0x5B])))

    def test_strip_ansi(self):
        raw = b"\x1b[31mERROR\x1b[0m done"
        self.assertEqual(strip_ansi(raw), b"ERROR done")

    def test_match_mode_enum(self):
        self.assertEqual(MatchMode.REGEX.value, "regex")


if __name__ == "__main__":
    unittest.main()
