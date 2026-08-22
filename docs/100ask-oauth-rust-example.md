# Rust 软件集成 100ask.net 浏览器登录示例

本文示例适用于“自己的软件后端是 Rust，登录时跳转浏览器到 100ask.net，用户完成登录后回到 Rust 后端”的场景。

## 100ask.net OAuth2 接口

当前官网提供 Authorization Code 流程：

- 授权地址：`https://www.100ask.net/api/oauth/authorize`
- 换 token：`https://www.100ask.net/api/oauth/token`
- 取用户信息：`https://www.100ask.net/api/oauth/userinfo`

需要在 100ask.net 服务端配置：

```yaml
OAuth2:
  ClientId: your-rust-app
  ClientSecret: change-me
  RedirectHosts: your-app.example.com,127.0.0.1,localhost
```

生产环境普通 Web 回调请使用 HTTPS。桌面软件本机回调可配置 `127.0.0.1` 或 `localhost`，允许 `http://127.0.0.1:<port>/auth/100ask/callback`。

不要把 `ClientSecret` 写进会分发给用户的客户端程序。桌面软件建议让本机 Rust 后端或你的云端后端完成 code 换 token。

## Cargo.toml

```toml
[package]
name = "oauth-100ask-demo"
version = "0.1.0"
edition = "2021"

[dependencies]
anyhow = "1"
axum = "0.7"
base64 = "0.22"
open = "5"
rand = "0.8"
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
url = "2"
```

## main.rs

```rust
use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse, Redirect},
    routing::get,
    Router,
};
use rand::{distributions::Alphanumeric, Rng};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use tokio::sync::Mutex;
use url::Url;

#[derive(Clone)]
struct AppState {
    http: Client,
    oauth: OAuthConfig,
    states: Arc<Mutex<HashMap<String, String>>>,
}

#[derive(Clone)]
struct OAuthConfig {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    authorize_url: String,
    token_url: String,
    userinfo_url: String,
}

#[derive(Debug, Deserialize)]
struct CallbackQuery {
    code: String,
    state: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    token_type: String,
    expires_in: i64,
    scope: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct UserInfo {
    id: i64,
    username: String,
    name: String,
    email: String,
    email_verified: bool,
    avatar_url: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let state = AppState {
        http: Client::new(),
        oauth: OAuthConfig {
            client_id: std::env::var("ASK100_CLIENT_ID").unwrap_or_else(|_| "your-rust-app".into()),
            client_secret: std::env::var("ASK100_CLIENT_SECRET").expect("missing ASK100_CLIENT_SECRET"),
            redirect_uri: std::env::var("ASK100_REDIRECT_URI")
                .unwrap_or_else(|_| "http://127.0.0.1:48931/auth/100ask/callback".into()),
            authorize_url: "https://www.100ask.net/api/oauth/authorize".into(),
            token_url: "https://www.100ask.net/api/oauth/token".into(),
            userinfo_url: "https://www.100ask.net/api/oauth/userinfo".into(),
        },
        states: Arc::new(Mutex::new(HashMap::new())),
    };

    let app = Router::new()
        .route("/", get(index))
        .route("/auth/100ask/start", get(start_login))
        .route("/auth/100ask/callback", get(callback))
        .with_state(state);

    let addr: SocketAddr = "127.0.0.1:48931".parse()?;
    println!("listening on http://{addr}");
    axum::serve(tokio::net::TcpListener::bind(addr).await?, app).await?;
    Ok(())
}

async fn index() -> Html<&'static str> {
    Html(r#"<a href="/auth/100ask/start">使用 100ask.net 登录</a>"#)
}

async fn start_login(State(app): State<AppState>) -> impl IntoResponse {
    let state = random_string(32);
    app.states.lock().await.insert(state.clone(), app.oauth.redirect_uri.clone());

    let mut url = Url::parse(&app.oauth.authorize_url).unwrap();
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &app.oauth.client_id)
        .append_pair("redirect_uri", &app.oauth.redirect_uri)
        .append_pair("scope", "profile email")
        .append_pair("state", &state);

    let _ = open::that(url.as_str());
    Redirect::temporary(url.as_str())
}

async fn callback(
    State(app): State<AppState>,
    Query(query): Query<CallbackQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let redirect_uri = app
        .states
        .lock()
        .await
        .remove(&query.state)
        .ok_or((StatusCode::BAD_REQUEST, "invalid state".to_string()))?;

    let token = exchange_code(&app, &query.code, &redirect_uri).await?;
    let user = fetch_userinfo(&app, &token.access_token).await?;

    // 在这里把 user.id/email 映射到你自己系统的账号，并签发你自己的 session。
    let body = format!(
        "登录成功：{} ({})<br><pre>{}</pre>",
        user.name,
        user.email,
        serde_json::to_string_pretty(&user).unwrap()
    );

    Ok(Html(body))
}

async fn exchange_code(
    app: &AppState,
    code: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, (StatusCode, String)> {
    let resp = app
        .http
        .post(&app.oauth.token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", app.oauth.client_id.as_str()),
            ("client_secret", app.oauth.client_secret.as_str()),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .await
        .map_err(internal_error)?;

    if !resp.status().is_success() {
        return Err((StatusCode::BAD_GATEWAY, resp.text().await.unwrap_or_default()));
    }
    resp.json::<TokenResponse>().await.map_err(internal_error)
}

async fn fetch_userinfo(app: &AppState, access_token: &str) -> Result<UserInfo, (StatusCode, String)> {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::AUTHORIZATION,
        format!("Bearer {access_token}").parse().map_err(internal_error)?,
    );

    let resp = app
        .http
        .get(&app.oauth.userinfo_url)
        .headers(headers)
        .send()
        .await
        .map_err(internal_error)?;

    if !resp.status().is_success() {
        return Err((StatusCode::BAD_GATEWAY, resp.text().await.unwrap_or_default()));
    }
    resp.json::<UserInfo>().await.map_err(internal_error)
}

fn random_string(len: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}

fn internal_error<E: std::fmt::Display>(err: E) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}
```

## 运行

```bash
export ASK100_CLIENT_ID=your-rust-app
export ASK100_CLIENT_SECRET='change-me'
export ASK100_REDIRECT_URI='http://127.0.0.1:48931/auth/100ask/callback'
cargo run
```

访问 `http://127.0.0.1:48931/auth/100ask/start` 后会打开浏览器；用户登录 100ask.net 并授权后，浏览器会回到 Rust 后端回调地址。

