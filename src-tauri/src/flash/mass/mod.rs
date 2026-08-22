pub mod commands;
mod events;
pub(crate) mod manager;
mod slot;
pub mod types;

use std::sync::Mutex;

use manager::MassProductionManager;

pub struct MassProductionState(pub Mutex<MassProductionManager>);

impl MassProductionState {
    pub fn new() -> Self {
        Self(Mutex::new(MassProductionManager::new()))
    }
}
