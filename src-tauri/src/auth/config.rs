//! 100ask.net OAuth2 配置与 HTTP 交互（PKCE 流程）。
//!
//! 实现 Authorization Code + PKCE 流程：
//! 1. [`generate_pkce`]：生成 `code_verifier` 与 `code_challenge`（S256）；
//! 2. [`exchange_code`]：用授权码 code + `code_verifier` 换 access_token（**无需 client_secret**）；
//! 3. [`fetch_userinfo`]：用 access_token 取用户信息。
//!
//! `client_id` 固定为 `100ask-desktop`（100ask.net 服务端为桌面端注册的公开客户端），
//! 用户点登录直接跳浏览器，无需填写任何配置。PKCE 保证了即便授权码被截获，没有
//! `code_verifier` 也无法换 token，因此桌面端不需要 secret。
//!
//! > 服务端规范要点（来自 100ask.net）：
//! > - 每次登录重新生成 `state` 和 `code_verifier`；
//! > - `redirect_uri` 指向用户本机（127.0.0.1），授权阶段与换 token 阶段必须完全一致；
//! > - 不要内置、不要传 `client_secret`；
//! > - 用户须在 100ask.net 有已验证邮箱，否则服务端要求绑定/验证邮箱。

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

/// 固定的客户端 ID（100ask.net 为桌面端注册的公开客户端）。
const CLIENT_ID: &str = "100ask-desktop";
/// 默认回调地址（用户本机）。启动登录前软件会先监听此地址。
const DEFAULT_REDIRECT_URI: &str = "http://127.0.0.1:48931/auth/100ask/callback";

/// OAuth2 配置（廉价可 clone）。
#[derive(Clone)]
pub struct OAuthConfig {
    /// 客户端 ID（固定 `100ask-desktop`）。
    pub client_id: String,
    /// 回调地址，如 `http://127.0.0.1:48931/auth/100ask/callback`。
    /// 必须与 100ask.net 服务端 RedirectHosts 注册的一致。
    pub redirect_uri: String,
    /// 授权地址。
    pub authorize_url: String,
    /// 换 token 地址。
    pub token_url: String,
    /// 取用户信息地址。
    pub userinfo_url: String,
}

impl OAuthConfig {
    /// 构造配置。client_id 固定 `100ask-desktop`；回调地址默认
    /// [`DEFAULT_REDIRECT_URI`]，开发期可用环境变量 `ASK100_REDIRECT_URI` 覆盖。
    pub fn new() -> Self {
        Self {
            client_id: CLIENT_ID.into(),
            redirect_uri: std::env::var("ASK100_REDIRECT_URI")
                .unwrap_or_else(|_| DEFAULT_REDIRECT_URI.into()),
            authorize_url: "https://www.100ask.net/api/oauth/authorize".into(),
            token_url: "https://www.100ask.net/api/oauth/token".into(),
            userinfo_url: "https://www.100ask.net/api/oauth/userinfo".into(),
        }
    }

    /// 从 redirect_uri 解析出本机监听的 `(host, port)`，用于 bind 回调服务。
    ///
    /// 回调服务只监听本机，host 通常是 `127.0.0.1` 或 `localhost`。
    pub fn bind_addr(&self) -> Result<(String, u16), String> {
        let url = Url::parse(&self.redirect_uri).map_err(|e| format!("redirect_uri 非法: {e}"))?;
        let host = url.host_str().ok_or("redirect_uri 缺少 host")?.to_string();
        let port = url.port().ok_or("redirect_uri 缺少 port")?;
        Ok((host, port))
    }

    /// 构造授权地址（带 `response_type=code`、`code_challenge`、`code_challenge_method=S256` 等）。
    ///
    /// `state` 为随机串（防 CSRF）；`code_challenge` 为 PKCE 挑战值。
    pub fn build_authorize_url(&self, state: &str, code_challenge: &str) -> Result<String, String> {
        let mut url =
            Url::parse(&self.authorize_url).map_err(|e| format!("authorize_url 非法: {e}"))?;
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", &self.client_id)
            .append_pair("redirect_uri", &self.redirect_uri)
            .append_pair("scope", "profile email")
            .append_pair("state", state)
            .append_pair("code_challenge", code_challenge)
            .append_pair("code_challenge_method", "S256");
        Ok(url.to_string())
    }
}

