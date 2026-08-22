//! OAuth2 回调服务（axum）。
//!
//! 仅在登录流程进行期间监听 `127.0.0.1:<port>/auth/100ask/callback`，接收 100ask.net
//! 回跳的授权码。handler 校验 state（防 CSRF）→ 换 token → 取用户信息 → 存会话 →
//! emit `auth-login-result` 事件给前端 → 触发自身关停。
//!
//! 关停信号存在 [`AuthState`] 的运行句柄里（`Arc<Mutex<Option<Sender>>>`）：
//! 回调 handler 处理完后通过 `take_server` 取出发送；`auth_cancel_login` / 登录超时
//! 任务也走同一入口，互斥取走，避免重复关停或超时误报。

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    response::Html,
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::config::{exchange_code, fetch_userinfo, UserInfo};
use super::state::AuthState;

/// `auth-login-result` 事件载荷。
///
/// 登录成功时 `success=true` 且带 `user`；失败时 `success=false` 且带 `error`。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LoginResultEvent {
    pub success: bool,
    pub user: Option<UserInfo>,
    pub error: Option<String>,
}

/// 回调查询参数。
///
/// `code`/`state` 为正常授权回调；`error` 为用户拒绝授权等错误回调。
#[derive(Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// 回调 handler 的共享上下文（廉价可 clone）。
#[derive(Clone)]
pub struct CallbackState {
    /// 登录状态单例（校验 state、存会话、关停回调服务；持有内置 OAuth 配置）。
    pub auth: Arc<AuthState>,
    /// 用于 emit `auth-login-result` 事件。
    pub app: AppHandle,
}

/// 构造回调路由。
pub fn router(cs: CallbackState) -> Router {
    Router::new()
        .route("/auth/100ask/callback", get(callback_handler))
        .with_state(cs)
}

/// 回调 handler：校验 → 换 token → 取用户信息 → 存会话 → emit → 关停。
async fn callback_handler(
    State(cs): State<CallbackState>,
    Query(q): Query<CallbackQuery>,
) -> Html<String> {
    let result = handle_callback(&cs, q).await;

    let _ = cs.app.emit("auth-login-result", result.clone());

    // 处理完即关停回调服务：take_server 同时清空 AuthState 中的入口，
    // 使登录超时任务不会重复关停或误报超时。
    if let Some(srv) = cs.auth.take_server() {
        if let Some(tx) = srv.shutdown.lock().ok().and_then(|mut g| g.take()) {
            let _ = tx.send(());
        }
        // join 由 axum graceful shutdown 自行结束，此处不 await（否则会阻塞响应回写）。
    }

    render_result_page(&result)
}

/// 实际处理回调，返回结果（成功带 user，失败带 error）。
async fn handle_callback(cs: &CallbackState, q: CallbackQuery) -> LoginResultEvent {
    // 用户拒绝授权等错误
    if let Some(err) = q.error {
        return LoginResultEvent {
            success: false,
            user: None,
            error: Some(format!("授权失败: {err}")),
        };
    }

    let code = match q.code {
        Some(c) if !c.is_empty() => c,
        _ => {
            return LoginResultEvent {
                success: false,
                user: None,
                error: Some("回调缺少 code 参数".into()),
            };
        }
    };

    // 校验 state（防 CSRF）：必须与启动登录时写回的 pending state 一致。
    let pending_state = match q.state {
        Some(s) => s,
        None => {
            return LoginResultEvent {
                success: false,
                user: None,
                error: Some("回调缺少 state 参数".into()),
            };
        }
    };
    let pending = cs.auth.take_pending();
    let is_valid = matches!(&pending, Some(p) if p.state == pending_state);
    if !is_valid {
        return LoginResultEvent {
            success: false,
            user: None,
            error: Some("state 校验失败（可能登录已过期或存在 CSRF）".into()),
        };
    }
    // state 校验通过，取出 PKCE code_verifier 用于换 token。
    let code_verifier = pending
        .expect("state 校验通过意味着 pending 存在")
        .code_verifier;

    // 换 token（PKCE：带 code_verifier，不传 client_secret）
    let token = match exchange_code(&cs.auth.http, &cs.auth.oauth, &code, &code_verifier).await {
        Ok(t) => t,
        Err(e) => {
            return LoginResultEvent {
                success: false,
                user: None,
                error: Some(e),
            };
        }
    };

    // 取用户信息
    let user = match fetch_userinfo(&cs.auth.http, &cs.auth.oauth, &token.access_token).await {
        Ok(u) => u,
        Err(e) => {
            return LoginResultEvent {
                success: false,
                user: None,
                error: Some(e),
            };
        }
    };

    // 存会话
    cs.auth.set_session(super::config::Session {
        user: user.clone(),
        access_token: token.access_token,
        expires_in: token.expires_in,
    });
    log::info!("100ask.net 登录成功: {} ({})", user.name, user.email);

    LoginResultEvent {
        success: true,
        user: Some(user),
        error: None,
    }
}

/// 渲染回调结果页面（浏览器里给用户看的确认页）。
fn render_result_page(result: &LoginResultEvent) -> Html<String> {
    let body = if result.success {
        let u = result.user.as_ref();
        let name = u.map(|u| u.name.as_str()).unwrap_or("");
        let email = u.map(|u| u.email.as_str()).unwrap_or("");
        format!("<h2>✅ 登录成功</h2><p>{name}（{email}）</p><p>可以关闭此页面并回到应用。</p>")
    } else {
        format!(
            "<h2>❌ 登录失败</h2><p>{}</p>",
            result.error.as_deref().unwrap_or("未知错误")
        )
    };
    Html(format!(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>登录结果</title>\
         <style>body{{font-family:sans-serif;text-align:center;margin-top:60px;}}</style></head>\
         <body>{body}</body></html>"
    ))
}
