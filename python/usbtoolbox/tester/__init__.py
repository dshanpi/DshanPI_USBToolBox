"""USBToolBox 产测工具包。

把 USBToolBox 桌面应用内嵌的本地 HTTP REST 服务封装成 Python API，供产测脚本调用。
所有总线访问都经主进程，与桌面工具共享同一 CH347 / 串口设备单例。

**零依赖**：仅用 Python 标准库，配合软件内置的可嵌入 Python 运行时即可直接在软件内运行，
无需 ``pip install`` 任何包。

典型用法::

    from usbtoolbox.tester import UsbToolBoxClient, SpiTester, TestPlan

    client = UsbToolBoxClient("http://127.0.0.1:8765")
    print(client.health())
"""

from .client import UsbToolBoxClient, UsbToolBoxError
from .serial_tester import SerialTester, MatchMode, SerialStep, SerialStepResult, strip_ansi
from .i2c_tester import I2CTester
from .spi_tester import SpiTester
from .modbus_tester import ModbusTester, ModbusError, crc16, build_rtu_frame, build_tcp_frame
from .framework import TestPlan, StepResult, TestReport
from .config import TesterConfig, load_config_file, load_config_text, parse_yaml
from .barcode import BarcodeScanner, read_sn
from .parallel import ParallelRunner, ParallelResult, all_ok
from .oled import SSD1306Spi, render_text, preview_ascii, FONT8X8

__all__ = [
    # client
    "UsbToolBoxClient",
    "UsbToolBoxError",
    # serial
    "SerialTester",
    "MatchMode",
    "SerialStep",
    "SerialStepResult",
    "strip_ansi",
    # i2c / spi
    "I2CTester",
    "SpiTester",
    # oled
    "SSD1306Spi",
    "render_text",
    "preview_ascii",
    "FONT8X8",
    # modbus
    "ModbusTester",
    "ModbusError",
    "crc16",
    "build_rtu_frame",
    "build_tcp_frame",
    # framework
    "TestPlan",
    "StepResult",
    "TestReport",
    # config
    "TesterConfig",
    "load_config_file",
    "load_config_text",
    "parse_yaml",
    # barcode
    "BarcodeScanner",
    "read_sn",
    # parallel
    "ParallelRunner",
    "ParallelResult",
    "all_ok",
]
