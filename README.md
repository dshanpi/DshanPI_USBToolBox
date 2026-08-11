# DshanPI USBToolBox UI

本仓库公开 DshanPI USBToolBox 的前端 UI 源码，并作为桌面软件安装包和自动更新文件的公开发布仓库。

## 下载

请从 [Releases](https://github.com/dshanpi/DshanPI_USBToolBox/releases) 下载适合当前平台的安装包。

## 公开范围

仓库包含 React、TypeScript、CSS、主题、国际化资源及前端构建配置，不包含 Rust/Tauri 后端、Python 后端、内部参考资料、签名私钥或完整桌面应用构建流程。

部分 UI 功能依赖 Tauri 桌面运行时及其后端命令，因此浏览器开发模式主要用于界面开发，硬件和系统集成功能需要在完整桌面应用中运行。

## 前端开发

```bash
npm ci
npm run dev
```

检查和构建：

```bash
npm run typecheck
npm run lint
npm run build
```

## 许可证

请参阅 [LICENSE](LICENSE)。
