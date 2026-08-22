use super::*;
use crate::efex::function::EfexFunction;
use crate::efex::types::FesDataType;
use std::time::Duration;

const FEL_TRANSFER_CHUNK_SIZE: usize = 64 * 1024;
const BYTES_PER_SECOND: usize = 64 * 1024;
const MIN_TRANSFER_TIMEOUT_SECS: u64 = 3;

#[derive(Clone, Copy)]
pub(super) struct TransferProgressRange {
    pub written_base: u64,
    pub total_bytes: u64,
    pub stage_start_percent: f64,
    pub stage_end_percent: f64,
}

pub(super) struct FelTransfer<'a> {
    pub handle: u32,
    pub addr: u32,
    pub data: &'a [u8],
    pub item_name: &'a str,
    pub progress_range: TransferProgressRange,
}

pub(super) struct FesTransfer<'a> {
    pub handle: u32,
    pub addr: u32,
    pub data: Vec<u8>,
    pub data_type: FesDataType,
    pub item_name: &'a str,
    pub progress_range: TransferProgressRange,
    pub timeout_secs: u64,
}

pub(super) fn calculate_transfer_timeout_secs(data_size: usize, min_timeout_secs: u64) -> u64 {
    let timeout = (data_size as u64).div_ceil(BYTES_PER_SECOND as u64);
    timeout.max(min_timeout_secs.max(MIN_TRANSFER_TIMEOUT_SECS))
}

pub(super) async fn transfer_fel_bytes<R: Runtime>(
    progress: &DownloadProgressContext<R>,
    transfer: FelTransfer<'_>,
) -> Result<u64, AppError> {
    let mut written = 0u64;

    for (index, chunk) in transfer.data.chunks(FEL_TRANSFER_CHUNK_SIZE).enumerate() {
        let chunk_offset = u32::try_from(index.saturating_mul(FEL_TRANSFER_CHUNK_SIZE))
            .map_err(|_| AppError::internal("FEL transfer offset exceeds 32-bit address space"))?;
        let chunk_addr = transfer.addr.checked_add(chunk_offset).ok_or_else(|| {
            AppError::internal("FEL transfer address exceeds 32-bit address space")
        })?;
        let timeout = Duration::from_secs(calculate_transfer_timeout_secs(
            chunk.len(),
            MIN_TRANSFER_TIMEOUT_SECS,
        ));
        efex_fel_write_with_timeout(transfer.handle, chunk_addr, chunk.to_vec(), timeout)
            .await
            .map_err(AppError::from)?;
        written = written.saturating_add(chunk.len() as u64);

        let stage = format!(
            "Downloading {} ({:.1}MB / {:.1}MB)",
            transfer.item_name,
            (transfer.progress_range.written_base + written) as f64 / (1024.0 * 1024.0),
            transfer.progress_range.total_bytes as f64 / (1024.0 * 1024.0)
        );
        emit_download_progress_range(
            progress,
            &stage,
            transfer.item_name,
            transfer.progress_range.written_base + written,
            transfer.progress_range.total_bytes,
            transfer.progress_range.stage_start_percent,
            transfer.progress_range.stage_end_percent,
        );
    }

    Ok(written)
}

pub(super) async fn transfer_fes_bytes<R: Runtime>(
    progress: &DownloadProgressContext<R>,
    transfer: FesTransfer<'_>,
) -> Result<u64, AppError> {
    let progress_clone = (*progress).clone();
    let item_name = transfer.item_name.to_string();
    let timeout_item_name = item_name.clone();
    let total_bytes_f64 = transfer.progress_range.total_bytes as f64 / (1024.0 * 1024.0);
    let handle = transfer.handle;
    let addr = transfer.addr;
    let data = transfer.data;
    let data_type = transfer.data_type;
    let written_base = transfer.progress_range.written_base;
    let total_bytes = transfer.progress_range.total_bytes;
    let stage_start_percent = transfer.progress_range.stage_start_percent;
    let stage_end_percent = transfer.progress_range.stage_end_percent;
    // Acquire before spawning. If a previous native operation timed out but is
    // still running, this await is cancellable and no stale transfer is queued.
    let timeout = Duration::from_secs(transfer.timeout_secs);
    let started = tokio::time::Instant::now();
    let operation_guard =
        tokio::time::timeout(timeout, crate::efex::device::acquire_operation(handle))
            .await
            .map_err(|_| AppError {
                code: -1,
                name: "TransferTimeout".to_string(),
                message: format!("Timed out waiting to download {timeout_item_name}"),
            })?
            .map_err(AppError::from)?;
    let remaining = timeout
        .checked_sub(started.elapsed())
        .filter(|duration| !duration.is_zero())
        .ok_or_else(|| AppError {
            code: -1,
            name: "TransferTimeout".to_string(),
            message: format!("Timed out waiting to download {timeout_item_name}"),
        })?;

    tokio::time::timeout(
        remaining,
        tokio::task::spawn_blocking(move || {
            let _operation_guard = operation_guard;
            let func = EfexFunction::new(handle);
            func.fes_down_typed_with_progress(&data, addr, data_type, |written, _| {
                let stage = format!(
                    "Downloading {} ({:.1}MB / {:.1}MB)",
                    item_name,
                    (written_base + written) as f64 / (1024.0 * 1024.0),
                    total_bytes_f64
                );
                emit_download_progress_range(
                    &progress_clone,
                    &stage,
                    &item_name,
                    written_base + written,
                    total_bytes,
                    stage_start_percent,
                    stage_end_percent,
                );
            })
            .map_err(AppError::from)
        }),
    )
    .await
    .map_err(|_| AppError {
        code: -1,
        name: "TransferTimeout".to_string(),
        message: format!("Timed out while downloading {timeout_item_name}"),
    })?
    .map_err(|error| AppError {
        code: -1,
        name: "TransferTaskError".to_string(),
        message: error.to_string(),
    })?
}
