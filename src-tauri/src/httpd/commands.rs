//! 控制内嵌 HTTP 服务的 3 个 Tauri 命令：启动 / 停止 / 查询状态。
//!
//! 服务在工具页手动启停、端口可配（默认 8765）。启动时在当前 async 上下文里先 `bind`，
//! 这样端口占用（EADDRINUSE）等错误能同步返回给前端；随后 spawn 后台任务跑 axum，
//! 用 `oneshot` 做 graceful shutdown，停止时 await join 确保端口释放后才返回。

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::ch347::Ch347State;
use crate::serial::SerialState;

use super::routes::router;
use super::state::{AppState, PytestServerState, RunningServer};

/// 服务状态（启停命令的返回 + 状态查询）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PytestServerStatus {
    pub running: bool,
    pub port: Option<u16>,
}

/// 默认监听端口。
const DEFAULT_PORT: u16 = 8765;

/// 启动 HTTP 服务。已在运行则报错。仅监听 `127.0.0.1`。
#[tauri::command]
pub async fn pytest_server_start(
    app: AppHandle,
    server: State<'_, PytestServerState>,
    ch347: State<'_, Arc<Ch347State>>,
    serial: State<'_, Arc<SerialState>>,
    port: Option<u16>,
) -> Result<PytestServerStatus, String> {
    if server.is_running() {
        return Err("服务已在运行".into());
    }
    let port = port.unwrap_or(DEFAULT_PORT);

    let app_state = AppState {
        ch347: ch347.inner().clone(),
        serial: serial.inner().clone(),
        app: app.clone(),
    };

    // 先 bind（await），让端口占用等错误同步返回。
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| format!("绑定 127.0.0.1:{port} 失败: {e}"))?;

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    let app_router = router(app_state);
    let join = tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, app_router)
            .with_graceful_shutdown(async move {
                let _ = rx.await;
            })
            .await;
    });

    server.set_running(RunningServer {
        shutdown: tx,
        join,
        port,
    });
    log::info!("pytest HTTP server started on 127.0.0.1:{port}");
    Ok(PytestServerStatus {
        running: true,
        port: Some(port),
    })
}

/// 停止 HTTP 服务（幂等）。发关停信号并等待任务结束，确保端口释放。
#[tauri::command]
pub async fn pytest_server_stop(
    server: State<'_, PytestServerState>,
) -> Result<PytestServerStatus, String> {
    if let Some(r) = server.take_running() {
        let _ = r.shutdown.send(());
        let _ = r.join.await;
        log::info!("pytest HTTP server stopped");
    }
    Ok(PytestServerStatus {
        running: false,
        port: None,
    })
}

/// 查询当前服务状态。
#[tauri::command]
pub fn pytest_server_status(server: State<'_, PytestServerState>) -> PytestServerStatus {
    PytestServerStatus {
        running: server.is_running(),
        port: server.port(),
    }
}
