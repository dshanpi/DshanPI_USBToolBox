import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay, faStop, faCopy, faTrashCan, faFlask, faFileCode, faFolderOpen,
  faFloppyDisk, faUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invokeCommand, subscribeEvent } from '../../Platform/IPC';
import { MonacoEditor } from '../../CoreUI';
import { AiChat } from './Components/AiChat';
import '../../Hooks/useModalDialog.css';
import './PythonTestTool.css';

/** 控制台一行。 */
interface OutLine {
  kind: 'info' | 'success' | 'error' | 'stdout' | 'stderr';
  text: string;
}

/** 内置示例脚本：用底层 API 直接驱动 SSD1306 显示文本。 */
const EXAMPLE_SCRIPT = `# SSD1306 OLED 128x64 显示文本——像"打开设备"那样，每条命令都看得见、改得动
# 接线：CH347 SPI → SSD1306；DC→GPIO4，RST→GPIO5，CS→CS0
# 运行前：先点上方「开启接口」开启设备接口，并接好 CH347 与屏
import time
from usbtoolbox.tester import UsbToolBoxClient, SpiTester
from usbtoolbox.tester.oled import render_text, preview_ascii

client = UsbToolBoxClient("http://127.0.0.1:8765")
try:
    ch347 = client.health().get("ch347Available")
    print("health: ch347Available =", ch347)
except Exception as e:
    ch347 = False
    print("（设备接口未开启或不可达，仅预览渲染）", e)

TEXT = "Hello, SPI LCD!"
frame = render_text(TEXT, 128, 64, y0=24)   # 文字→帧缓冲（仅渲染，不碰硬件）

if not ch347:
    print(preview_ascii(frame, 128, 64))    # 无接口/无 CH347 时预览渲染效果
else:
    with SpiTester(client, index=0) as spi:   # ← 打开设备（自动 open/close）
        spi.init()                              # 初始化 SPI 传输层（默认 Mode0/8MHz/CS0）
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
        for p in range(8):
            spi.cmd([0xB0 | p, 0x00, 0x10])   # 设页 + 列地址
            spi.set_dc(True)                   # 数据模式：写该页 128 字节
            row = bytes(frame[p * 128:(p + 1) * 128])
            for off in range(0, 128, 64):     # 分块避免丢包
                spi.write(row[off:off + 64])
        print("已显示:", TEXT)
`;

/** 自定义驱动示例（展示用户如何写自己的屏幕驱动）。 */
const CUSTOM_LCD_SCRIPT = `# 自定义 SPI 屏幕驱动示例（继承 SpiDriver，用户可改包源码之外扩展自己的驱动）
from usbtoolbox.tester import UsbToolBoxClient
from usbtoolbox.tester.drivers import SpiDriver
from usbtoolbox.tester.oled import render_text, preview_ascii

class MyCustomLcd(SpiDriver):
    spi_mode = 0; spi_speed_mhz = 8; spi_cs = 0
    width = 128; height = 64
    INIT_CMDS = bytes([0xAE, 0xA1, 0xC8, 0xAF])  # 换成你屏幕的初始化序列
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

client = UsbToolBoxClient("http://127.0.0.1:8765")
text = "Hello, Custom LCD!"
if not client.health().get("ch347Available"):
    print(preview_ascii(render_text(text, 128, 64, y0=24), 128, 64))
else:
    with MyCustomLcd(client, index=0) as lcd:
        lcd.init(); lcd.show_text(text)
    print("已显示:", text)
`;

