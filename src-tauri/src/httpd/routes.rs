//! axum handler 函数 + 路由表。
//!
//! 每个 handler 解析请求 → 在 `tokio::task::spawn_blocking` 内调用对应的 `*_core`
//! 自由函数（CH347 FFI 与串口都是阻塞调用，必须放到阻塞线程池，避免堵塞 axum worker）
//! → 编码返回。错误统一映射为 `ApiError`（设备/输入错误 400，join 失败 500）。

use axum::extract::{Json, Query, State};
use axum::routing::{get, post};
use axum::Router;

use super::dto::*;
use super::state::AppState;
use crate::ch347::commands as ch;
use crate::serial::commands as sr;

/// 构造路由表，绑定共享状态。
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/devices", get(ch347_list))
        .route("/ch347/open", post(ch347_open))
        .route("/ch347/close", post(ch347_close))
        .route("/ch347/spi/init", post(spi_init))
        .route("/ch347/spi/transfer", post(spi_transfer))
        .route("/ch347/spi/write", post(spi_write))
        .route("/ch347/spi/read", post(spi_read))
        .route("/ch347/i2c/transfer", post(i2c_transfer))
        .route("/ch347/i2c/scan", post(i2c_scan))
        .route("/ch347/gpio/set", post(gpio_set))
        .route("/serial/ports", get(serial_list))
        .route("/serial/open", post(serial_open))
        .route("/serial/close", post(serial_close))
        .route("/serial/write", post(serial_write))
        .route("/serial/read", get(serial_read))
        .with_state(state)
}

/// 把 spawn_blocking 的结果展开：JoinError→500，业务 Err(String)→400。
async fn run_blocking<T, F>(f: F) -> Result<T, ApiError>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .map_err(ApiError::bad_request)
}

// ─── 健康 / 设备 ──────────────────────────────────────────

pub async fn health(State(st): State<AppState>) -> Json<HealthResp> {
    Json(HealthResp {
        status: "ok",
        ch347_available: st.ch347.is_available(),
    })
}

pub async fn ch347_list(
    State(st): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, ApiError> {
    let ch347 = st.ch347.clone();
    let list = tokio::task::spawn_blocking(move || ch::list_devices_core(&ch347))
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(list))
}

// ─── CH347 open / close ───────────────────────────────────

pub async fn ch347_open(
    State(st): State<AppState>,
    Json(req): Json<IndexReq>,
) -> Result<Json<OkResp>, ApiError> {
    let ch347 = st.ch347.clone();
    run_blocking(move || ch::open_core(&ch347, req.index)).await?;
    Ok(Json(OkResp::ok()))
}

pub async fn ch347_close(
    State(st): State<AppState>,
    Json(req): Json<IndexReq>,
) -> Result<Json<OkResp>, ApiError> {
    let ch347 = st.ch347.clone();
    run_blocking(move || ch::close_core(&ch347, req.index)).await?;
    Ok(Json(OkResp::ok()))
}

// ─── CH347 SPI ────────────────────────────────────────────

