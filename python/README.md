# USBToolBox Python 产测工具

把 USBToolBox 桌面应用内嵌的本地 HTTP REST 服务封装成 Python API，供产测工程师编写
自动化测试脚本。所有总线访问都经主进程，与桌面工具**共享同一 CH347 / 串口设备单例**
（不绕过主进程直接操作硬件）。

> **零依赖**：仅用 Python 标准库，**无需 `pip install` 任何包**。
> 完整 API 参考见 [`docs/PYTHON_API.md`](../docs/PYTHON_API.md)。

## 在软件内直接运行（推荐，用户零安装）

1. 打开 USBToolBox →「**Python 产测工具**」页 →「**启动**」HTTP 服务（默认端口 8765）。
2. 在右侧编辑器写/打开脚本 →「**运行**」，输出实时显示在下方控制台。

软件内置可嵌入 Python 运行时，终端用户无需安装 Python。开发/打包机器首次需运行一次
`scripts/fetch-python-runtime.ps1` 填充内置运行时（详见 `src-tauri/resources/pyembed/README.md`）；
未内置时会自动回退系统 Python。

## 独立运行（开发 / CI）

把本 `python/` 目录加入 `PYTHONPATH`，用任意 Python ≥ 3.8 运行：

```bash
cd python
python -c "from usbtoolbox.tester import UsbToolBoxClient; print(UsbToolBoxClient().health())"
python -m unittest discover -s tests -v        # 跑单元测试（Mock，无需硬件）
```

## 快速开始

```python
from usbtoolbox.tester import UsbToolBoxClient

c = UsbToolBoxClient("http://127.0.0.1:8765")
print(c.health())          # {'status': 'ok', 'ch347Available': True}
print(c.list_devices())    # CH347 设备列表
```

## 各工具用法

### 串口

```python
from usbtoolbox.tester import UsbToolBoxClient, SerialTester, SerialStep, MatchMode

c = UsbToolBoxClient()
ser = SerialTester(c, "COM3").open(115200)
r = ser.send_expect("AT\r\n", "OK", timeout=1.0)
print(r.passed, r.received)

# 批量序列
steps = [
    SerialStep("查询版本", "AT+GMR\r\n", r"\d+\.\d+", match=MatchMode.REGEX, timeout=1, retries=1),
    SerialStep("握手", b"\xA5\x01", "A5 ?? 5A", match=MatchMode.HEX_WILDCARD),
]
for res in ser.run_sequence(steps):
    print(res.label, res.passed)
ser.close()
```

### I²C

```python
from usbtoolbox.tester import UsbToolBoxClient, I2CTester

i2c = I2CTester(UsbToolBoxClient(), index=0, speed_khz=100).open()
print("found:", [hex(a) for a in i2c.scan()])
val = i2c.read_reg(0x50, 0x00, 16)        # EEPROM @0x50 读 16 字节
i2c.write_reg(0x50, 0x10, b"\x12\x34", verify=True)
i2c.close()
```

### SPI

```python
from usbtoolbox.tester import UsbToolBoxClient, SpiTester

spi = SpiTester(UsbToolBoxClient(), index=0).open()
spi.init(mode=0, speed_mhz=8, cs=0)
jedec = spi.transfer(bytes([0x9F, 0, 0, 0]))[1:4]   # Read JEDEC ID
print("JEDEC:", jedec.hex())
spi.close()
```

### Modbus（RTU，走串口）

```python
from usbtoolbox.tester import UsbToolBoxClient, ModbusTester

mb = ModbusTester(UsbToolBoxClient(), "COM4", unit=1).open(9600)
print(mb.read_holding_registers(0, 4))
mb.write_register(0x10, 1234, verify=True)
mb.close()
```

### 统一测试计划

见 `usbtoolbox/tester/examples/spi_flash_check.py`：

```bash
cd python
python usbtoolbox/tester/examples/spi_flash_check.py http://127.0.0.1:8765 SN-0001
```

## REST 端点参考

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 服务健康 + CH347 可用性 |
| GET | `/devices` | CH347 设备列表 |
| POST | `/ch347/open` · `/ch347/close` | 打开/关闭设备 `{index}` |
| POST | `/ch347/spi/init` | SPI 初始化 |
| POST | `/ch347/spi/transfer` · `/write` · `/read` | SPI 全双工/只写/只读 |
| POST | `/ch347/i2c/transfer` · `/i2c/scan` | I²C 读写 / 扫描 |
| POST | `/ch347/gpio/set` | GPIO 设置 |
| GET | `/serial/ports` | 串口列表 |
| POST | `/serial/open` · `/close` · `/write` | 串口打开/关闭/写 |
| GET | `/serial/read?port=&max=` | 串口读缓冲 drain |

字节字段统一用 **hex 字符串**（如 `"a1b2c3"`）。错误统一返回 `{"error": "..."}`。
