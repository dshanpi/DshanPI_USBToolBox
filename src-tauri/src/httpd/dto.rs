//! HTTP 服务的请求/响应 DTO、字节 hex 编解码与统一错误类型。
//!
//! 约定：所有字节数组在 JSON 中用 **hex 字符串**表示（如 `"a1b2c3"`），紧凑无歧义，
//! Python 侧 `bytes.fromhex()` / `.hex()` 即可互转。错误统一返回 `{ "error": "..." }`。

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::{Deserialize, Serialize};

// ─── 字节 hex 编解码 ───────────────────────────────────────

/// 字节数组 → 小写 hex 字符串。
pub fn hex_encode(b: &[u8]) -> String {
    hex::encode(b)
}

/// hex 字符串 → 字节数组（容错：忽略空格、冒号、`0x` 前缀）。
pub fn hex_decode(s: &str) -> Result<Vec<u8>, ApiError> {
    let cleaned: String = s
        .replace("0x", "")
        .replace("0X", "")
        .chars()
        .filter(|c| !c.is_whitespace() && *c != ',' && *c != ':')
        .collect();
    hex::decode(&cleaned).map_err(|e| ApiError::bad_request(format!("invalid hex: {e}")))
}

// ─── 统一错误 ─────────────────────────────────────────────

/// HTTP 错误：携带状态码 + 文案，序列化为 `{ "error": "..." }`。
pub struct ApiError {
    pub status: StatusCode,
    pub msg: String,
}

impl ApiError {
    pub fn bad_request(m: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            msg: m.into(),
        }
    }
    pub fn internal(m: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            msg: m.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(serde_json::json!({ "error": self.msg }))).into_response()
    }
}

// ─── 通用响应 ─────────────────────────────────────────────

#[derive(Serialize)]
pub struct OkResp {
    pub ok: bool,
}
impl OkResp {
    pub fn ok() -> Self {
        Self { ok: true }
    }
}

#[derive(Serialize)]
pub struct BytesResp {
    /// hex 字符串
    pub data: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResp {
    pub status: &'static str,
    pub ch347_available: bool,
}

#[derive(Serialize)]
pub struct ScanResp {
    pub addresses: Vec<u32>,
}

// ─── CH347 请求 ───────────────────────────────────────────

#[derive(Deserialize)]
pub struct IndexReq {
    pub index: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpiInitReq {
    pub index: u32,
    pub mode: Option<u8>,
    pub speed_mhz: Option<u32>,
    pub frequency_hz: Option<u32>,
    pub cs: Option<u32>,
    pub data_bits: Option<u8>,
    pub byte_order: Option<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpiTransferReq {
    pub index: u32,
    /// hex 字符串
    pub tx_data: String,
    pub cs: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpiReadReq {
    pub index: u32,
    pub read_len: u32,
    pub cs: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct I2cTransferReq {
    pub index: u32,
    /// hex 字符串
    pub write_data: String,
    pub read_len: u32,
    pub speed_khz: Option<u32>,
    pub scl_stretch: Option<bool>,
    pub delay_ms: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct I2cScanReq {
    pub index: u32,
    pub speed_khz: Option<u32>,
    pub scl_stretch: Option<bool>,
    pub delay_ms: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpioSetReq {
    pub index: u32,
    pub enable: u8,
    pub dir_out: u8,
    pub data_out: u8,
}

// ─── 串口请求 ─────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialOpenReq {
    pub port: String,
    pub baud_rate: u32,
    pub data_bits: Option<u8>,
    pub stop_bits: Option<u8>,
    pub parity: Option<String>,
    pub flow_control: Option<String>,
}

#[derive(Deserialize)]
pub struct SerialPortReq {
    pub port: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialWriteReq {
    pub port: String,
    /// hex 字符串
    pub data: String,
}

#[derive(Deserialize)]
pub struct SerialReadQuery {
    pub port: String,
    pub max: Option<usize>,
}