/** 24C02 EEPROM 读写测试示例。 */
const EEPROM_24C02_SCRIPT = `# 24C02 EEPROM 读写测试（扫描 → 探针读 → 读 → 写 → 读验证 → 复原）
# 24C02：地址 0x50，256 字节，页大小 8 字节。写时必须带 page_size=8 否则跨页会回绕覆盖。
# 报 I2C transfer failed 多半是速率/上拉/接线问题：改 SPEED_KHZ=400 或 50 重试。
# 接线：CH347 I2C → 24C02；SCL/SDA 接好。
# 运行前：先点上方「开启接口」开启设备接口，并接好 CH347
from usbtoolbox.tester import UsbToolBoxClient, I2CTester, UsbToolBoxError

EEPROM_ADDR = 0x50   # 24C02 7 位地址（A0-A2 接地）
PAGE_SIZE = 8         # 24C02 页大小
TEST_ADDR = 0x00
TEST_LEN = 16          # 16 字节，跨 2 个页，验证分页写
READ_CHUNK = 8         # 分块读：避免高速率下一次读 16 字节 NACK
SPEED_KHZ = 100        # 速率：失败时改 400 或 50

client = UsbToolBoxClient("http://127.0.0.1:8765")
print("health:", client.health())
print(f"使用 I2C 速率 {SPEED_KHZ} kHz（读分块 {READ_CHUNK} / 写分页 {PAGE_SIZE}）")

with I2CTester(client, index=0, speed_khz=SPEED_KHZ) as i2c:
    # 1) 扫描确认 24C02 在线
    found = i2c.scan()
    print("扫描到设备:", [hex(a) for a in found])
    if EEPROM_ADDR not in found:
        print("错误：未发现 24C02（0x50）"); raise SystemExit(1)

    # 2) 先读 1 字节探针，最小开销验证读路径（速率/接线）
    try:
        probe = i2c.read_reg(EEPROM_ADDR, TEST_ADDR, 1)
        print(f"[探针] 读 1B @0x00 = {probe.hex()}（读路径正常）")
    except UsbToolBoxError as e:
        print(f"[探针] 读失败：{e}")
        print("提示：扫描能过但读失败，通常是速率/上拉/接线问题，改 SPEED_KHZ 重试。")
        raise SystemExit(1)

    # 3) 读初始数据（写前快照，用于最后复原；分块读更稳）
    original = i2c.read_reg(EEPROM_ADDR, TEST_ADDR, TEST_LEN, chunk=READ_CHUNK)
    print("[写前] 读 16B @0x00:", original.hex(' '))

    # 4) 写测试数据（带 page_size=8 分页写 + verify 回读校验）
    test_data = bytes(range(0xA0, 0xA0 + TEST_LEN))
    print("[写入] 写 16B @0x00:", test_data.hex(' '), f"(页大小 {PAGE_SIZE})")
    try:
        i2c.write_reg(EEPROM_ADDR, TEST_ADDR, test_data,
                      page_size=PAGE_SIZE, write_delay_ms=5, verify=True)
        print("[写入] 完成 + 回读校验通过 [PASS]")
    except UsbToolBoxError as e:
        print(f"[写入] 写入已发出，但回读校验未通过：{e}")

    # 5) 再读一次确认
    readback = i2c.read_reg(EEPROM_ADDR, TEST_ADDR, TEST_LEN, chunk=READ_CHUNK)
    print("[写后] 读 16B @0x00:", readback.hex(' '))
    print("[PASS] 读写测试通过" if readback == test_data else "[FAIL] 读写测试失败")

    # 6) 复原原始数据（测试不改坏芯片内容）
    i2c.write_reg(EEPROM_ADDR, TEST_ADDR, original, page_size=PAGE_SIZE, write_delay_ms=5)
    print("[复原] 已写回原始数据 [PASS]")
print("=== 测试结束 ===")
`;