pub async fn spi_init(
    State(st): State<AppState>,
    Json(req): Json<SpiInitReq>,
) -> Result<Json<OkResp>, ApiError> {
    let ch347 = st.ch347.clone();
    run_blocking(move || {
        ch::spi_init_core(
            &ch347,
            req.index,
            req.mode,
            req.speed_mhz,
            req.frequency_hz,
            req.cs,
            req.data_bits,
            req.byte_order,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
    })
    .await?;
    Ok(Json(OkResp::ok()))
}

pub async fn spi_transfer(
    State(st): State<AppState>,
    Json(req): Json<SpiTransferReq>,
) -> Result<Json<BytesResp>, ApiError> {
    let tx = hex_decode(&req.tx_data)?;
    let ch347 = st.ch347.clone();
    let out = run_blocking(move || ch::spi_transfer_core(&ch347, req.index, tx, req.cs)).await?;
    Ok(Json(BytesResp {
        data: hex_encode(&out),
    }))
}

pub async fn spi_write(
    State(st): State<AppState>,
    Json(req): Json<SpiTransferReq>,
) -> Result<Json<OkResp>, ApiError> {
    let tx = hex_decode(&req.tx_data)?;
    let ch347 = st.ch347.clone();
    run_blocking(move || ch::spi_write_core(&ch347, req.index, tx, req.cs)).await?;
    Ok(Json(OkResp::ok()))
}

pub async fn spi_read(
    State(st): State<AppState>,
    Json(req): Json<SpiReadReq>,
) -> Result<Json<BytesResp>, ApiError> {
    let ch347 = st.ch347.clone();
    let out =
        run_blocking(move || ch::spi_read_core(&ch347, req.index, req.read_len, req.cs)).await?;
    Ok(Json(BytesResp {
        data: hex_encode(&out),
    }))
}

// ─── CH347 I2C ────────────────────────────────────────────

pub async fn i2c_transfer(
    State(st): State<AppState>,
    Json(req): Json<I2cTransferReq>,
) -> Result<Json<BytesResp>, ApiError> {
    let wr = hex_decode(&req.write_data)?;
    let ch347 = st.ch347.clone();
    let out = run_blocking(move || {
        ch::i2c_transfer_core(
            &ch347,
            req.index,
            wr,
            req.read_len,
            req.speed_khz,
            req.scl_stretch,
            req.delay_ms,
        )
    })
    .await?;
    Ok(Json(BytesResp {
        data: hex_encode(&out),
    }))
}

pub async fn i2c_scan(
    State(st): State<AppState>,
    Json(req): Json<I2cScanReq>,
) -> Result<Json<ScanResp>, ApiError> {
    let ch347 = st.ch347.clone();
    let addresses = run_blocking(move || {
        ch::i2c_scan_core(
            &ch347,
            req.index,
            req.speed_khz,
            req.scl_stretch,
            req.delay_ms,
        )
    })
    .await?;
    Ok(Json(ScanResp { addresses }))
}

// ─── CH347 GPIO ───────────────────────────────────────────

pub async fn gpio_set(
    State(st): State<AppState>,
    Json(req): Json<GpioSetReq>,
) -> Result<Json<OkResp>, ApiError> {
    let ch347 = st.ch347.clone();
    run_blocking(move || {
        ch::gpio_set_core(&ch347, req.index, req.enable, req.dir_out, req.data_out)
    })
    .await?;
    Ok(Json(OkResp::ok()))
}

// ─── 串口 ─────────────────────────────────────────────────

pub async fn serial_list() -> Result<Json<Vec<sr::SerialPortInfo>>, ApiError> {
    let ports = tokio::task::spawn_blocking(sr::serial_list_ports_core)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(ports))
}

pub async fn serial_open(
    State(st): State<AppState>,
    Json(req): Json<SerialOpenReq>,
) -> Result<Json<OkResp>, ApiError> {
    let serial = st.serial.clone();
    let app = st.app.clone();
    run_blocking(move || {
        sr::serial_open_core(
            &serial,
            app,
            req.port,
            req.baud_rate,
            req.data_bits.unwrap_or(8),
            req.stop_bits.unwrap_or(1),
            req.parity.unwrap_or_else(|| "none".into()),
            req.flow_control.unwrap_or_else(|| "none".into()),
        )
    })
    .await?;
    Ok(Json(OkResp::ok()))
}

pub async fn serial_close(
    State(st): State<AppState>,
    Json(req): Json<SerialPortReq>,
) -> Result<Json<OkResp>, ApiError> {
    let serial = st.serial.clone();
    run_blocking(move || sr::serial_close_core(&serial, &req.port)).await?;
    Ok(Json(OkResp::ok()))
}

pub async fn serial_write(
    State(st): State<AppState>,
    Json(req): Json<SerialWriteReq>,
) -> Result<Json<OkResp>, ApiError> {
    let data = hex_decode(&req.data)?;
    let serial = st.serial.clone();
    run_blocking(move || sr::serial_write_core(&serial, &req.port, &data)).await?;
    Ok(Json(OkResp::ok()))
}

pub async fn serial_read(
    State(st): State<AppState>,
    Query(q): Query<SerialReadQuery>,
) -> Result<Json<BytesResp>, ApiError> {
    let serial = st.serial.clone();
    let max = q.max.unwrap_or(4096);
    let out = run_blocking(move || sr::serial_read_core(&serial, &q.port, max)).await?;
    Ok(Json(BytesResp {
        data: hex_encode(&out),
    }))
}
