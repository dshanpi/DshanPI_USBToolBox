use crate::tcp;
use std::io::Write;
use tauri::State;

#[tauri::command]
pub async fn tcp_connect(
    state: State<'_, tcp::TcpState>,
    id: String,
    host: String,
    port: u16,
) -> Result<(), String> {
    let addr = format!("{}:{}", host, port);
    let stream = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::net::TcpStream::connect(&addr),
    )
    .await
    .map_err(|_| format!("TCP connect to {addr} timed out"))?
    .map_err(|e| format!("TCP connect to {} failed: {}", addr, e))?;
    let stream = stream
        .into_std()
        .map_err(|e| format!("TCP stream setup failed: {e}"))?;
    stream.set_nonblocking(false).map_err(|e| e.to_string())?;

    let old = state
        .connections
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&id);
    if let Some(old) = old {
        tcp::stop_tcp_handle(old);
    }
    let mut connections = state.connections.lock().map_err(|e| e.to_string())?;
    connections.insert(
        id,
        tcp::TcpHandle {
            stream: std::sync::Arc::new(std::sync::Mutex::new(stream)),
            read_thread: None,
            stop_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        },
    );
    Ok(())
}

#[tauri::command]
pub fn tcp_send(state: State<'_, tcp::TcpState>, id: String, data: Vec<u8>) -> Result<(), String> {
    let shared_stream = {
        let connections = state.connections.lock().map_err(|e| e.to_string())?;
        connections
            .get(&id)
            .ok_or("TCP connection not found")?
            .stream
            .clone()
    };
    let mut stream = shared_stream.lock().map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(std::time::Duration::from_secs(3)))
        .map_err(|e| e.to_string())?;
    stream
        .write_all(&data)
        .map_err(|e| format!("TCP send error: {}", e))?;
    stream
        .flush()
        .map_err(|e| format!("TCP flush error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn tcp_start_read(
    state: State<'_, tcp::TcpState>,
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<(), String> {
    let mut connections = state.connections.lock().map_err(|e| e.to_string())?;
    let handle = connections.get_mut(&id).ok_or("TCP connection not found")?;

    if handle
        .read_thread
        .as_ref()
        .is_some_and(|thread| !thread.is_finished())
    {
        return Ok(());
    }
    if let Some(thread) = handle.read_thread.take() {
        let _ = thread.join();
    }
    handle.stop_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

    let stream = handle.stream.clone();
    let stop_flag = handle.stop_flag.clone();
    handle.read_thread = Some(tcp::spawn_tcp_read_thread(
        id, stream, stop_flag, app_handle,
    ));
    Ok(())
}

#[tauri::command]
pub fn tcp_close(state: State<'_, tcp::TcpState>, id: String) -> Result<(), String> {
    let handle = state
        .connections
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&id);
    if let Some(handle) = handle {
        tcp::stop_tcp_handle(handle);
    }
    Ok(())
}