/** 串口 AT 模组测试示例。 */
const SERIAL_AT_SCRIPT = `# 串口模组 AT 命令测试（握手 → 查版本 → 批量序列 → 报告）
# 演示：列端口、打开、发 AT 等期望响应、批量步骤序列、报告
# 匹配模式自动推断：/正则/ → 正则；含 ?? 或纯 hex → hex 通配；其余 → 精确包含（无需 match=）
# 接线：USB 转串口模组接好（端口名见输出，或手动改 PORT）
# 运行前：先点上方「开启接口」开启设备接口
from usbtoolbox.tester import UsbToolBoxClient, SerialTester, SerialStep

PORT = ""            # 空=自动选第一个串口；或填 "COM3"
BAUD = 115200

client = UsbToolBoxClient("http://127.0.0.1:8765")
print("health:", client.health())

port = PORT or client.serial_ports()[0]["name"]
print(f"使用串口 {port} @ {BAUD} baud")

ser = SerialTester(client, port).open(BAUD)
with ser:
    # 1) 握手：AT -> OK（普通文本自动精确匹配，1s 超时）
    r = ser.send_expect("AT\\r\\n", "OK", timeout=1.0)
    print(f"[握手] AT -> {'PASS' if r.passed else 'FAIL'} | {r.received!r}")
    if not r.passed:
        print("握手失败：模组无响应或波特率不对"); raise SystemExit(1)

    # 2) 查版本：AT+GMR，/.../ 自动按正则匹配版本号（数字.数字）
    r = ser.send_expect("AT+GMR\\r\\n", r"/\\d+\\.\\d+/", timeout=1.5)
    print(f"[版本] AT+GMR -> {'PASS' if r.passed else 'FAIL'} | {r.received!r}")

    # 3) 批量步骤序列：每步含标签/超时/重试/间隔
    steps = [
        SerialStep("查询信号", "AT+CSQ\\r\\n", r"/:\\s*\\d+,/", timeout=1.0, retries=1),
        SerialStep("回显关", "ATE0\\r\\n", "OK", timeout=1.0),
        # 私有帧：send 用 list 发原始字节（str 会当文本编码）；expect 含 ?? 自动 hex 通配
        SerialStep("自定义帧", [0xA5, 0x01, 0x5A], "A5 ?? 5A", timeout=1.0),
    ]
    print(f"\\n[批量序列] 执行 {len(steps)} 步...")
    for res in ser.run_sequence(steps):
        print(f"  {res.label}: {'PASS' if res.passed else 'FAIL'}（尝试 {res.attempts} 次）| {res.received!r}")
# with 退出自动关闭串口
print("=== 测试结束 ===")
`;

/** Modbus RTU 从机测试示例。 */
const MODBUS_RTU_SCRIPT = `# Modbus RTU 从机测试（读寄存器 → 写校验 → 线圈 → 异常处理 → 报告）
# 演示：RTU 帧/CRC、功能码 01/03/05/06/15/16、异常码捕获、写后回读验证
# 接线：USB 转串口 → RS485 → 从机设备（A/B 接好）
# 运行前：先点上方「开启接口」开启设备接口
from usbtoolbox.tester import UsbToolBoxClient, ModbusTester, ModbusError

PORT = ""            # 空=自动选第一个串口；或填 "COM4"
UNIT = 1             # Modbus 从机地址
BAUD = 9600          # Modbus RTU 常见波特率
HOLD_REG = 0x0000    # 保持寄存器起始地址
WRITE_REG = 0x0010   # 可写保持寄存器地址（测试用，会被复原）
COIL = 0x0000        # 线圈起始地址

client = UsbToolBoxClient("http://127.0.0.1:8765")
print("health:", client.health())

port = PORT or client.serial_ports()[0]["name"]
print(f"Modbus RTU：串口 {port} @ {BAUD} baud，unit={UNIT}")

mb = ModbusTester(client, port, unit=UNIT, response_timeout=1.0).open(BAUD)
with mb:
    # 1) 读保持寄存器（功能码 03）+ 快照复原
    orig_hold = mb.read_holding_registers(HOLD_REG, 4)
    print(f"[读] 保持寄存器 @0x{HOLD_REG:04x} ×4 = {[hex(r) for r in orig_hold]}")

    # 2) 写单寄存器 + 回读验证（功能码 06，verify=True 自动比对）
    mb.write_register(WRITE_REG, 0x1234, verify=True)
    print(f"[写] 单寄存器 @0x{WRITE_REG:04x} = 0x1234 [PASS]")

    # 3) 写多寄存器 + 回读验证（功能码 16）
    mb.write_registers(WRITE_REG, [10, 20, 30], verify=True)
    print(f"[写] 多寄存器 @0x{WRITE_REG:04x} = [10,20,30] [PASS]")

    # 4) 读线圈（功能码 01）+ 快照复原
    orig_coil = mb.read_coils(COIL, 8)
    print(f"[读] 线圈 @0x{COIL:04x} ×8 = {orig_coil}")

    # 5) 写单线圈 + 回读验证（功能码 05）
    mb.write_coil(COIL, True, verify=True)
    print(f"[写] 单线圈 @0x{COIL:04x} = True [PASS]")

    # 6) 复原线圈与寄存器（测试不改坏设备内容）
    mb.write_coils(COIL, orig_coil)
    mb.write_registers(WRITE_REG, orig_hold[:3])
    print("[复原] 已写回原始数据 [PASS]")

    # 7) 异常码捕获演示：读非法地址应抛 ModbusError
    try:
        mb.read_holding_registers(0xFFFF, 1)
        print("[异常] 读非法地址未报异常（设备可能未做地址校验）")
    except ModbusError as e:
        print(f"[异常] 读非法地址 0xFFFF 正确抛出：{e}")
# with 退出自动关闭串口
print("=== 测试结束 ===")
`;

