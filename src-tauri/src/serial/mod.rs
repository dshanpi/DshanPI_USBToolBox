pub mod commands;

use serialport::SerialPort;
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::{AppHandle, Emitter};

/// Shared stop flag for read threads.
pub type StopFlag = Arc<AtomicBool>;

/// REST 读取缓冲：读线程收到的字节在 emit Tauri 事件的同时也压入此环形缓冲，
/// 供 HTTP 服务的 `GET /serial/read` 端点 drain（前端串口工具仍走事件，互不影响）。
pub type ReadBuffer = Arc<Mutex<VecDeque<u8>>>;

/// REST 读缓冲上限（字节）。超出时丢弃最旧数据，避免无人 drain 时无限增长。
const READ_BUFFER_CAP: usize = 64 * 1024;

/// Handle to an open serial port with its read thread.
pub struct SerialPortHandle {
    /// Shared port for both read thread and write commands.
    pub port: Arc<Mutex<Box<dyn SerialPort>>>,
    pub read_thread: Option<JoinHandle<()>>,
    pub stop_flag: StopFlag,
    /// REST 读缓冲（由读线程填充，HTTP `serial_read_core` drain）。
    pub read_buffer: ReadBuffer,
}

impl Drop for SerialPortHandle {
    fn drop(&mut self) {
        // Signal the read thread to stop
        self.stop_flag
            .store(true, std::sync::atomic::Ordering::Relaxed);
        // Join the read thread so it releases its Arc<SerialPort> reference
        if let Some(thread) = self.read_thread.take() {
            let _ = thread.join();
        }
        // When self.port (Arc<Mutex<Box<dyn SerialPort>>>) is dropped,
        // the serial port OS handle is closed
    }
}

/// Managed state holding all open serial port connections.
pub struct SerialState {
    pub ports: Arc<Mutex<HashMap<String, SerialPortHandle>>>,
}

impl SerialState {
    pub fn new() -> Self {
        Self {
            ports: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Close all open ports — call on app shutdown
    pub fn close_all(&self) {
        if let Ok(mut ports) = self.ports.lock() {
            ports.clear();
        }
    }
}

impl Drop for SerialState {
    fn drop(&mut self) {
        self.close_all();
    }
}

/// Spawn a read thread that continuously reads from the serial port
/// and emits data via Tauri events (并同时写入 REST 读缓冲)。
pub fn spawn_read_thread(
    port_name: String,
    shared_port: Arc<Mutex<Box<dyn SerialPort>>>,
    stop_flag: StopFlag,
    read_buffer: ReadBuffer,
    app_handle: AppHandle,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buf = vec![0u8; 4096];
        loop {
            if stop_flag.load(Ordering::Relaxed) {
                break;
            }
            let result = {
                let mut port = match shared_port.lock() {
                    Ok(p) => p,
                    Err(_) => break,
                };
                port.read(&mut buf)
            };
            match result {
                Ok(n) if n > 0 => {
                    let data: Vec<u8> = buf[..n].to_vec();
                    let _ = app_handle.emit(
                        "serial-data-received",
                        SerialDataEvent {
                            port: port_name.clone(),
                            data: data.clone(),
                        },
                    );
                    // 同时写入 REST 读缓冲（有上限，超出丢最旧）。前端事件路径保持不变。
                    if let Ok(mut rb) = read_buffer.lock() {
                        rb.extend(data.iter().copied());
                        let overflow = rb.len().saturating_sub(READ_BUFFER_CAP);
                        if overflow > 0 {
                            rb.drain(0..overflow);
                        }
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // Timeout is expected, keep polling
                }
                Err(_) => {
                    // Port error, emit empty event as disconnect signal
                    let _ = app_handle.emit(
                        "serial-data-received",
                        SerialDataEvent {
                            port: port_name.clone(),
                            data: vec![],
                        },
                    );
                    break;
                }
                _ => {}
            }
            // Brief sleep to avoid busy-waiting
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
    })
}

/// Event payload for serial data received.
#[derive(Clone, serde::Serialize)]
pub struct SerialDataEvent {
    pub port: String,
    pub data: Vec<u8>,
}
