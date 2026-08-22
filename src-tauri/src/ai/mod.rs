//! AI 聊天代理：调用大模型（OpenAI 兼容接口）生成 Python 产测脚本。
//!
//! 为安全起见，API Key 不进前端 JS：前端把用户配置（apiUrl/apiKey/model）随请求传给本模块，
//! 由 Rust 侧用 reqwest 调用大模型 API 并把 SSE 流逐字 emit 回前端。Key 仅在这一次请求的内存中存在。
//!
//! 系统提示（让生成的脚本直接用 usbtoolbox.tester API）由前端 aiContext.ts 提供并作为
//! messages 首条 system 消息传入，本模块不硬编码提示内容。

pub mod commands;
pub mod document;
pub mod state;
