# USBToolBox Python 产测 API 手册

> 适用版本：USBToolBox v1.0.0+ · Python ≥ 3.8 · **零外部依赖（仅标准库）**

本手册是 `usbtoolbox.tester` 包的完整参考。该包把 USBToolBox 桌面应用内嵌的本地 HTTP REST
服务封装为 Python API，供产测工程师编写自动化测试。所有总线访问都经主进程，与桌面工具
**共享同一 CH347 / 串口设备单例**（不绕过主进程直接操作硬件）。

---

## 目录

1. [运行方式](#1-运行方式)
2. [快速开始](#2-快速开始)
3. [UsbToolBoxClient](#3-usbtoolboxclient)
4. [SerialTester](#4-serialtester)
5. [I2CTester](#5-i2ctester)
6. [SpiTester](#6-spitester)
7. [ModbusTester](#7-modbustester)
8. [统一框架 TestPlan / TestReport](#8-统一框架-testplan--testreport)
9. [并行 ParallelRunner](#9-并行-parallelrunner)
10. [配置 TesterConfig（YAML/JSON）](#10-配置-testerconfigyamljson)
11. [SN 条码 read_sn / BarcodeScanner](#11-sn-条码-read_sn--barcodescanner)
12. [报告格式（JSON / CSV / HTML）](#12-报告格式)
13. [REST 端点参考](#13-rest-端点参考)
14. [单元测试](#14-单元测试)
15. [**编写你自己的驱动（扩展）**](#15-编写你自己的驱动扩展)

---

## 1. 运行方式

### 方式 A：软件内运行（推荐，零安装）

1. 打开 USBToolBox →「**Python 产测工具**」页 →「**启动**」HTTP 服务（默认端口 8765）。
2. 在右侧脚本编辑器中编写/打开脚本 →「**运行**」。输出实时显示在下方控制台。

软件内置可嵌入 Python 运行时（见 `src-tauri/resources/pyembed/`），用户**无需安装 Python**，
也无需 `pip install` 任何包（本包仅用标准库）。

### 方式 B：独立运行（开发/CI）

把仓库 `python/` 目录加入 `PYTHONPATH`，用任意 Python ≥ 3.8 运行：

```bash
cd python
python -c "from usbtoolbox.tester import UsbToolBoxClient; print(UsbToolBoxClient().health())"
```

---

## 2. 快速开始

```python
from usbtoolbox.tester import UsbToolBoxClient, SpiTester, TestPlan

client = UsbToolBoxClient("http://127.0.0.1:8765")
print(client.health())        # {'status': 'ok', 'ch347Available': True}
print(client.list_devices())  # CH347 设备列表
```

---

## 3. UsbToolBoxClient

`UsbToolBoxClient(base_url="http://127.0.0.1:8765", timeout=5.0)` — HTTP 薄客户端（标准库 urllib）。
错误统一抛 `UsbToolBoxError`。字节参数/返回均为 `bytes`，内部按 hex 字符串与服务交换。

| 方法 | 说明 |
| --- | --- |
| `health()` | `{status, ch347Available}` |
| `list_devices()` | CH347 设备列表 |
| `ch347_open(index)` / `ch347_close(index)` | 打开/关闭设备 |
| `spi_init(index, *, mode, speed_mhz, cs, data_bits, byte_order)` | SPI 初始化 |
| `spi_transfer(index, tx: bytes, cs=None) -> bytes` | 全双工 |
| `spi_write(index, tx: bytes, cs=None)` | 只写 |
| `spi_read(index, read_len, cs=None) -> bytes` | 只读 |
| `i2c_transfer(index, write_data: bytes, read_len=0, *, speed_khz, scl_stretch, delay_ms) -> bytes` | I2C 读写 |
| `i2c_scan(index, *, speed_khz, scl_stretch, delay_ms) -> list[int]` | 扫描 1–127 |
| `gpio_set(index, enable, dir_out, data_out)` | GPIO 位掩码设置 |
| `serial_ports()` | 串口列表 |
| `serial_open(port, baud_rate, *, data_bits=8, stop_bits=1, parity="none", flow_control="none")` | 打开串口 |
| `serial_close(port)` / `serial_write(port, data: bytes)` | 关闭 / 写 |
| `serial_read(port, max_bytes=4096) -> bytes` | drain 读缓冲（非阻塞） |

---

## 4. SerialTester

`SerialTester(client, port)` — 产测友好的串口能力。支持 `with` 上下文管理（自动 close）。

匹配模式**自动推断**，无需导入 `MatchMode`、无需传 `match=`：

| `expect` 形式 | 推断模式 | 示例 |
| --- | --- | --- |
| 普通文本 / bytes | 精确包含 | `"OK"`、`"AT\r\n"` |
| `/.../` 包裹 | 正则 | `r"/\d+\.\d+/"` |
| 含 `??` 或纯 hex | hex 通配 | `"A5 ?? 5A"`、`"A5015A"` |

```python
from usbtoolbox.tester import SerialTester, SerialStep

with SerialTester(client, "COM3").open(115200) as ser:
    r = ser.send_expect("AT\r\n", "OK", timeout=1.0)        # 普通文本 → 精确包含
    print(r.passed, r.received)

    steps = [
        SerialStep("版本", "AT+GMR\r\n", r"/\d+\.\d+/", timeout=1, retries=1),  # /.../ → 正则
        SerialStep("自定义帧", "A5 01 5A", "A5 ?? 5A", timeout=1.0),             # 含 ?? → hex 通配
    ]
    for res in ser.run_sequence(steps):
        print(res.label, res.passed, res.received)
# with 退出自动关闭串口
```

> `send` 也支持灵活输入：str 按文本编码（AT 命令等）；要发原始 hex 字节用 `"A5 01"` / `[0xA5,0x01]` / `bytes`。
- `send_expect(send, expect=None, *, match=None, timeout=1.0, strip_ansi_seq=True, encoding="utf-8") -> SerialStepResult`
- `run_sequence(steps) -> list[SerialStepResult]`（含重试/间隔/标签）。
- `strip_ansi(data: bytes) -> bytes` 剥离 ANSI 转义序列。
- `SerialStepResult` 字段：`label, passed, sent, received, elapsed, timestamp, attempts, error`。

---

## 5. I2CTester

`I2CTester(client, index=0, *, speed_khz=None)`。

```python
i2c = I2CTester(client, index=0, speed_khz=100).open()
print([hex(a) for a in i2c.scan()])
val = i2c.read_reg(0x50, 0x00, 16)               # 8 位寄存器地址
i2c.write_reg(0x50, 0x10, b"\x12\x34", verify=True)
big = i2c.read_reg(0x68, 0x1234, 4, reg_width=16)  # 16 位寄存器地址
i2c.close()
```

`read_reg / write_reg / read_block / write_block`，均支持 `reg_width=8|16`，写支持 `verify=True` 回读校验。

### 什么时候填 page_size？怎么知道值是多少？

**判断依据**：你访问的是「带内部存储阵列的器件」还是「寄存器器件」。

| 器件类型 | 例子 | 是否有页 | page_size |
| --- | --- | --- | --- |
| 寄存器器件（无页概念） | 传感器、GPIO 扩展、RTC、ADC | 否 | **不填**（单次整块写） |
| I²C EEPROM | 24Cxx 系列、24LCxx | **是** | 填芯片页大小 |

> 寄存器器件的写是"写一个寄存器"，没有页阵列、不会回绕，填不填 page_size 行为一样（默认不分页）。
> EEPROM 有内部页阵列，一次写超过页大小会**地址回绕到该页开头覆盖**——这就是要填 page_size 的原因。

**常见 I²C EEPROM 页大小速查**（地址多为 0x50–0x57）：

| 型号 | 容量 | 页大小(字节) |
| --- | --- | --- |
| 24C01 / 24C02 | 1K/2K bit | **8** |
| 24C04 / 24C08 / 24C16 | 4K/8K/16K bit | **16** |
| 24C32 / 24C64 | 32K/64K bit | **32** |
| 24C128 / 24C256 | 128K/256K bit | **64** |
| 24C512 / 24C1024 | 512K/1024K bit | **128** |

填了 page_size 后，`write_reg` / `write_block` 会自动按页边界拆分多次小写、每次后等 `write_delay_ms`（tWR，默认 5ms）：

```python
i2c.write_reg(0x50, 0x00, large_payload, page_size=8, write_delay_ms=5, verify=True)
```

> 不确定页大小时：查芯片数据手册的 "Page Write" 一节；先小批量写（如 8 字节）读回验证，再放大。
> 桌面 I2C 工具的「页大小」输入框旁有「常用芯片」下拉，可直接选型号自动填入。
> 完整 24C02 读写测试示例见 `python/usbtoolbox/tester/examples/eeprom_24c02_test.py`，
> 也在「Python 产测工具」页「示例…」下拉里。

---

## 6. SpiTester

`SpiTester(client, index=0)`。支持 `with` 上下文管理（自动 open/close）。

```python
with SpiTester(client, index=0) as spi:   # 打开设备（自动 open/close）
    spi.init()                              # 初始化 SPI 传输层（默认 Mode0/8MHz/CS0，通常无需传参）
    jedec = spi.transfer([0x9F, 0, 0, 0])    # 全双工
    spi.write([0x01, 0x02])                  # 只写
    rx = spi.read(4)                          # 只读
    spi.set_dc(True); spi.set_rst(False)     # DC=GPIO4, RST=GPIO5
# 退出 with 自动 close()
```

**灵活输入**：`write/transfer/cmd/data` 的数据参数都支持多种写法，无需手写 `b"\x.."`：

```python
spi.write(0xAE)            # 单个整数
spi.write([0xA1, 0xC8])    # 列表
spi.write("A1 C8")         # hex 串（空格/逗号/0x 都可）
spi.write(b"\xAF")         # bytes（也兼容）
```

**命令/数据便捷发送**（自动切 DC，最常用）：

```python
spi.cmd(0xAE, 0xA1, 0xC8)        # DC=0 命令模式：每参数一次传输，参数可为 int/list/hex串
spi.cmd([0xA8, 0x3F], [0x81, 0xCF])  # 多字节命令
spi.data([0x01, 0x02, 0x03])      # DC=1 数据模式：发显存/参数
```


工作流（兼容桌面 SPI 工具预设格式 `{name, steps:[{type,data}]}`）：

```python
steps = spi.load_preset("my_preset.json")
spi.run_workflow(steps)        # 或 spi.run_preset("my_preset.json")
spi.save_preset("out.json", steps, name="demo")
```

步骤类型：`send` / `duplex` / `dc_low` / `dc_high` / `reset_low` / `reset_high` / `delay`（`cs_low`/`cs_high` 在 REST 切片下为 no-op，SPI 写自动控制 CS）。

### SSD1306 OLED 文字显示（`usbtoolbox.tester.oled`）

软件内置运行时无 PIL/字体库，故包内自带 8x8 ASCII 点阵字体，可把文字渲染成 SSD1306
帧缓冲并通过 SPI 显示（初始化序列、字节布局对齐桌面「SPI 点屏工具」的 SSD1306 128x64 预设）。

`SSD1306Spi` 继承 `SpiDriver`（见第 15 节），是"用封装好的基类写驱动"的范例：SPI 传输层由
`open()` 负责，芯片初始化在 `init()`。用 `with` 自动管理生命周期：

```python
from usbtoolbox.tester import UsbToolBoxClient
from usbtoolbox.tester.oled import SSD1306Spi, render_text, preview_ascii

client = UsbToolBoxClient()
with SSD1306Spi(client, index=0) as oled:         # open() 打开设备 + 初始化 SPI 传输层
    oled.init()                                     # 芯片复位(RST=GPIO5) + SSD1306 命令 + 清屏
    oled.show_text("Hello, SPI LCD!", y=24)         # 居中显示（DC=GPIO4）
# 退出 with 自动 close()

# 无硬件时可先预览渲染（ASCII art）
print(preview_ascii(render_text("Hello, SPI LCD!", 128, 64), 128, 64))
```

- `SSD1306Spi(client, *, index=0, width=128, height=64, spi_mode, spi_speed_mhz, spi_cs)`：`init(reset=True)` / `display(page_bytes)` / `clear()` / `show_text(text, x=0, y=0)`。
- `render_text(text, width=128, height=64, x0=0, y0=0) -> list[int]`：page-major 帧缓冲（多行用 `\n`，每行 8px 高）。
- `FONT8X8`：内置字模字典，可自行扩展。

> 完整示例见 `python/usbtoolbox/tester/examples/oled_ssd1306_hello.py`，也是「Python 产测工具」页的内置默认脚本。

---

## 7. ModbusTester

`ModbusTester(client, port, unit=1, *, response_timeout=1.0)` — 纯 Python RTU（走串口端点）。

```python
mb = ModbusTester(client, "COM4", unit=1).open(9600)
regs = mb.read_holding_registers(0, 4)     # 功能码 03
mb.write_register(0x10, 1234, verify=True)  # 06 + 回读
mb.write_registers(0, [10, 20, 30], verify=True)  # 16
coils = mb.read_coils(0, 8)                 # 01
mb.write_coil(2, True, verify=True)         # 05
mb.close()
```

功能码：01/02 读位，03/04 读寄存器，05/06 写单个，15/16 写多个。异常响应抛 `ModbusError`。
辅助：`crc16(data)`、`build_rtu_frame(unit, pdu)`、`build_tcp_frame(unit, pdu, transaction_id)`。

---

## 8. 统一框架 TestPlan / TestReport

```python
from usbtoolbox.tester import TestPlan

plan = TestPlan("出厂检测", station="ST-01")
plan.add_step("打开", lambda: spi.open() or True, stop_on_fail=True)
plan.add_step("ID 校验", lambda: (spi.transfer(b"\x9f\0\0\0")[1:4] != b"\xff\xff\xff", "check id"), retries=1)

report = plan.run("SN-0001")
print("PASS" if report.passed else "FAIL")
report.save_json("r.json"); report.save_csv("r.csv"); report.save_html("r.html")
```

- 步骤函数约定：返回真值 / `(True, detail)` → 通过；假值 / `(False, detail)` → 失败；抛异常 → 失败（异常记入 `error`）。
- `add_step(name, fn, *, retries=0, stop_on_fail=False)`，`run(sn) -> TestReport`。
- `TestReport`：`.passed`、`.to_json()/.to_csv()/.to_html()`、`.save_json/csv/html(path)`、`.results: list[StepResult]`。

---

## 9. 并行 ParallelRunner

```python
from usbtoolbox.tester import ParallelRunner, all_ok

runner = ParallelRunner(max_workers=4)
runner.add("串口模组", lambda: SerialTester(client, "COM3").open(115200).send_expect("AT\r\n", "OK").passed)
runner.add("I2C 传感器", lambda: 0x68 in I2CTester(client, 0).open().scan())
results = runner.run()         # {name: ParallelResult(name, ok, value, error, elapsed)}
print("全部通过" if all_ok(results) else "有失败")
```

> 并行任务应操作**不同设备/端口**，避免对同一物理设备并发下发命令。

---

## 10. 配置 TesterConfig（YAML/JSON）

无需 PyYAML，内置 YAML 子集解析（也兼容 JSON）。

```yaml
# config.yaml
baseUrl: http://127.0.0.1:8765
baudRate: 115200
spiMode: 0
spiSpeedMhz: 8
station: ST-01
limits:        # 未识别项进入 cfg.extra
  vmin: 3.2
  vmax: 3.4
```

```python
from usbtoolbox.tester import TesterConfig

cfg = TesterConfig.from_file("config.yaml")
client = cfg.make_client()
print(cfg.base_url, cfg.baud_rate, cfg.extra["limits"])
```

字段：`base_url, timeout, serial_port, baud_rate, data_bits, stop_bits, parity, ch347_index, spi_mode, spi_speed_mhz, spi_cs, i2c_speed_khz, extra`。
支持 camelCase 与 snake_case 两种 key。底层函数：`load_config_file(path)` / `load_config_text(text)` / `parse_yaml(text)`。

---

## 11. SN 条码 read_sn / BarcodeScanner

USB 条码枪多为"键盘楔入"设备，扫码即按行输出到标准输入。

```python
from usbtoolbox.tester import read_sn, BarcodeScanner

sn = read_sn("请扫码/输入 SN：", validate=r"^SN\d{8}$", retries=2)
# 或显式：scanner = BarcodeScanner(validate=r"^SN\d+$"); sn = scanner.read()
```

`read_sn` 若设置环境变量 `USBTOOLBOX_SN`（默认）则优先取它，便于自动化/CI。

---

## 12. 报告格式

`TestReport` 支持三种输出：

- **JSON**：`to_json()` / `save_json(path)` — 机器解析（含 sn / 工站 / 每步结果 / overall）。
- **CSV**：`to_csv()` / `save_csv(path)` — 表格查看。
- **HTML**：`to_html()` / `save_html(path)` — 自包含可视化报告，浏览器直接打开。

---

## 13. REST 端点参考

服务仅监听 `127.0.0.1`。字节字段统一 **hex 字符串**；错误统一 `{"error": "..."}`（输入/设备错误 400）。

| 方法 | 路径 | Body / Query | 返回 |
| --- | --- | --- | --- |
| GET | `/health` | — | `{status, ch347Available}` |
| GET | `/devices` | — | `[{index, name, ...}]` |
| POST | `/ch347/open` · `/close` | `{index}` | `{ok}` |
| POST | `/ch347/spi/init` | `{index, mode?, speedMhz?, cs?, dataBits?, byteOrder?}` | `{ok}` |
| POST | `/ch347/spi/transfer` | `{index, txData, cs?}` | `{data}` |
| POST | `/ch347/spi/write` | `{index, txData, cs?}` | `{ok}` |
| POST | `/ch347/spi/read` | `{index, readLen, cs?}` | `{data}` |
| POST | `/ch347/i2c/transfer` | `{index, writeData, readLen, speedKhz?, sclStretch?, delayMs?}` | `{data}` |
| POST | `/ch347/i2c/scan` | `{index, speedKhz?, ...}` | `{addresses}` |
| POST | `/ch347/gpio/set` | `{index, enable, dirOut, dataOut}` | `{ok}` |
| GET | `/serial/ports` | — | `[{name, vid, pid, ...}]` |
| POST | `/serial/open` | `{port, baudRate, dataBits?, stopBits?, parity?, flowControl?}` | `{ok}` |
| POST | `/serial/close` | `{port}` | `{ok}` |
| POST | `/serial/write` | `{port, data}` | `{ok}` |
| GET | `/serial/read` | `?port=&max=` | `{data}` |

---

## 14. 单元测试

`python/tests/` 提供基于 Mock HTTP 服务与假从机的单元测试，**无需真实硬件 / 应用**：

```bash
cd python
python -m unittest discover -s tests -v
```

覆盖：client/serial/i2c/spi（Mock 服务）、Modbus（CRC 标准校验值 + 假从机读写/异常）、
YAML 子集解析、TestPlan/报告、ParallelRunner、匹配模式与 ANSI 剥离。

---

## 15. 编写你自己的驱动（扩展）

你不能、也不需要改包源码。软件为产测工程师提供了一个**用户工作区目录**：在「Python 产测工具」
页左下角「用户工作区」卡片可看到其路径（位于 app-data 下，可写、持久化）。该目录在脚本运行时
**自动加入 `sys.path`**，因此你在里面写的任何 `.py` 模块都能被脚本 `import` 复用。

### 三层模型

1. **基础层**（包内置，稳定不改）：`UsbToolBoxClient` + `SpiTester`/`I2CTester`/`SerialTester`/`ModbusTester`。
   底层 API 都很通用——`spi.set_dc/set_rst/write`、`spi.init`、`client.ch347_open/close` 等，
   直接用它们就能驱动任何 SPI/I²C 器件，无需任何封装。
2. **驱动层**（你写，可选）：把某芯片的命令序列封装成函数/类复用。两种写法都支持：
   - **直接组合**（最自由、扩展性最强）：直接调基础 API，每条命令都看得见。内置 SSD1306 示例即此写法。
   - **继承基类**（更规整）：继承 `SpiDriver`/`I2CDriver`，自动获得 open/close 生命周期。
3. **脚本层**（你写的）：import 基础层 + 你的驱动，跑产测流程。

### 方式一：直接用底层 API 驱动（推荐入门，扩展性最强）

不需要任何封装类。用 `with SpiTester(...) as spi` 像"打开设备"那样一步到位（自动 open/close），
里面再用底层 API 把每条命令写出来——看得见、改得动：

```python
import time
from usbtoolbox.tester import UsbToolBoxClient, SpiTester
from usbtoolbox.tester.oled import render_text   # 文字→帧缓冲（仅渲染）

client = UsbToolBoxClient()

with SpiTester(client, index=0) as spi:           # ← 打开设备（自动 open/close）
    spi.init()                                      # 初始化 SPI 传输层（默认 Mode0/8MHz/CS0）

    # 硬复位（RST = GPIO5）
    spi.set_rst(False); time.sleep(0.01); spi.set_rst(True); time.sleep(0.05)

    # 发 SSD1306 初始化命令：传普通整数即可，cmd() 自动 DC=0 + 转字节
    spi.cmd(
        0xAE,                 # 显示关
        0xA1,                 # 段重映射（列翻转）
        0xC8,                 # COM 扫描方向反向
        [0xA8, 0x3F],         # MUX = 1/64
        [0x81, 0xCF],         # 对比度
        [0xD9, 0xF1],         # 预充电周期
        [0xDA, 0x12],         # COM 引脚配置
        [0xDB, 0x30],         # VCOMH
        [0x8D, 0x14],         # 电荷泵开启
        0xAF,                 # 显示开启
    )
    time.sleep(0.1)

    # 逐页写显存（Page Addressing 模式）
    frame = render_text("Hello, SPI LCD!", 128, 64, y0=24)
    for p in range(8):
        spi.cmd([0xB0 | p, 0x00, 0x10])   # 设页 + 列地址
        spi.set_dc(True)                   # 数据模式：写该页 128 字节
        row = bytes(frame[p * 128:(p + 1) * 128])
        for off in range(0, 128, 64):     # 分块避免丢包
            spi.write(row[off:off + 64])
# 退出 with 自动关闭设备
```

> 这套写法照搬即可——把初始化命令序列和寻址方式换成你自己屏幕的，就能驱动任意 SPI 屏。
> 内置示例 `oled_ssd1306_hello.py` 与「Python 产测工具」页默认脚本即此写法。

### 方式二：封装成驱动类（复用）

若同一芯片要在多处用，可在用户工作区建 `my_lcd.py`（界面点「保存」即可存到这里），封装成类。
继承 `SpiDriver` 自动获得 open/close：

```python
# my_lcd.py —— 放在用户工作区目录
from usbtoolbox.tester.drivers import SpiDriver
from usbtoolbox.tester.oled import render_text   # 复用内置 8x8 字体渲染

class MyCustomLcd(SpiDriver):
    spi_mode = 0; spi_speed_mhz = 8; spi_cs = 0
    width = 128; height = 64
    INIT_CMDS = bytes([0xAE, 0xA1, 0xC8, 0xAF])   # ← 换成你屏幕的初始化序列

    def init(self):
        self.spi.set_rst(False); import time; time.sleep(0.01)
        self.spi.set_rst(True); time.sleep(0.05)
        self.spi.set_dc(False); self.spi.write(self.INIT_CMDS); return self

    def display(self, buf):
        for p in range(self.height // 8):
            self.spi.set_dc(False); self.spi.write(bytes([0xB0|p, 0x00, 0x10]))
            self.spi.set_dc(True)
            row = buf[p*self.width:(p+1)*self.width]
            for off in range(0, len(row), 64): self.spi.write(bytes(row[off:off+64]))

    def show_text(self, t, y=24): self.display(render_text(t, self.width, self.height, y0=y))
```

然后在脚本里直接 import 使用：

```python
from usbtoolbox.tester import UsbToolBoxClient
from my_lcd import MyCustomLcd   # ← 来自你的用户工作区

with MyCustomLcd(UsbToolBoxClient(), index=0) as lcd:
    lcd.init(); lcd.show_text("Hi")
```

> `SpiDriver.open()` 已自动打开 CH347 设备并初始化 SPI 传输层（含 `self.spi`）；
> 你只需在 `init()` 里做芯片复位 + 初始化命令。`with` 退出自动 `close()`。
> 若驱动的是 I²C 器件，改继承 `I2CDriver`，用 `self.i2c.read_reg/write_reg`。

### 驱动基类参考（`usbtoolbox.tester.drivers`）

| 类 | 说明 |
| --- | --- |
| `Driver(client)` | 可选基类：`open()/close()` + 上下文管理（`with`）。 |
| `SpiDriver(client, *, index, spi_mode, spi_speed_mhz, spi_cs)` | `open()` 打开设备 + `self.spi` 初始化好 SPI 传输层；`close()` 释放。子类填 `init()`。 |
| `I2CDriver(client, *, index, i2c_speed_khz)` | `open()` 打开设备 + `self.i2c` 就绪。子类填芯片初始化。 |

### 内置示例

- `oled_ssd1306_hello.py`：SSD1306 显示文本——**直接用底层 API**（每条命令可见，推荐入门）。
- `eeprom_24c02_test.py`：24C02 EEPROM 读写测试（扫描 → 读 → 分页写 + 回读校验 → 复原）。
- `serial_at_module_test.py`：串口 AT 模组测试（握手 → 查版本 → 批量序列 → 报告）。
- `modbus_rtu_test.py`：Modbus RTU 从机测试（读寄存器 → 写校验 → 线圈 → 异常处理 → 报告）。
- `custom_spi_lcd.py`：自定义 SPI 屏幕驱动模板（封装成类，继承 SpiDriver）。
- 在「Python 产测工具」页「示例…」下拉里可直接加载到编辑器。

> 想支持全新协议/总线？基础层已是通用 HTTP 客户端，任何能经 CH347/串口表达的协议都能在驱动层
> 自行实现。后续若需把驱动注册到 UI 菜单等，可在用户工作区约定一个清单文件，由脚本扫描发现。
