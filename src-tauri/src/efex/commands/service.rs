use log::error;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use crate::efex::device;
use crate::efex::error::EfexError;

static FEL_TIMEOUT_SECS: AtomicU64 = AtomicU64::new(1);
static FES_TIMEOUT_SECS: AtomicU64 = AtomicU64::new(1);

pub const DEFAULT_TIMEOUT_DURATION: Duration = Duration::from_secs(1);

pub fn set_fel_timeout(timeout_secs: u64) {
    FEL_TIMEOUT_SECS.store(timeout_secs, Ordering::SeqCst);
}

pub fn set_fes_timeout(timeout_secs: u64) {
    FES_TIMEOUT_SECS.store(timeout_secs, Ordering::SeqCst);
}

pub fn get_fel_timeout() -> Duration {
    Duration::from_secs(FEL_TIMEOUT_SECS.load(Ordering::SeqCst))
}

pub fn get_fes_timeout() -> Duration {
    Duration::from_secs(FES_TIMEOUT_SECS.load(Ordering::SeqCst))
}

pub async fn run_blocking_with_timeout<T, F>(
    timeout: Duration,
    timeout_message: &str,
    task: F,
) -> Result<T, EfexError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, EfexError> + Send + 'static,
{
    tokio::time::timeout(timeout, tokio::task::spawn_blocking(task))
        .await
        .map_err(|_| {
            error!("{}", timeout_message);
            EfexError::timeout(timeout_message)
        })?
        .map_err(|e| {
            error!("Task error: {}", e);
            EfexError {
                code: -1,
                name: "TaskError".to_string(),
                message: e.to_string(),
            }
        })?
}

/// Run one native EFEX operation with a per-physical-device gate.
///
/// A `spawn_blocking` task cannot be forcefully cancelled. The owned guard is
/// therefore moved into the blocking closure so it remains held after a
/// timeout until the native operation actually exits. Subsequent operations
/// wait asynchronously and cannot corrupt the same device session.
pub async fn run_device_blocking_with_timeout<T, F>(
    device_id: u32,
    timeout: Duration,
    timeout_message: &str,
    task: F,
) -> Result<T, EfexError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, EfexError> + Send + 'static,
{
    let started = tokio::time::Instant::now();
    let operation_guard = tokio::time::timeout(timeout, device::acquire_operation(device_id))
        .await
        .map_err(|_| EfexError::timeout(timeout_message))??;
    let remaining = timeout
        .checked_sub(started.elapsed())
        .filter(|duration| !duration.is_zero())
        .ok_or_else(|| EfexError::timeout(timeout_message))?;
    run_blocking_with_timeout(remaining, timeout_message, move || {
        let _operation_guard = operation_guard;
        task()
    })
    .await
}

pub async fn run_device_blocking<T, F>(device_id: u32, task: F) -> Result<T, EfexError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, EfexError> + Send + 'static,
{
    let operation_guard = device::acquire_operation(device_id).await?;
    tokio::task::spawn_blocking(move || {
        let _operation_guard = operation_guard;
        task()
    })
    .await
    .map_err(|e| {
        error!("Task error: {}", e);
        EfexError {
            code: -1,
            name: "TaskError".to_string(),
            message: e.to_string(),
        }
    })?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn device_timeout_includes_waiting_for_the_operation_gate() {
        let device_id = device::register_device(253, 253, Some("test://efex-timeout-gate".into()));
        let guard = device::acquire_operation(device_id).await.unwrap();

        let blocked = run_device_blocking_with_timeout(
            device_id,
            Duration::from_millis(20),
            "operation gate timeout",
            || Ok(()),
        )
        .await;
        assert!(blocked.is_err());

        drop(guard);
        let completed = run_device_blocking_with_timeout(
            device_id,
            Duration::from_secs(1),
            "operation timeout",
            || Ok(42u8),
        )
        .await;
        assert_eq!(completed.unwrap(), 42);
        device::unregister_device(device_id);
    }
}
