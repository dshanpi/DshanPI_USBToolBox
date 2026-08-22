//! HTTP 服务的共享状态。
//!
//! - `AppState`：axum handler 的共享上下文，持有与 Tauri 命令**同一份** CH347/串口设备单例
//!   （通过 `Arc` 共享），以及一个 `AppHandle`（让 REST 发起的串口 open 也能 emit 前端事件）。
//! - `PytestServerState`：Tauri 托管的服务句柄，记录运行中的 axum 任务、关停信号与端口。

use std::sync::{Arc, Mutex};

use crate::ch347::Ch347State;
use crate::serial::SerialState;

/// axum handler 的共享上下文（廉价可 clone）。
#[derive(Clone)]
pub struct AppState {
    pub ch347: Arc<Ch347State>,
    pub serial: Arc<SerialState>,
    /// 用于读线程 emit `serial-data-received` —— REST 打开的端口也会推送到前端。
    pub app: tauri::AppHandle,
}

/// 运行中的服务（关停信号 + 任务句柄 + 端口）。
pub struct RunningServer {
    pub shutdown: tokio::sync::oneshot::Sender<()>,
    pub join: tauri::async_runtime::JoinHandle<()>,
    pub port: u16,
}

/// Tauri 托管的服务句柄单例。
pub struct PytestServerState {
    inner: Mutex<Option<RunningServer>>,
}

impl PytestServerState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    /// 是否正在运行。
    pub fn is_running(&self) -> bool {
        self.inner.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    /// 当前监听端口（未运行返回 None）。
    pub fn port(&self) -> Option<u16> {
        self.inner
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|r| r.port))
    }

    /// 记录新启动的服务。
    pub fn set_running(&self, server: RunningServer) {
        if let Ok(mut g) = self.inner.lock() {
            *g = Some(server);
        }
    }

    /// 取出并清空当前运行句柄（用于停止）。
    pub fn take_running(&self) -> Option<RunningServer> {
        self.inner.lock().ok().and_then(|mut g| g.take())
    }
}

impl Default for PytestServerState {
    fn default() -> Self {
        Self::new()
    }
}
