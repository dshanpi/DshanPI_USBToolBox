use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub code: i32,
    pub name: String,
    pub message: String,
}

impl AppError {
    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            code: -1,
            name: "InternalError".to_string(),
            message: message.into(),
        }
    }
}

impl From<String> for AppError {
    fn from(message: String) -> Self {
        Self {
            code: -1,
            name: "OperationFailed".to_string(),
            message,
        }
    }
}

impl From<&str> for AppError {
    fn from(message: &str) -> Self {
        Self::from(message.to_string())
    }
}

impl From<crate::efex::error::EfexError> for AppError {
    fn from(value: crate::efex::error::EfexError) -> Self {
        Self {
            code: value.code,
            name: value.name,
            message: value.message,
        }
    }
}
