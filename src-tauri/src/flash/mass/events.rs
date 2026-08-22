use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Runtime};

use super::slot::MassSlot;
use super::types::{MassLogEvent, MassManagerState, MassSlotUpdateEvent, MassStateEvent};

pub(super) const EVENT_MASS_SLOT_UPDATE: &str = "mass-slot-update";
pub(super) const EVENT_MASS_LOG: &str = "mass-log";
pub(super) const EVENT_MASS_STATE: &str = "mass-state";

pub(super) fn emit_slot_update<R: Runtime>(app_handle: &AppHandle<R>, slot: &MassSlot) {
    let _ = app_handle.emit(
        EVENT_MASS_SLOT_UPDATE,
        MassSlotUpdateEvent {
            slot_id: slot.id,
            status: slot.status,
            progress: slot.progress,
            stage: slot.stage.clone(),
            speed: slot.speed.clone(),
            error: slot.error.clone(),
            bus: slot.bus,
            port: slot.port,
            start_time: slot.start_time,
            end_time: slot.end_time,
        },
    );
}

pub(super) fn emit_mass_log<R: Runtime>(
    app_handle: &AppHandle<R>,
    slot_id: Option<u16>,
    level: &str,
    message: &str,
) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let _ = app_handle.emit(
        EVENT_MASS_LOG,
        MassLogEvent {
            slot_id,
            level: level.to_string(),
            message: message.to_string(),
            timestamp,
        },
    );
}

pub(super) fn emit_mass_state<R: Runtime>(
    app_handle: &AppHandle<R>,
    state: MassManagerState,
    total: u32,
    success: u32,
    failed: u32,
    in_progress: u32,
) {
    let _ = app_handle.emit(
        EVENT_MASS_STATE,
        MassStateEvent {
            state,
            total,
            success,
            failed,
            in_progress,
        },
    );
}
