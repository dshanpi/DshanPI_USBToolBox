use crate::flash::types::FlashOptions;
use serde::{Deserialize, Serialize};

use super::slot::{MassSlot, SlotStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MassConfig {
    pub image_path: String,
    pub options: FlashOptions,
    pub max_slots: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MassManagerState {
    Stopped,
    Running,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MassSlotUpdateEvent {
    pub slot_id: u16,
    pub status: SlotStatus,
    pub progress: f64,
    pub stage: String,
    pub speed: Option<String>,
    pub error: Option<String>,
    pub bus: Option<u8>,
    pub port: Option<u8>,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MassLogEvent {
    pub slot_id: Option<u16>,
    pub level: String,
    pub message: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MassStateEvent {
    pub state: MassManagerState,
    pub total: u32,
    pub success: u32,
    pub failed: u32,
    pub in_progress: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MassStatusSnapshot {
    pub state: MassManagerState,
    pub slots: Vec<MassSlot>,
    pub total: u32,
    pub success: u32,
    pub failed: u32,
    pub in_progress: u32,
}
