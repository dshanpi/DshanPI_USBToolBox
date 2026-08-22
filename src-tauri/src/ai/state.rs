//! AI 聊天的共享状态：持有"停止生成"标志，支持中断流式响应。

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub type AbortMap = Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>;

/// AI 模块状态（Tauri 托管单例）。
pub struct AiState {
    /// 按 requestId 隔离的中断标志。全局助手与 Python 助手可以同时订阅事件而不串流。
    pub aborts: AbortMap,
}

impl AiState {
    pub fn new() -> Self {
        Self {
            aborts: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 注册一条新请求并返回其独立中断标志。
    pub fn begin(&self, request_id: &str) -> Arc<AtomicBool> {
        let abort = Arc::new(AtomicBool::new(false));
        if let Ok(mut map) = self.aborts.lock() {
            map.insert(request_id.to_string(), abort.clone());
        }
        abort
    }

    /// 请求中断指定请求；缺省 requestId 时兼容旧前端，中断全部请求。
    pub fn request_abort(&self, request_id: Option<&str>) {
        if let Ok(map) = self.aborts.lock() {
            if let Some(id) = request_id {
                if let Some(abort) = map.get(id) {
                    abort.store(true, Ordering::SeqCst);
                }
            } else {
                for abort in map.values() {
                    abort.store(true, Ordering::SeqCst);
                }
            }
        }
    }

    /// 请求结束后清理标志，避免长时间运行积累状态。
    pub fn finish(aborts: &AbortMap, request_id: &str) {
        if let Ok(mut map) = aborts.lock() {
            map.remove(request_id);
        }
    }
}

impl Default for AiState {
    fn default() -> Self {
        Self::new()
    }
}