/** 内置示例清单：下拉里选 → 加载到编辑器。 */
const BUILTIN_EXAMPLES: Array<{ key: string; label: string; code: string }> = [
  { key: 'oled-hello', label: 'SSD1306 显示文本', code: EXAMPLE_SCRIPT },
  { key: 'eeprom-24c02', label: '24C02 EEPROM 读写测试', code: EEPROM_24C02_SCRIPT },
  { key: 'serial-at', label: '串口 AT 模组测试', code: SERIAL_AT_SCRIPT },
  { key: 'modbus-rtu', label: 'Modbus RTU 从机测试', code: MODBUS_RTU_SCRIPT },
  { key: 'custom-lcd', label: '自定义屏幕驱动（扩展模板）', code: CUSTOM_LCD_SCRIPT },
];

/**
 * Python 产测工具主组件。
 *
 * 左栏：设备接口启停（给外部脚本用的设备通道）+ 运行时信息 + 接口命令速查。
 * 右栏：内置 Python 脚本编辑器 + 运行/停止 + 实时输出控制台。
 *
 * 服务暴露的总线能力与桌面工具共享同一 CH347 / 串口设备单例；脚本通过软件内置的
 * 可嵌入 Python 运行（用户零安装），输出经事件流式回传。
 */
export const PythonTestTool: React.FC = () => {
  // ─── 服务状态 ───
  const [running, setRunning] = useState(false);
  const [activePort, setActivePort] = useState<number | null>(null);
  const [portInput, setPortInput] = useState('8765');
  const [busy, setBusy] = useState(false);

  // ─── 脚本运行 ───
  const [code, setCode] = useState(EXAMPLE_SCRIPT);
  const [scriptRunning, setScriptRunning] = useState(false);
  const [output, setOutput] = useState<OutLine[]>([]);
  const outEndRef = useRef<HTMLDivElement>(null);

  const appendOut = useCallback((kind: OutLine['kind'], text: string) => {
    setOutput((prev) => {
      const next = [...prev, { kind, text }];
      if (next.length > 1000) next.shift();
      return next;
    });
  }, []);

  useEffect(() => { outEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [output]);

  const baseUrl = activePort ? `http://127.0.0.1:${activePort}` : `http://127.0.0.1:${portInput || '8765'}`;

  // ─── 启动时拉状态 + 运行时信息 + 订阅脚本输出 ───
  const refreshStatus = useCallback(async () => {
    try {
      const s = await invokeCommand('pytest_server_status');
      setRunning(s.running);
      setActivePort(s.port);
      if (s.running && s.port) setPortInput(String(s.port));
    } catch { /* 后端未就绪 */ }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let alive = true;
    (async () => {
      const u1 = await subscribeEvent('pytest-script-output', (p) => {
        appendOut(p.stream === 'stderr' ? 'stderr' : 'stdout', p.line);
      });
      const u2 = await subscribeEvent('pytest-script-exit', (p) => {
        appendOut(p.success ? 'success' : 'error',
          `脚本结束，退出码 ${p.code}${p.success ? '' : '（失败）'}`);
        setScriptRunning(false);
      });
      if (alive) { unsubs.push(u1, u2); } else { u1(); u2(); }
    })();
    return () => { alive = false; unsubs.forEach((u) => u()); };
  }, [appendOut]);

  // ─── 服务启停 ───
  const handleStart = useCallback(async () => {
    if (busy || running) return;
    const port = parseInt(portInput, 10);
    if (!port || port < 1 || port > 65535) { appendOut('error', '端口无效（1-65535）'); return; }
    setBusy(true);
    appendOut('info', `开启设备接口 (端口 ${port})...`);
    try {
      const s = await invokeCommand('pytest_server_start', { port });
      setRunning(s.running); setActivePort(s.port);
      appendOut('success', `设备接口已开启：${baseUrl}`);
    } catch (e) {
      appendOut('error', `开启失败：${(e as Error).message}`);
    } finally { setBusy(false); }
  }, [busy, running, portInput, baseUrl, appendOut]);

  const handleStop = useCallback(async () => {
    if (busy || !running) return;
    setBusy(true);
    try {
      await invokeCommand('pytest_server_stop');
      setRunning(false); setActivePort(null);
      appendOut('info', '设备接口已关闭');
    } catch (e) {
      appendOut('error', `关闭失败：${(e as Error).message}`);
    } finally { setBusy(false); }
  }, [busy, running, appendOut]);

  const copyBaseUrl = useCallback(() => {
    navigator.clipboard?.writeText(baseUrl);
  }, [baseUrl]);

  // ─── 用户工作区（放自己的驱动/模块/脚本，自动加入 sys.path 可被 import）───
  const [userDir, setUserDir] = useState<string>('');
  const [currentName, setCurrentName] = useState<string>(''); // 当前编辑文件名（未命名则空）
  // 自定义保存弹窗（取代浏览器 window.prompt，不显示 "localhost:3030"）
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogName, setSaveDialogName] = useState('');

  const refreshUserFiles = useCallback(async () => {
    try {
      const dir = await invokeCommand('pytest_user_dir');
      setUserDir(dir);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshUserFiles(); }, [refreshUserFiles]);

  const loadExample = useCallback((key: string) => {
    const ex = BUILTIN_EXAMPLES.find((e) => e.key === key);
    if (ex) { setCode(ex.code); setCurrentName(''); }
  }, []);

  const saveAsUserFile = useCallback(async () => {
    // 已有文件名 → 直接覆盖保存（无弹窗）；否则弹出命名对话框
    if (currentName) {
      try {
        await invokeCommand('pytest_write_user_file', { name: currentName, content: code });
        await refreshUserFiles();
        appendOut('success', `已保存：${currentName}（可被其它脚本 import）`);
      } catch (e) {
        appendOut('error', `保存失败：${(e as Error).message}`);
      }
      return;
    }
    // 首次命名：弹出自定义对话框（非浏览器 prompt，不显示 localhost:3030）
    setSaveDialogName('my_script.py');
    setSaveDialogOpen(true);
  }, [code, currentName, refreshUserFiles, appendOut]);

  /** 保存弹窗：确认保存 */
  const handleSaveDialogConfirm = useCallback(async () => {
    const name = saveDialogName.trim();
    if (!name) return;
    setSaveDialogOpen(false);
    try {
      await invokeCommand('pytest_write_user_file', { name, content: code });
      setCurrentName(name);
      await refreshUserFiles();
      appendOut('success', `已保存：${name}（可被其它脚本 import）`);
    } catch (e) {
      appendOut('error', `保存失败：${(e as Error).message}`);
    }
  }, [saveDialogName, code, refreshUserFiles, appendOut]);

  /** 保存弹窗：在系统文件管理器中打开用户工作区 */
  const handleOpenWorkspace = useCallback(async () => {
    if (userDir) {
      try { await openPath(userDir); } catch { /* ignore */ }
    }
  }, [userDir]);

  /** 打开「API 参考手册」：弹出独立窗口，加载 public/python-api-docs.html。 */
  const openApiDocs = useCallback(async () => {
    const label = 'python-api-docs';
    try {
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }
      new WebviewWindow(label, {
        url: `${window.location.origin}/python-api-docs.html`,
        title: 'Python 产测 API 参考手册',
        width: 1100,
        height: 760,
        resizable: true,
        minimizable: true,
        maximizable: true,
      });
    } catch (e) {
      console.error('打开 API 参考手册失败:', e);
    }
  }, []);

  // ─── 脚本运行 ───
  const runScript = useCallback(async () => {
    if (scriptRunning) return;
    setOutput([]);
    appendOut('info', '运行脚本...');
    if (!running) appendOut('info', '提示：设备接口未开启，脚本中的设备调用会失败。先点「开启接口」。');
    setScriptRunning(true);
    try {
      await invokeCommand('pytest_run_script', { code });
    } catch (e) {
      appendOut('error', `无法启动脚本：${(e as Error).message}`);
      setScriptRunning(false);
    }
  }, [scriptRunning, code, running, appendOut]);

  const stopScript = useCallback(async () => {
    try { await invokeCommand('pytest_stop_script'); } catch { /* ignore */ }
    setScriptRunning(false);
    appendOut('info', '已请求停止脚本');
  }, [appendOut]);

  const openFile = useCallback(async () => {
    try {
      const sel = await openDialog({ multiple: false, filters: [{ name: 'Python', extensions: ['py'] }] });
      if (typeof sel === 'string') {
        setCode(await readTextFile(sel));
        appendOut('info', `已加载：${sel}`);
      }
    } catch (e) {
      appendOut('error', `打开文件失败：${(e as Error).message}`);
    }
  }, [appendOut]);

  return (
    <div className="ptt-root">
      {/* ── 顶栏：设备接口（紧凑横排）── */}
      <div className="ptt-topbar">
        <span className="ptt-topbar-title">
          <FontAwesomeIcon icon={faFlask} /> 设备接口
        </span>
        <span className={`ptt-led ${running ? 'online' : ''}`} />
        <span className="ptt-status-text">{running ? '已开启' : '未开启'}</span>
        {running && activePort && <span className="ptt-status-port">端口 {activePort}</span>}
        <span className="ptt-topbar-sep" />
        <label style={{ fontSize: 11, color: 'var(--color-subtext1)', whiteSpace: 'nowrap' }}>端口</label>
        <input className="ptt-input" type="number" min={1} max={65535} value={portInput}
          disabled={running || busy} onChange={(e) => setPortInput(e.target.value)}
          style={{ width: 72, flex: 'none' }} />
        <button className="ptt-btn success" onClick={handleStart} disabled={running || busy}
          style={{ flex: 'none', padding: '4px 12px' }}>
          <FontAwesomeIcon icon={faPlay} /> 开启
        </button>
        <button className="ptt-btn danger" onClick={handleStop} disabled={!running || busy}
          style={{ flex: 'none', padding: '4px 12px' }}>
          <FontAwesomeIcon icon={faStop} /> 关闭
        </button>
        <span className="ptt-topbar-sep" />
        <code style={{
          fontFamily: "'Consolas', monospace", fontSize: 11, color: 'var(--color-accent, #58a6ff)',
          background: 'var(--color-base)', padding: '3px 8px', borderRadius: 4,
          border: '1px solid var(--color-surface1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{baseUrl}</code>
        <button className="ptt-icon-btn" title="复制" onClick={copyBaseUrl}>
          <FontAwesomeIcon icon={faCopy} />
        </button>
        <button className="ptt-icon-btn" title="API 参考手册（在新窗口打开）" onClick={openApiDocs}
          style={{ marginLeft: 'auto' }}>
          <FontAwesomeIcon icon={faUpRightFromSquare} /> API 手册
        </button>
      </div>

      {/* ── 主区：左（脚本 + 输出）+ 右（AI 聊天）── */}
      <div className="ptt-main">
        <div className="ptt-col ptt-col-left">
          <div className="ptt-card ptt-editor-card">
            <div className="ptt-card-title ptt-editor-title">
              <span><FontAwesomeIcon icon={faFileCode} /> 脚本{currentName ? ` · ${currentName}` : ''}</span>
              <div className="ptt-editor-actions">
                <select className="ptt-select" title="加载内置示例"
                  value="" onChange={(e) => { if (e.target.value) loadExample(e.target.value); }}>
                  <option value="">示例…</option>
                  {BUILTIN_EXAMPLES.map((ex) => (
                    <option key={ex.key} value={ex.key}>{ex.label}</option>
                  ))}
                </select>
                <button className="ptt-icon-btn" title="保存为可 import 模块（存到用户工作区）" onClick={saveAsUserFile}>
                  <FontAwesomeIcon icon={faFloppyDisk} /> 保存
                </button>
                <button className="ptt-icon-btn" title="从用户目录打开" onClick={openFile}>
                  <FontAwesomeIcon icon={faFolderOpen} /> 打开
                </button>
                {!scriptRunning ? (
                  <button className="ptt-btn success ptt-run-btn" onClick={runScript}>
                    <FontAwesomeIcon icon={faPlay} /> 运行
                  </button>
                ) : (
                  <button className="ptt-btn danger ptt-run-btn" onClick={stopScript}>
                    <FontAwesomeIcon icon={faStop} /> 停止
                  </button>
                )}
              </div>
            </div>
            <MonacoEditor
              className="ptt-editor-monaco"
              value={code}
              onChange={setCode}
              language="python"
            />
          </div>

          <div className="ptt-card ptt-output-card">
            <div className="ptt-card-title ptt-log-title">
              <span>输出</span>
              <button className="ptt-icon-btn" title="清空" onClick={() => setOutput([])}>
                <FontAwesomeIcon icon={faTrashCan} />
              </button>
            </div>
            <div className="ptt-output">
              {output.length === 0 && <div className="ptt-log-empty">尚无输出。点「运行」执行脚本。</div>}
              {output.map((l, i) => (
                <div className={`ptt-out-line ${l.kind}`} key={i}>{l.text || '\u00a0'}</div>
              ))}
              <div ref={outEndRef} />
            </div>
          </div>
        </div>

        <div className="ptt-col ptt-col-right">
          <AiChat
            onApplyCode={(c) => { setCode(c); appendOut('info', '已应用 AI 生成的代码到编辑器'); }}
            onLog={(msg, isError) => appendOut(isError ? 'error' : 'info', msg)}
          />
        </div>
      </div>

      {/* 自定义保存弹窗（取代浏览器 window.prompt，不显示 localhost:3030） */}
      {saveDialogOpen && (
        <div className="spi-modal-overlay" onClick={() => setSaveDialogOpen(false)}>
          <div className="spi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="spi-modal-title">保存脚本</div>
            <div className="spi-modal-message">
              保存到用户工作区后，可被其他脚本 <code>import</code>。
            </div>
            <div className="ptt-save-path">
              <code title={userDir}>{userDir || '…'}</code>
              <button className="ptt-icon-btn" onClick={handleOpenWorkspace}
                title="在文件管理器中打开工作区" disabled={!userDir}>
                <FontAwesomeIcon icon={faUpRightFromSquare} />
              </button>
            </div>
            <input
              className="spi-modal-input"
              type="text"
              value={saveDialogName}
              autoFocus
              onChange={(e) => setSaveDialogName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveDialogConfirm();
                if (e.key === 'Escape') setSaveDialogOpen(false);
              }}
            />
            <div className="spi-modal-actions">
              <button className="spi-modal-btn" onClick={() => setSaveDialogOpen(false)}>取消</button>
              <button className="spi-modal-btn primary" onClick={() => void handleSaveDialogConfirm()}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
