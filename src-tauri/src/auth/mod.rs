//! 100ask.net OAuth2 登录（Authorization Code + PKCE 流程）。
//!
//! 桌面端登录流程：
//! 1. 前端调用 `auth_login_start` → 本模块起一个仅监听 `127.0.0.1` 的 axum 回调服务，
//!    生成随机 state（防 CSRF）与 PKCE 密钥对（challenge 进授权 URL、verifier 留本机），
//!    构造授权地址并用 `open` 调起系统浏览器。
//! 2. 用户在浏览器完成 100ask.net 登录授权后，浏览器回跳到本机回调地址。
//! 3. 回调 handler 校验 state → 用 code + code_verifier 换 access_token（无需 client_secret）
//!    → 取用户信息 → 存会话 → emit `auth-login-result` 事件给前端 → 关停回调服务。
//! 4. 前端监听 `auth-login-result` 事件更新登录态；`auth_get_user` 查询当前会话；
//!    `auth_logout` 登出；`auth_cancel_login` 取消进行中的登录。
//!
//! client_id 固定 `100ask-desktop`，PKCE（S256）保证无需 client_secret 即可安全换 token，
//! 用户点登录直接跳浏览器，无需填写任何配置。详见 [`config`]。
//!
//! 参考文档：`docs/100ask-oauth-rust-example.md`。

pub mod commands;
pub mod config;
pub mod server;
pub mod state;
