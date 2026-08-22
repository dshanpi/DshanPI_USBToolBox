//! AI 聊天命令：调用大模型 OpenAI 兼容接口，SSE 流式回传。

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use super::state::AiState;

/// 一条聊天消息（role: system/user/assistant，content: 文本）。
#[derive(Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// 前端传入的 AI 配置（来自 settings.json，每次请求带过来，不存后端）。
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub api_url: String,
    pub api_key: String,
    pub model: String,
}

/// 请求体（OpenAI 兼容）。用 owned String 以便能 move 进 spawn 任务。
#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessageOwned>,
    stream: bool,
}

#[derive(Serialize)]
struct ChatMessageOwned {
    role: String,
    content: String,
}

/// SSE 增量事件载荷。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DeltaEvent {
    request_id: String,
    content: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DoneEvent {
    request_id: String,
    aborted: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ErrorEvent {
    request_id: String,
    error: String,
}

fn emit_error(app: &AppHandle, request_id: &str, error: String) {
    let _ = app.emit(
        "ai-chat-error",
        ErrorEvent {
            request_id: request_id.to_string(),
            error,
        },
    );
}

/// 流式 AI 聊天。
///
/// 前端把完整 messages（含首条 system 提示）+ AI 配置传入；本命令在后台 tokio 任务里
/// 调 `{api_url}/chat/completions`（stream:true），逐 chunk 解析 SSE `delta.content`，
/// 经 `ai-chat-delta` 事件回传；结束发 `ai-chat-done`，出错发 `ai-chat-error`。
#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    state: State<'_, AiState>,
    messages: Vec<ChatMessage>,
    settings: AiSettings,
    request_id: Option<String>,
) -> Result<(), String> {
    if settings.api_key.is_empty() {
        return Err("未配置 API Key，请在设置中填写 AI 配置".into());
    }
    if settings.api_url.is_empty() {
        return Err("未配置 API URL".into());
    }

    // 准备请求体（owned，便于 move 进 spawn）
    let ser_msgs: Vec<ChatMessageOwned> = messages
        .into_iter()
        .map(|m| ChatMessageOwned {
            role: m.role,
            content: m.content,
        })
        .collect();
    let body = ChatRequest {
        model: settings.model,
        messages: ser_msgs,
        stream: true,
    };
    let url = format!(
        "{}/chat/completions",
        settings.api_url.trim_end_matches('/')
    );

    // requestId 让多个前端助手只接收自己的流式事件；旧调用缺省时仍可工作。
    let request_id = request_id.unwrap_or_else(|| "legacy".to_string());
    let abort = state.begin(&request_id);
    let aborts = state.aborts.clone();

    // 在后台任务里跑流式请求，命令本身立即返回（事件驱动前端）
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let client = match reqwest::Client::builder().build() {
            Ok(c) => c,
            Err(e) => {
                emit_error(&app2, &request_id, format!("创建 HTTP 客户端失败: {e}"));
                AiState::finish(&aborts, &request_id);
                return;
            }
        };

        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", settings.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await;

        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                emit_error(&app2, &request_id, format!("请求失败: {e}"));
                AiState::finish(&aborts, &request_id);
                return;
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            emit_error(&app2, &request_id, format!("HTTP {status}: {text}"));
            AiState::finish(&aborts, &request_id);
            return;
        }

        // 逐行解析 SSE 流
        let mut stream = resp.bytes_stream();
        let mut buf = String::new();
        while let Some(chunk_res) = stream.next().await {
            if abort.load(std::sync::atomic::Ordering::SeqCst) {
                let _ = app2.emit(
                    "ai-chat-done",
                    DoneEvent {
                        request_id: request_id.clone(),
                        aborted: true,
                    },
                );
                AiState::finish(&aborts, &request_id);
                return;
            }
            let chunk = match chunk_res {
                Ok(c) => c,
                Err(e) => {
                    emit_error(&app2, &request_id, format!("流读取失败: {e}"));
                    AiState::finish(&aborts, &request_id);
                    return;
                }
            };
            buf.push_str(&String::from_utf8_lossy(&chunk));
            // SSE 事件以空行分隔，逐行处理
            while let Some(idx) = buf.find('\n') {
                let line: String = buf.drain(..=idx).collect::<String>().trim().to_string();
                if line.is_empty() || line.starts_with(':') {
                    continue;
                }
                // 形如 `data: {...}` 或 `data: [DONE]`
                let data = if let Some(rest) = line.strip_prefix("data:") {
                    rest.trim()
                } else {
                    continue;
                };
                if data == "[DONE]" {
                    let _ = app2.emit(
                        "ai-chat-done",
                        DoneEvent {
                            request_id: request_id.clone(),
                            aborted: false,
                        },
                    );
                    AiState::finish(&aborts, &request_id);
                    return;
                }
                // 解析 delta.content
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(content) = v
                        .get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c| c.get("delta"))
                        .and_then(|d| d.get("content"))
                        .and_then(|c| c.as_str())
                    {
                        if !content.is_empty() {
                            let _ = app2.emit(
                                "ai-chat-delta",
                                DeltaEvent {
                                    request_id: request_id.clone(),
                                    content: content.to_string(),
                                },
                            );
                        }
                    }
                }
            }
        }
        // 流自然结束（未收到 [DONE]）
        let _ = app2.emit(
            "ai-chat-done",
            DoneEvent {
                request_id: request_id.clone(),
                aborted: false,
            },
        );
        AiState::finish(&aborts, &request_id);
    });

    Ok(())
}

/// 停止当前流式生成。
#[tauri::command]
pub fn ai_chat_stop(state: State<'_, AiState>, request_id: Option<String>) -> Result<(), String> {
    state.request_abort(request_id.as_deref());
    Ok(())
}
