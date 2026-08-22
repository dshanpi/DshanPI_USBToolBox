//! 100ask.net OAuth2 登录的 Tauri 命令。
//!
//! - [`auth_login_start`]：生成 state → 起本机回调服务 → 打开浏览器授权。命令本身立即返回，
//!   登录结果经 `auth-login-result` 事件异步回传前端（回调服务在收到回跳后自动关停）。
//! - [`auth_get_user`]：查询当前登录用户（未登录返回 null）。
//! - [`auth_logout`]：登出，清空会话。
//! - [`auth_cancel_login`]：取消进行中的登录，关停回调服务。

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;

use super::config::{generate_pkce, random_string, UserInfo};
use super::server::{router, CallbackState, LoginResultEvent};
use super::state::{AuthState, RunningAuthServer};

/// 登录超时（回调服务最长存活时间）。
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

/// `auth_login_start` 返回值。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStartResult {
    /// 回调服务监听端口。
    pub port: u16,
    /// 回调地址（与 100ask.net 注册一致）。
    pub redirect_uri: String,
    /// 授权地址（已带参数，打开浏览器的 URL）。
    pub authorize_url: String,
}

/// 启动登录：起本机回调服务 + 打开浏览器（PKCE 流程）。
///
/// client_id 固定 `100ask-desktop`，无需 client_secret。每次登录重新生成 state 与 PKCE
/// 密钥对：challenge 放进授权 URL，verifier 留在本机会话供换 token 校验。
/// 命令立即返回，登录结果经 `auth-login-result` 事件回传。
#[tauri::command]
pub async fn auth_login_start(
    app: AppHandle,
    state: State<'_, Arc<AuthState>>,
) -> Result<LoginStartResult, String> {
    if state.is_login_pending() {
        return Err("已有登录正在进行".into());
    }

    let cfg = &state.oauth;

    // 生成 state（防 CSRF）与 PKCE 密钥对（每次登录重新生成）。
    let oauth_state = random_string(32);
    let pkce = generate_pkce();
    state.set_pending(super::state::PendingLogin {
        state: oauth_state.clone(),
        code_verifier: pkce.verifier,
    });

    // 解析回调监听地址并 bind（端口占用等错误同步返回）。
    let (host, port) = cfg.bind_addr()?;
    let listener = tokio::net::TcpListener::bind((host.as_str(), port))
        .await
        .map_err(|e| format!("绑定回调服务 {host}:{port} 失败: {e}"))?;

    // 关停信号：回调 handler / 取消 / 超时任一方 take 后发送，触发 axum graceful shutdown。
    let (tx, rx) = oneshot::channel::<()>();
    let shutdown = Arc::new(Mutex::new(Some(tx)));

    let cs = CallbackState {
        auth: state.inner().clone(),
        app: app.clone(),
    };
    let app_router = router(cs);

    let join = tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, app_router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
    });

    state.set_server(RunningAuthServer {
        shutdown: shutdown.clone(),
        join,
    });

    // 构造授权地址（带 code_challenge / code_challenge_method=S256）并打开浏览器。
    let authorize_url = cfg.build_authorize_url(&oauth_state, &pkce.challenge)?;
    if let Err(e) = open::that(&authorize_url) {
        // 打开浏览器失败：关停刚起的服务并清理，回退到未登录状态。
        log::error!("打开浏览器失败: {e}");
        cleanup_server(&state).await;
        state.take_pending();
        return Err(format!("打开浏览器失败: {e}"));
    }

    // 登录超时守护：到点若回调服务仍在跑，emit 超时事件并关停。
    let auth_clone = state.inner().clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(LOGIN_TIMEOUT).await;
        // 回调已成功时会 take_server 清空入口，此时返回 None，不误报超时。
        if let Some(srv) = auth_clone.take_server() {
            let _ = app_clone.emit(
                "auth-login-result",
                LoginResultEvent {
                    success: false,
                    user: None,
                    error: Some("登录超时，请重试".into()),
                },
            );
            if let Some(tx) = srv.shutdown.lock().ok().and_then(|mut g| g.take()) {
                let _ = tx.send(());
            }
            let _ = srv.join.await;
            auth_clone.take_pending();
            log::warn!("100ask.net 登录超时，已关停回调服务");
        }
    });

    log::info!("100ask.net 登录已启动，回调服务监听 {host}:{port}");
    Ok(LoginStartResult {
        port,
        redirect_uri: cfg.redirect_uri.clone(),
        authorize_url,
    })
}

/// 查询当前登录用户（未登录返回 null）。
#[tauri::command]
pub fn auth_get_user(state: State<'_, Arc<AuthState>>) -> Option<UserInfo> {
    state.get_user()
}

/// 登出：清空会话。
#[tauri::command]
pub fn auth_logout(state: State<'_, Arc<AuthState>>) -> Result<(), String> {
    state.clear_session();
    log::info!("100ask.net 已登出");
    Ok(())
}

/// 取消进行中的登录：清 pending + 关停回调服务。
#[tauri::command]
pub async fn auth_cancel_login(state: State<'_, Arc<AuthState>>) -> Result<(), String> {
    state.take_pending();
    cleanup_server(&state).await;
    log::info!("100ask.net 登录已取消");
    Ok(())
}

/// 关停运行中的回调服务（取出发送关停信号并等待任务结束，确保端口释放）。
async fn cleanup_server(state: &State<'_, Arc<AuthState>>) {
    if let Some(srv) = state.take_server() {
        if let Some(tx) = srv.shutdown.lock().ok().and_then(|mut g| g.take()) {
            let _ = tx.send(());
        }
        let _ = srv.join.await;
    }
}
