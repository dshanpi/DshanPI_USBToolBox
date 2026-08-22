//! 内嵌本地 HTTP REST 服务（Python 产测工具用）。
//!
//! 把 CH347（SPI/I2C/GPIO）与串口能力通过 axum REST API 暴露给独立 Python 进程。
//! handler 复用与 Tauri 命令**同一份** `Arc<Ch347State>` / `Arc<SerialState>` 设备单例，
//! 因此前端工具与 Python 脚本操作的是同一物理设备（不绕过主进程）。
//!
//! 仅监听 `127.0.0.1`，由「Python 产测工具」页手动启停、端口可配（默认 8765）。

pub mod commands;
pub mod dto;
pub mod routes;
pub mod runner;
pub mod state;
