# DshanPI USBToolBox

DshanPI USBToolBox 官方发布与下载仓库。

本仓库仅用于提供 DshanPI USBToolBox 的正式版本安装包，不公开应用程序源代码。

## 下载

**Windows x64：下载 [v1.0.14 安装包](https://github.com/dshanpi/DshanPI_USBToolBox/releases/tag/v1.0.14)。**

- [EXE 离线安装包](https://github.com/dshanpi/DshanPI_USBToolBox/releases/download/v1.0.14/DshanPI.USBToolBox_1.0.14_x64-setup.exe)
- [SHA-256 校验文件](https://github.com/dshanpi/DshanPI_USBToolBox/releases/download/v1.0.14/SHA256SUMS.txt)

升级前请保存工作并退出旧版软件，再运行 EXE 安装包。安装包内置完整 WebView2 离线运行环境、设备驱动、Python 运行环境和烧录工具；安装后可在软件内安装配套驱动，按 **F1** 打开内置使用指南。

v1.0.14 新增串口转义解析和 CR / LF / CRLF 行尾选择，完善连续发送、中文接收、日志与多会话稳定性；内置 MCP 使用指南，Agent 连接后可按需读取；修复 Python 产测编辑器行号显示异常。

离线 AI 模式继续支持本机或局域网模型及自定义 API Key，模型服务需自行部署或配置。Windows 安装包未做发布者签名，具体说明见对应 Release。

v1.0.14 本次仅提供 Windows x64 EXE 手动安装包，不包含新的 MSI、macOS、Linux 或 Windows ARM64 安装包。自动更新通道保持不变，GitHub `Latest` 标记暂保留在 v1.0.11；下载 Windows 新版请使用上面的 v1.0.14 链接。

其他已发布安装包见 [全部 Releases](https://github.com/dshanpi/DshanPI_USBToolBox/releases)。请仅从本仓库的 Release 附件下载软件，并阅读对应版本的签名与兼容性说明。

---

This repository is the official release and download location for DshanPI USBToolBox.

It contains release packages only. The application source code is not published here.
