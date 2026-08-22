# 内置 Python 运行时（pyembed）

本目录用于存放随软件打包的 **Windows 可嵌入版 Python**，使终端用户**无需自行安装 Python**
即可在「Python 产测工具」页内直接运行测试脚本。

## 为什么是空的

可嵌入版 Python 是二进制，不入库。请在**开发/打包机器上一次性**运行下载脚本填充：

```powershell
# 在仓库根目录执行（Windows PowerShell）
./scripts/fetch-python-runtime.ps1
```

脚本会下载官方 `python-3.x.x-embed-amd64.zip` 解压到本目录，使其包含 `python.exe`。

## 运行时解析顺序（见 src-tauri/src/httpd/runner.rs）

解释器：
1. 环境变量 `USBTOOLBOX_PYTHON`（手动指定）
2. 本目录 `pyembed/python.exe`（打包内置，**推荐**）
3. 系统 `python` / `python3`（回退）

包目录（注入 `sys.path`）：
1. 环境变量 `USBTOOLBOX_PYTHON_DIR`
2. 资源目录 `python/`（打包内置，即仓库 `python/`）
3. 开发态：从可执行文件 / 当前目录上溯查找含 `usbtoolbox` 的 `python/` 目录

> Python 包零外部依赖（仅标准库），所以可嵌入版无需 `pip install` 任何东西即可运行。
