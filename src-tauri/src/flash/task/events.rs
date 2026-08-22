use super::*;

pub(super) fn emit_log<R: Runtime>(
    app_handle: &AppHandle<R>,
    task_id: u64,
    level: &str,
    message: &str,
) {
    let _ = app_handle.emit(
        EVENT_FLASH_LOG,
        FlashLogEvent {
            task_id,
            level: level.to_string(),
            message: message.to_string(),
            timestamp: now_millis(),
        },
    );
}

pub(super) fn emit_state<R: Runtime>(
    app_handle: &AppHandle<R>,
    task_id: u64,
    status: &str,
    message: Option<&str>,
    error: Option<AppError>,
) {
    let _ = app_handle.emit(
        EVENT_FLASH_STATE,
        FlashStateEvent {
            task_id,
            status: status.to_string(),
            message: message.map(ToOwned::to_owned),
            error,
        },
    );
}

pub(super) fn emit_popup<R: Runtime>(
    app_handle: &AppHandle<R>,
    task_id: u64,
    popup_type: &str,
    title: &str,
    message: &str,
) {
    let _ = app_handle.emit(
        EVENT_FLASH_POPUP,
        FlashPopupEvent {
            task_id,
            popup_type: popup_type.to_string(),
            title: title.to_string(),
            message: message.to_string(),
        },
    );
}

pub(super) fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub(super) async fn wait_confirmation<R: Runtime>(
    app_handle: &AppHandle<R>,
    active: &ActiveTask,
    title: &str,
    message: &str,
    kind: &str,
) -> Result<bool, AppError> {
    let request_id = NEXT_REQUEST_ID.fetch_add(1, Ordering::SeqCst);
    let (sender, receiver) = oneshot::channel();
    active.confirms.lock().unwrap().insert(request_id, sender);

    let _ = app_handle.emit(
        EVENT_FLASH_CONFIRM_REQUEST,
        FlashConfirmRequestEvent {
            task_id: active.id,
            request_id,
            kind: kind.to_string(),
            title: title.to_string(),
            message: message.to_string(),
        },
    );

    receiver.await.map_err(|_| AppError {
        code: -1,
        name: "ConfirmClosed".to_string(),
        message: "Flash confirmation channel was closed".to_string(),
    })
}

pub(super) fn emit_dram_info<R: Runtime>(
    app_handle: &AppHandle<R>,
    task_id: u64,
    ret_addr: u32,
    dram_state: &crate::firmware::types::DramParamInfoDto,
) {
    let _ = app_handle.emit(
        EVENT_FLASH_DRAM_INFO,
        FlashDramInfoEvent {
            task_id,
            ret_addr,
            dram_init_flag: dram_state.dram_init_flag,
            dram_update_flag: dram_state.dram_update_flag,
            dram_para: dram_state.dram_para.clone(),
        },
    );
}
