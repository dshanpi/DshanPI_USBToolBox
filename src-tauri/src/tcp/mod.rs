pub mod commands;

use std::collections::HashMap;
use std::io::Read;
use std::net::{Shutdown, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::{AppHandle, Emitter};

pub type StopFlag = Arc<AtomicBool>;

pub struct TcpHandle {
    pub stream: Arc<Mutex<TcpStream>>,
    pub read_thread: Option<JoinHandle<()>>,
    pub stop_flag: StopFlag,
}

pub struct TcpState {
    pub connections: Arc<Mutex<HashMap<String, TcpHandle>>>,
}

/// Stop a connection without leaving its reader thread or socket behind.
/// The stop flag is checked before emitting a disconnect event, so an explicit
/// user disconnect is not reported as an unexpected remote failure.
pub fn stop_tcp_handle(mut handle: TcpHandle) {
    handle.stop_flag.store(true, Ordering::Release);
    if let Ok(stream) = handle.stream.lock() {
        let _ = stream.shutdown(Shutdown::Both);
    }
    if let Some(thread) = handle.read_thread.take() {
        let _ = thread.join();
    }
}

impl TcpState {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

pub fn spawn_tcp_read_thread(
    conn_id: String,
    shared_stream: Arc<Mutex<TcpStream>>,
    stop_flag: StopFlag,
    app_handle: AppHandle,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buf = vec![0u8; 4096];
        loop {
            if stop_flag.load(Ordering::Acquire) {
                break;
            }
            let result = {
                let mut stream = match shared_stream.lock() {
                    Ok(s) => s,
                    Err(_) => break,
                };
                stream
                    .set_read_timeout(Some(std::time::Duration::from_millis(100)))
                    .ok();
                stream.read(&mut buf)
            };
            match result {
                Ok(n) if n > 0 => {
                    let data: Vec<u8> = buf[..n].to_vec();
                    let _ = app_handle.emit(
                        "tcp-data-received",
                        TcpDataEvent {
                            id: conn_id.clone(),
                            data,
                        },
                    );
                }
                Ok(0) => {
                    if !stop_flag.load(Ordering::Acquire) {
                        let _ = app_handle.emit("tcp-disconnected", conn_id.clone());
                    }
                    break;
                }
                Err(ref e)
                    if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => {
                    if !stop_flag.load(Ordering::Acquire) {
                        let _ = app_handle.emit("tcp-disconnected", conn_id.clone());
                    }
                    break;
                }
                _ => unreachable!(),
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    })
}

#[derive(Clone, serde::Serialize)]
pub struct TcpDataEvent {
    pub id: String,
    pub data: Vec<u8>,
}
