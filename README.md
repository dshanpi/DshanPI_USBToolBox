# DshanPI USBToolBox

DshanPI USBToolBox 官方发布与下载仓库。

本仓库仅用于提供 DshanPI USBToolBox 的正式版本安装包，不公开应用程序源代码。

## 下载

**Windows x64：下载 [v1.0.15 安装包](https://github.com/dshanpi/DshanPI_USBToolBox/releases/tag/v1.0.15)。**

- [EXE 离线安装包](https://github.com/dshanpi/DshanPI_USBToolBox/releases/download/v1.0.15/DshanPI.USBToolBox_1.0.15_x64-setup.exe)
- [SHA-256 校验文件](https://github.com/dshanpi/DshanPI_USBToolBox/releases/download/v1.0.15/SHA256SUMS.txt)

升级前请保存工作并退出旧版软件，再运行 EXE 安装包。安装包内置完整 WebView2 离线运行环境、设备驱动、Python 运行环境和烧录工具；安装后可在软件内安装配套驱动，按 **F1** 打开内置使用指南。

v1.0.15 支持串口与 MCP 共用连接、命令自动排队，以及 MCP 保持连接时手动 JTAG/SWD 烧录；完善 Modbus、GPIO 与 I²C 操作保护，增加 Python 助手历史会话、AI 模型获取及连接测试，并加强构建和安装资源检查。

离线 AI 模式继续支持本机或局域网模型及自定义 API Key，模型服务需自行部署或配置。Windows 安装包未做发布者签名，具体说明见对应 Release。

v1.0.15 本次仅提供 Windows x64 EXE 手动安装包，不包含新的 MSI、macOS、Linux 或 Windows ARM64 安装包。自动更新通道保持不变，GitHub `Latest` 标记暂保留在 v1.0.11；下载 Windows 新版请使用上面的 v1.0.15 链接。

其他已发布安装包见 [全部 Releases](https://github.com/dshanpi/DshanPI_USBToolBox/releases)。请仅从本仓库的 Release 附件下载软件，并阅读对应版本的签名与兼容性说明。

---

This repository is the official release and download location for DshanPI USBToolBox.

It contains release packages only. The application source code is not published here.
