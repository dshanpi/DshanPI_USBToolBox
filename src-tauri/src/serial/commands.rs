use serialport::{DataBits, FlowControl, Parity, StopBits};
use std::collections::VecDeque;
use std::io::Write;
use std::sync::Arc;
use tauri::{command, AppHandle, State};

use crate::serial::{spawn_read_thread, SerialPortHandle, SerialState};

/// Information about an available serial port.
#[derive(Clone, serde::Serialize)]
pub struct SerialPortInfo {
    pub name: String,
    pub vid: u16,
    pub pid: u16,
    pub manufacturer: String,
    pub description: String,
    pub serial_number: String,
}

fn parse_data_bits(n: u8) -> DataBits {
    match n {
        5 => DataBits::Five,
        6 => DataBits::Six,
        7 => DataBits::Seven,
        _ => DataBits::Eight,
    }
}

fn parse_stop_bits(n: u8) -> StopBits {
    if n >= 2 {
        StopBits::Two
    } else {
        StopBits::One
    }
}

fn parse_parity(s: &str) -> Parity {
    match s.to_lowercase().as_str() {
        "odd" => Parity::Odd,
        "even" => Parity::Even,
        _ => Parity::None,
    }
}

fn parse_flow_control(s: &str) -> FlowControl {
    match s.to_lowercase().as_str() {
        "rts_cts" | "hardware" => FlowControl::Hardware,
        "xon_xoff" | "software" => FlowControl::Software,
        _ => FlowControl::None,
    }
}

/// List all available serial ports.
#[command]
pub async fn serial_list_ports() -> Vec<SerialPortInfo> {
    match tauri::async_runtime::spawn_blocking(serial_list_ports_core).await {
        Ok(ports) => ports,
        Err(error) => {
            log::error!("Serial port scan task failed: {error}");
            Vec::new()
        }
    }
}

pub fn serial_list_ports_core() -> Vec<SerialPortInfo> {
    match serialport::available_ports() {
        Ok(ports) => {
            log::info!("serial_list_ports: found {} port(s)", ports.len());
            ports
                .into_iter()
                .map(|p| {
                    let (vid, pid, manufacturer, description, serial_number) = match p.port_type {
                        serialport::SerialPortType::UsbPort(info) => (
                            info.vid,
                            info.pid,
                            info.manufacturer.unwrap_or_default(),
                            info.product.unwrap_or_default(),
                            info.serial_number.unwrap_or_default(),
                        ),
                        _ => (0u16, 0u16, String::new(), String::new(), String::new()),
                    };
                    log::info!("  port: {} (vid={:04x}, pid={:04x})", p.port_name, vid, pid);
                    SerialPortInfo {
                        name: p.port_name,
                        vid,
                        pid,
                        manufacturer,
                        description,
                        serial_number,
                    }
                })
                .collect()
        }
        Err(e) => {
            log::error!("serial_list_ports failed: {}", e);
            vec![]
        }
    }
}

