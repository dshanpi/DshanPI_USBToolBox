use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UsbHotPlugEvent {
    Arrived,
    Left,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsbHotPlugCallback {
    pub event: UsbHotPlugEvent,
    pub vendor_id: u16,
    pub product_id: u16,
    pub efex_device_id: Option<u32>,
    pub bus_id: u32,
    pub usb_device_id: u32,
    pub device_path: Option<String>,
    pub port: Option<u32>,
}
