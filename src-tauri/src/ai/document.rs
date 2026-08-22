//! AI 助手本地资料读取：支持纯文本/源码和带文字层的 PDF。

use serde::Serialize;
use std::path::PathBuf;

const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_TEXT_CHARS: usize = 120_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDocument {
    pub name: String,
    pub kind: String,
    pub text: String,
    pub size_bytes: u64,
    pub truncated: bool,
}

fn truncate_chars(text: String) -> (String, bool) {
    let mut iter = text.char_indices();
    let cut = iter.nth(MAX_TEXT_CHARS).map(|(idx, _)| idx);
    match cut {
        Some(idx) => (text[..idx].to_string(), true),
        None => (text, false),
    }
}

fn decode_text(bytes: &[u8]) -> String {
    if let Some(content) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(content).into_owned();
    }
    if let Some(content) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        let units = content
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16_lossy(&units);
    }
    if let Some(content) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        let units = content
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16_lossy(&units);
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_string();
    }

    // 国内硬件厂商的初始化表和示例源码经常使用 GBK 系列编码。
    let (decoded, _, _) = encoding_rs::GBK.decode(bytes);
    decoded.into_owned()
}

/// 读取用户在文件选择器中明确选择的资料。只返回内存文本，不复制或持久化原文件。
#[tauri::command]
pub async fn ai_read_document(path: String) -> Result<AiDocument, String> {
    let path = PathBuf::from(path);
    let metadata = std::fs::metadata(&path).map_err(|e| format!("无法读取文件信息: {e}"))?;
    if !metadata.is_file() {
        return Err("所选路径不是文件".into());
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err(format!("文件超过 {} MB 限制", MAX_FILE_BYTES / 1024 / 1024));
    }

    let name = path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("document")
        .to_string();
    let extension = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let (kind, raw_text) = if extension == "pdf" {
        let pdf_path = path.clone();
        let text =
            tauri::async_runtime::spawn_blocking(move || pdf_extract::extract_text(&pdf_path))
                .await
                .map_err(|e| format!("PDF 解析任务失败: {e}"))?
                .map_err(|e| format!("PDF 文本提取失败: {e}"))?;
        if text.trim().is_empty() {
            return Err("PDF 未提取到文字；它可能是扫描图片，请先进行 OCR 或导出为文本".into());
        }
        ("pdf".to_string(), text)
    } else {
        let supported = [
            "txt", "md", "rst", "csv", "json", "yaml", "yml", "xml", "html", "htm", "c", "h",
            "cpp", "hpp", "ino", "py", "rs", "java", "log", "ini", "cfg", "toml",
        ];
        if !supported.contains(&extension.as_str()) {
            return Err(format!(
                "暂不支持 .{extension} 文件；请选择 PDF、文本、源码或配置文件"
            ));
        }
        let bytes = std::fs::read(&path).map_err(|e| format!("读取文件失败: {e}"))?;
        ("text".to_string(), decode_text(&bytes))
    };

    let (text, truncated) = truncate_chars(raw_text);
    Ok(AiDocument {
        name,
        kind,
        text,
        size_bytes: metadata.len(),
        truncated,
    })
}