/// PKCE 密钥对。
///
/// `verifier` 在换 token 时发回服务端校验；`challenge` 在授权 URL 中发出。
/// `verifier` 必须保密在本机会话里，不能随授权 URL 泄露。
pub struct PkcePair {
    /// code_verifier：长度 43-128，字符集 `A-Z a-z 0-9 - . _ ~`。
    pub verifier: String,
    /// code_challenge = BASE64URL_NO_PADDING(SHA256(code_verifier))。
    pub challenge: String,
}

/// 生成 PKCE 密钥对（每次登录重新生成）。
///
/// - verifier：随机 64 个字符（落在 43-128 区间），字符集 `A-Za-z0-9-._~`；
/// - challenge：`BASE64URL_NO_PADDING(SHA256(verifier))`。
pub fn generate_pkce() -> PkcePair {
    use rand::Rng;
    // RFC 7636 允许的 unreserved 字符集：A-Z a-z 0-9 - . _ ~
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::thread_rng();
    let verifier: String = (0..64)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect();

    // challenge = BASE64URL_NO_PADDING(SHA256(verifier))
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let digest = hasher.finalize();
    let challenge = URL_SAFE_NO_PAD.encode(digest);

    PkcePair {
        verifier,
        challenge,
    }
}

/// token 响应（100ask.net `/api/oauth/token` 返回）。
///
/// `token_type`/`scope` 当前未使用，保留以完整反映接口响应。
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub scope: Option<String>,
}

/// 用户信息（100ask.net `/api/oauth/userinfo` 返回）。
///
/// 100ask.net 接口返回 snake_case 字段（`avatar_url` / `email_verified`），
/// 这里用 `rename_all = "camelCase"` 序列化为前端友好的 camelCase，同时用 `alias`
/// 兼容反序列化 snake_case 响应。
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub name: String,
    pub email: String,
    /// 是否已验证邮箱（反序列化兼容 `email_verified`）。
    #[serde(alias = "email_verified")]
    pub email_verified: bool,
    /// 头像地址（反序列化兼容 `avatar_url`）。
    #[serde(alias = "avatar_url")]
    pub avatar_url: String,
}

/// 登录会话（后端持有，含 access_token）。
///
/// 前端只通过 [`UserInfo`] 拿到展示用的用户信息，access_token 留在后端不外泄。
/// `access_token`/`expires_in` 预留给后续调用受保护接口与判断过期。
#[allow(dead_code)]
pub struct Session {
    /// 用户信息。
    pub user: UserInfo,
    /// 访问令牌（后端持有，调用受保护接口时用）。
    pub access_token: String,
    /// token 有效期（秒）。
    pub expires_in: i64,
}

/// 用授权码 code 换 access_token（PKCE：带 `code_verifier`，**不传 client_secret**）。
///
/// 向 token 端点 POST `application/x-www-form-urlencoded` 表单。
/// `redirect_uri` 必须与授权阶段完全一致。
pub async fn exchange_code(
    http: &reqwest::Client,
    cfg: &OAuthConfig,
    code: &str,
    code_verifier: &str,
) -> Result<TokenResponse, String> {
    let resp = http
        .post(&cfg.token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", cfg.client_id.as_str()),
            ("code", code),
            ("redirect_uri", cfg.redirect_uri.as_str()),
            ("code_verifier", code_verifier),
        ])
        .send()
        .await
        .map_err(|e| format!("换 token 请求失败: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("换 token 失败: {body}"));
    }
    resp.json::<TokenResponse>()
        .await
        .map_err(|e| format!("解析 token 响应失败: {e}"))
}

/// 用 access_token 取用户信息。
///
/// 向 userinfo 端点 GET，带 `Authorization: Bearer <token>`。
pub async fn fetch_userinfo(
    http: &reqwest::Client,
    cfg: &OAuthConfig,
    access_token: &str,
) -> Result<UserInfo, String> {
    let resp = http
        .get(&cfg.userinfo_url)
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {access_token}"),
        )
        .send()
        .await
        .map_err(|e| format!("取用户信息请求失败: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("取用户信息失败: {body}"));
    }
    resp.json::<UserInfo>()
        .await
        .map_err(|e| format!("解析用户信息失败: {e}"))
}

/// 生成指定长度的随机字母数字串，用作 OAuth state（防 CSRF）。
pub fn random_string(len: usize) -> String {
    use rand::Rng;
    rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}
