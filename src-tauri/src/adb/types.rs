use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbDevice {
    pub serial: String,
    pub state: String,
    pub model: Option<String>,
    pub product: Option<String>,
    pub device: Option<String>,
    pub transport_id: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbVersion {
    pub version: String,
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbServerStatus {
    pub running: bool,
    pub version: Option<AdbVersion>,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_directory: bool,
    pub modified_time: Option<u64>,
    pub permissions: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbDirectoryListing {
    pub path: String,
    pub items: Vec<AdbFileInfo>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbCommandResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AdbError {
    ServerNotRunning,
    DeviceNotFound,
    ConnectionFailed,
    CommandFailed,
    FileNotFound,
    PermissionDenied,
    Unknown(String),
}

impl std::fmt::Display for AdbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AdbError::ServerNotRunning => write!(f, "ADB server is not running"),
            AdbError::DeviceNotFound => write!(f, "Device not found"),
            AdbError::ConnectionFailed => write!(f, "Connection failed"),
            AdbError::CommandFailed => write!(f, "Command failed"),
            AdbError::FileNotFound => write!(f, "File not found"),
            AdbError::PermissionDenied => write!(f, "Permission denied"),
            AdbError::Unknown(msg) => write!(f, "Unknown error: {}", msg),
        }
    }
}

impl std::error::Error for AdbError {}