/// Open a serial port with the given configuration.
#[command]
#[allow(clippy::too_many_arguments)]
pub fn serial_open(
    port: String,
    baud_rate: u32,
    data_bits: u8,
    stop_bits: u8,
    parity: String,
    flow_control: String,
    state: State<'_, Arc<SerialState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    serial_open_core(
        &state,
        app_handle,
        port,
        baud_rate,
        data_bits,
        stop_bits,
        parity,
        flow_control,
    )
}

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
/// `app` 用于读线程 emit `serial-data-received` 事件——HTTP 发起的 open 同样会推送到前端。
#[allow(clippy::too_many_arguments)]
pub fn serial_open_core(
    state: &SerialState,
    app: AppHandle,
    port: String,
    baud_rate: u32,
    data_bits: u8,
    stop_bits: u8,
    parity: String,
    flow_control: String,
) -> Result<(), String> {
    // Check if already open
    {
        let ports = state
            .ports
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        if ports.contains_key(&port) {
            return Err(format!("Port {} is already open", port));
        }
    }

    log::info!(
        "serial_open: port={}, baud={}, data={}, stop={}, parity={}, flow={}",
        port,
        baud_rate,
        data_bits,
        stop_bits,
        parity,
        flow_control
    );

    let port_handle = serialport::new(&port, baud_rate)
        .data_bits(parse_data_bits(data_bits))
        .stop_bits(parse_stop_bits(stop_bits))
        .parity(parse_parity(&parity))
        .flow_control(parse_flow_control(&flow_control))
        .timeout(std::time::Duration::from_millis(20))
        .open()
        .map_err(|e| {
            log::error!("serial_open failed for {}: {}", port, e);
            let msg = e.to_string().to_lowercase();
            if msg.contains("access")
                || msg.contains("denied")
                || msg.contains("refused")
                || msg.contains("permission")
                || msg.contains("拒绝")
            {
                format!("PORT_BUSY:{}", port)
            } else if msg.contains("not found")
                || msg.contains("不存在")
                || msg.contains("does not exist")
            {
                format!("PORT_GONE:{}", port)
            } else {
                format!("PORT_ERROR:{}:{}", port, e)
            }
        })?;

    let port_name = port.clone();
    let shared_port = Arc::new(std::sync::Mutex::new(port_handle));
    let stop_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let read_buffer = Arc::new(std::sync::Mutex::new(VecDeque::<u8>::new()));

    let read_handle = spawn_read_thread(
        port_name.clone(),
        shared_port.clone(),
        stop_flag.clone(),
        read_buffer.clone(),
        app,
    );

    let handle = SerialPortHandle {
        port: shared_port,
        read_thread: Some(read_handle),
        stop_flag,
        read_buffer,
    };

    let mut ports = state
        .ports
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    ports.insert(port_name, handle);
    log::info!("Serial port {} opened", port);
    Ok(())
}

/// Close an open serial port.
#[command]
pub fn serial_close(port: String, state: State<'_, Arc<SerialState>>) -> Result<(), String> {
    serial_close_core(&state, &port)
}

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
pub fn serial_close_core(state: &SerialState, port: &str) -> Result<(), String> {
    let mut ports = state
        .ports
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    if let Some(mut handle) = ports.remove(port) {
        handle
            .stop_flag
            .store(true, std::sync::atomic::Ordering::Relaxed);
        if let Some(thread) = handle.read_thread.take() {
            let _ = thread.join();
        }
        log::info!("Serial port {} closed", port);
        Ok(())
    } else {
        Err(format!("Port {} is not open", port))
    }
}

/// Write data to an open serial port.
#[command]
pub fn serial_write(
    port: String,
    data: Vec<u8>,
    state: State<'_, Arc<SerialState>>,
) -> Result<(), String> {
    serial_write_core(&state, &port, &data)
}

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
pub fn serial_write_core(state: &SerialState, port: &str, data: &[u8]) -> Result<(), String> {
    let ports = state
        .ports
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    if let Some(handle) = ports.get(port) {
        let mut port_guard = handle
            .port
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        port_guard.write_all(data).map_err(|e| {
            log::error!("serial_write failed for {}: {}", port, e);
            format!("Write error: {}", e)
        })?;
        port_guard
            .flush()
            .map_err(|e| format!("Flush error: {}", e))?;
        Ok(())
    } else {
        Err(format!("Port {} is not open", port))
    }
}

/// Drain up to `max` bytes from the REST read buffer of an open port (HTTP-only).
/// 前端串口工具走事件路径，不使用此函数。
pub fn serial_read_core(state: &SerialState, port: &str, max: usize) -> Result<Vec<u8>, String> {
    let ports = state
        .ports
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    let handle = ports
        .get(port)
        .ok_or_else(|| format!("Port {} is not open", port))?;
    let mut rb = handle
        .read_buffer
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    let take = rb.len().min(max);
    Ok(rb.drain(0..take).collect())
}

/// Check if a serial port is currently open.
#[command]
pub fn serial_is_open(port: String, state: State<'_, Arc<SerialState>>) -> bool {
    serial_is_open_core(&state, &port)
}

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
pub fn serial_is_open_core(state: &SerialState, port: &str) -> bool {
    let ports = match state.ports.lock() {
        Ok(p) => p,
        Err(_) => return false,
    };
    ports.contains_key(port)
}
