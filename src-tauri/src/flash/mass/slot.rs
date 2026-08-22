use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SlotStatus {
    Idle,
    Waiting,
    Flashing,
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MassSlot {
    pub id: u16,
    pub status: SlotStatus,
    pub bus: Option<u8>,
    pub port: Option<u8>,
    pub task_id: Option<u64>,
    pub progress: f64,
    pub stage: String,
    pub speed: Option<String>,
    pub error: Option<String>,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub flash_count: u32,
}

impl MassSlot {
    pub fn new(id: u16) -> Self {
        Self {
            id,
            status: SlotStatus::Waiting,
            bus: None,
            port: None,
            task_id: None,
            progress: 0.0,
            stage: String::new(),
            speed: None,
            error: None,
            start_time: None,
            end_time: None,
            flash_count: 0,
        }
    }

    pub fn clear(&mut self) {
        self.status = SlotStatus::Idle;
        self.bus = None;
        self.port = None;
        self.task_id = None;
        self.progress = 0.0;
        self.stage.clear();
        self.speed = None;
        self.error = None;
        self.start_time = None;
        self.end_time = None;
        self.flash_count = 0;
    }

    pub fn matches_bus_port(&self, bus: u8, port: u8) -> bool {
        self.bus == Some(bus) && self.port == Some(port)
    }

    pub fn reset_for_flash(&mut self, bus: u8, port: u8, timestamp: u64) {
        self.status = SlotStatus::Flashing;
        self.bus = Some(bus);
        self.port = Some(port);
        self.progress = 0.0;
        self.stage = String::new();
        self.speed = None;
        self.error = None;
        self.start_time = Some(timestamp);
        self.end_time = None;
    }
}
