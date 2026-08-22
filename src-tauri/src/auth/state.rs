//! 登录共享状态。
//!
//! [`AuthState`] 由 Tauri 托管为 `Arc<AuthState>` 单例，跨命令与 axum 回调 handler 共享，
//! 持有：OAuth 配置、复用的 HTTP 客户端、待处理的 state（防 CSRF + 关联回调）、当前会话、
//! 以及运行中的回调服务句柄（用于回调完成或取消时关停）。

use std::sync::{Arc, Mutex};

use tauri::async_runtime::JoinHandle;
use tokio::sync::oneshot;

use super::config::{OAuthConfig, Session, UserInfo};

/// 待处理的一次登录（持有随机 state 与 PKCE code_verifier，等回调回来校验）。
pub struct PendingLogin {
    /// 随机 state 串，与授权 URL 中带出的一致（防 CSRF）。
    pub state: String,
    /// PKCE code_verifier，换 token 时发回服务端校验。必须保密在本机会话。
    pub code_verifier: String,
}

/// 运行中的回调服务（关停信号 + 任务句柄）。
///
/// `shutdown` 用 `Arc<Mutex<Option<Sender>>>` 包裹，便于回调 handler 在收到回调后
/// 主动触发关停，也便于 `auth_cancel_login` 取消登录时关停。
pub struct RunningAuthServer {
    pub shutdown: Arc<Mutex<Option<oneshot::Sender<()>>>>,
    pub join: JoinHandle<()>,
}

/// 登录模块状态（Tauri 托管单例）。
pub struct AuthState {
    /// OAuth 配置（从环境变量读取）。
    pub oauth: OAuthConfig,
    /// 复用的 HTTP 客户端（换 token / 取用户信息）。
    pub http: reqwest::Client,
    /// 待处理的登录（启动登录时写入，回调时校验并清空）。
    pending: Mutex<Option<PendingLogin>>,
    /// 当前会话（登录成功后写入）。
    session: Mutex<Option<Session>>,
    /// 运行中的回调服务句柄（登录进行中存在）。
    server: Mutex<Option<RunningAuthServer>>,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            oauth: OAuthConfig::new(),
            http: reqwest::Client::new(),
            pending: Mutex::new(None),
            session: Mutex::new(None),
            server: Mutex::new(None),
        }
    }

    /// 是否有登录正在进行（有待处理 state 或回调服务在跑）。
    pub fn is_login_pending(&self) -> bool {
        self.pending.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    /// 写入待处理 state（启动登录时调用）。
    pub fn set_pending(&self, pending: PendingLogin) {
        if let Ok(mut g) = self.pending.lock() {
            *g = Some(pending);
        }
    }

    /// 取出并清空待处理 state（回调时校验用）。
    pub fn take_pending(&self) -> Option<PendingLogin> {
        self.pending.lock().ok().and_then(|mut g| g.take())
    }

    /// 写入会话（登录成功时调用）。
    pub fn set_session(&self, session: Session) {
        if let Ok(mut g) = self.session.lock() {
            *g = Some(session);
        }
    }

    /// 取当前登录用户的展示信息（不含 access_token）。
    pub fn get_user(&self) -> Option<UserInfo> {
        self.session
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|s| s.user.clone()))
    }

    /// 清空会话（登出时调用）。
    pub fn clear_session(&self) {
        if let Ok(mut g) = self.session.lock() {
            *g = None;
        }
    }

    /// 记录运行中的回调服务。
    pub fn set_server(&self, server: RunningAuthServer) {
        if let Ok(mut g) = self.server.lock() {
            *g = Some(server);
        }
    }

    /// 取出并关停回调服务（取消登录 / 登录结束清理时调用）。
    ///
    /// 发送关停信号并返回任务句柄，调用方负责 `await` join 确保端口释放。
    pub fn take_server(&self) -> Option<RunningAuthServer> {
        self.server.lock().ok().and_then(|mut g| g.take())
    }
}

impl Default for AuthState {
    fn default() -> Self {
        Self::new()
    }
}
