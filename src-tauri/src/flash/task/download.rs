use super::sparse::download_sparse_partition;
use super::*;
use crate::efex::error::EfexError;
use crate::efex::function::EfexFunction;
use crate::efex::types::FesDataType;
use log::debug;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::time::Duration;

// Align raw partition downloads with the legacy C tool: read the image in 10MB
// windows and let the EFEX layer split each window into 64KB protocol transfers.
const RAW_READ_WINDOW_SIZE: usize = 10 * 1024 * 1024;

pub(super) struct IncrementalChecksum {
    sum: u32,
    pending_bytes: Vec<u8>,
}

impl IncrementalChecksum {
    fn new() -> Self {
        Self {
            sum: 0,
            pending_bytes: Vec::new(),
        }
    }

    fn update(&mut self, data: &[u8]) {
        let buffer = if self.pending_bytes.is_empty() {
            data.to_vec()
        } else {
            let mut combined = self.pending_bytes.clone();
            combined.extend_from_slice(data);
            self.pending_bytes.clear();
            combined
        };

        let aligned_length = buffer.len() & !0x03;
        let remaining = buffer.len() & 0x03;

        for index in (0..aligned_length).step_by(4) {
            let value = u32::from_le_bytes([
                buffer[index],
                buffer[index + 1],
                buffer[index + 2],
                buffer[index + 3],
            ]);
            self.sum = self.sum.wrapping_add(value);
        }

        if remaining > 0 {
            self.pending_bytes = buffer[aligned_length..].to_vec();
        }
    }

    fn finalize(&mut self) -> u32 {
        if !self.pending_bytes.is_empty() {
            let last_value = match self.pending_bytes.len() {
                1 => self.pending_bytes[0] as u32 & 0x0000_00ff,
                2 => {
                    (self.pending_bytes[0] as u32 | (self.pending_bytes[1] as u32) << 8)
                        & 0x0000_ffff
                }
                3 => {
                    (self.pending_bytes[0] as u32
                        | (self.pending_bytes[1] as u32) << 8
                        | (self.pending_bytes[2] as u32) << 16)
                        & 0x00ff_ffff
                }
                _ => 0,
            };
            self.sum = self.sum.wrapping_add(last_value);
            self.pending_bytes.clear();
        }

        self.sum
    }
}

pub(super) async fn download_partition_from_image<R: Runtime>(
    app_handle: &AppHandle<R>,
    task_id: u64,
    progress: &DownloadProgressContext<R>,
    handle: u32,
    partition_info: &PartitionDownloadInfo,
    firmware_path: &str,
    check_cancelled: impl Fn() -> Result<(), EfexError> + Copy,
) -> Result<DownloadPartitionResult, EfexError> {
    debug!(
        "download_partition_from_image: partition={}, firmware={}",
        partition_info.partition.name, firmware_path
    );

    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        &format!("Opening firmware file: {firmware_path}"),
    );

    let mut file = File::open(firmware_path).map_err(|error| EfexError {
        code: -1,
        name: "FileOpen".to_string(),
        message: format!("Failed to open firmware file: {error}"),
    })?;

    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        "Firmware file opened successfully",
    );

    let partition_name = partition_info.partition.name.clone();
    if partition_info.data_length == 0 {
        emit_log(
            app_handle,
            task_id,
            "error",
            &format!("Partition {partition_name} data length is 0"),
        );
        return Ok(DownloadPartitionResult {
            success: false,
            bytes_written: 0,
            partition_name,
        });
    }

    file.seek(SeekFrom::Start(partition_info.data_offset))
        .map_err(|error| EfexError {
            code: -1,
            name: "FileSeek".to_string(),
            message: format!("Failed to seek file offset: {error}"),
        })?;

    let mut probe_buf = vec![0u8; SPARSE_HEADER_SIZE];
    file.read_exact(&mut probe_buf).map_err(|error| EfexError {
        code: -1,
        name: "FileRead".to_string(),
        message: format!("Failed to read partition header: {error}"),
    })?;

    let is_sparse = is_sparse_format(&probe_buf);
    file.seek(SeekFrom::Start(partition_info.data_offset))
        .map_err(|error| EfexError {
            code: -1,
            name: "FileSeek".to_string(),
            message: format!("Failed to seek file offset: {error}"),
        })?;

    emit_log(app_handle, task_id, LEVEL_INFO, "Turning on flash access");
    let flash_on_result = run_device_blocking(handle, move || {
        EfexFunction::fes_flash_set_onoff(handle, 0, true)
    })
    .await;

    if let Err(error) = flash_on_result {
        emit_log(
            app_handle,
            task_id,
            "error",
            &format!("Failed to turn on flash access: {}", error.message),
        );
        return Err(error);
    }

    let result = if is_sparse {
        emit_log(
            app_handle,
            task_id,
            LEVEL_INFO,
            &format!("Partition {partition_name} is in sparse format"),
        );
        download_sparse_partition(
            app_handle,
            task_id,
            progress,
            handle,
            partition_info,
            &mut file,
            check_cancelled,
        )
        .await?
    } else {
        download_single_partition(
            app_handle,
            task_id,
            progress,
            handle,
            partition_info,
            &mut file,
            check_cancelled,
        )
        .await?
    };

    emit_log(app_handle, task_id, LEVEL_INFO, "Turning off flash access");
    let flash_off_result = run_device_blocking(handle, move || {
        EfexFunction::fes_flash_set_onoff(handle, 0, false)
    })
    .await;

    if let Err(error) = flash_off_result {
        emit_log(
            app_handle,
            task_id,
            LEVEL_WARN,
            &format!("Failed to turn off flash access: {}", error.message),
        );
    }

    Ok(result)
}

pub(super) async fn download_partition_from_file<R: Runtime>(
    app_handle: &AppHandle<R>,
    task_id: u64,
    progress: &DownloadProgressContext<R>,
    handle: u32,
    partition_info: &ExternalFileDownloadInfo,
    check_cancelled: impl Fn() -> Result<(), EfexError> + Copy,
) -> Result<DownloadPartitionResult, EfexError> {
    let partition = &partition_info.partition;
    let partition_name = partition.name.clone();
    let file_path = &partition_info.file_path;

    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        &format!("Downloading partition {partition_name} from file: {file_path}"),
    );

    let mut file = File::open(file_path).map_err(|error| EfexError {
        code: -1,
        name: "FileOpen".to_string(),
        message: format!("Failed to open file {file_path}: {error}"),
    })?;

    let data_length = file
        .metadata()
        .map_err(|error| EfexError {
            code: -1,
            name: "FileMetadata".to_string(),
            message: format!("Failed to get file metadata: {error}"),
        })?
        .len();

    if data_length == 0 {
        emit_log(
            app_handle,
            task_id,
            "error",
            &format!("File {file_path} is empty"),
        );
        return Ok(DownloadPartitionResult {
            success: false,
            bytes_written: 0,
            partition_name,
        });
    }

    let part_size = partition.length * 512;
    if data_length > part_size {
        emit_log(
            app_handle,
            task_id,
            LEVEL_WARN,
            &format!("File size {data_length} exceeds partition size {part_size}, will truncate"),
        );
    }

    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        &format!("Partition address: 0x{:x}", partition.address),
    );
    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        &format!("Partition size: {} sectors", partition.length),
    );
    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        &format!("File size: {data_length} bytes"),
    );

    let mut probe_buf = vec![0u8; SPARSE_HEADER_SIZE];
    file.read_exact(&mut probe_buf).map_err(|error| EfexError {
        code: -1,
        name: "FileRead".to_string(),
        message: format!("Failed to read file header: {error}"),
    })?;
    let is_sparse = is_sparse_format(&probe_buf);

    file.seek(SeekFrom::Start(0)).map_err(|error| EfexError {
        code: -1,
        name: "FileSeek".to_string(),
        message: format!("Failed to seek file: {error}"),
    })?;

    let internal_partition_info = PartitionDownloadInfo {
        partition: partition.clone(),
        data_offset: 0,
        data_length,
        need_verify: partition_info.need_verify,
        external_file_path: Some(file_path.clone()),
    };

    emit_log(app_handle, task_id, LEVEL_INFO, "Turning on flash access");
    let flash_on_result = run_device_blocking(handle, move || {
        EfexFunction::fes_flash_set_onoff(handle, 0, true)
    })
    .await;

    if let Err(error) = flash_on_result {
        emit_log(
            app_handle,
            task_id,
            "error",
            &format!("Failed to turn on flash access: {}", error.message),
        );
        return Err(error);
    }

    let result = if is_sparse {
        emit_log(
            app_handle,
            task_id,
            LEVEL_INFO,
            &format!("Partition {partition_name} is in sparse format"),
        );
        download_sparse_partition(
            app_handle,
            task_id,
            progress,
            handle,
            &internal_partition_info,
            &mut file,
            check_cancelled,
        )
        .await?
    } else {
        download_single_partition(
            app_handle,
            task_id,
            progress,
            handle,
            &internal_partition_info,
            &mut file,
            check_cancelled,
        )
        .await?
    };

    emit_log(app_handle, task_id, LEVEL_INFO, "Turning off flash access");
    let flash_off_result = run_device_blocking(handle, move || {
        EfexFunction::fes_flash_set_onoff(handle, 0, false)
    })
    .await;

    if let Err(error) = flash_off_result {
        emit_log(
            app_handle,
            task_id,
            LEVEL_WARN,
            &format!("Failed to turn off flash access: {}", error.message),
        );
    }

    Ok(result)
}

pub(super) async fn download_single_partition<R: Runtime>(
    app_handle: &AppHandle<R>,
    task_id: u64,
    progress: &DownloadProgressContext<R>,
    handle: u32,
    partition_info: &PartitionDownloadInfo,
    file: &mut File,
    check_cancelled: impl Fn() -> Result<(), EfexError> + Copy,
) -> Result<DownloadPartitionResult, EfexError> {
    let partition = &partition_info.partition;
    let partition_name = partition.name.clone();
    let data_offset = partition_info.data_offset;
    let data_length = partition_info.data_length;

    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        &format!("Starting partition download: {partition_name}"),
    );
    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        &format!("Partition address: 0x{:x}", partition.address),
    );
    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        &format!("Partition size: {} sectors", partition.length),
    );
    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        &format!("Data offset: {data_offset}, Data length: {data_length} bytes"),
    );

    let part_size = partition.length * 512;
    if data_length > part_size {
        emit_log(
            app_handle,
            task_id,
            "error",
            &format!("Data size {data_length} exceeds partition size {part_size}"),
        );
        return Ok(DownloadPartitionResult {
            success: false,
            bytes_written: 0,
            partition_name,
        });
    }

    file.seek(SeekFrom::Start(data_offset))
        .map_err(|error| EfexError {
            code: -1,
            name: "FileSeek".to_string(),
            message: format!("Failed to seek file offset: {error}"),
        })?;

    let start_sector = partition.address as u32;
    let mut checksum = if partition_info.need_verify {
        Some(IncrementalChecksum::new())
    } else {
        None
    };

    let mut total_written = 0u64;

    while total_written < data_length {
        check_cancelled()?;

        let remaining = data_length.saturating_sub(total_written);
        let window_len = std::cmp::min(remaining, RAW_READ_WINDOW_SIZE as u64) as usize;
        let mut window_data = vec![0u8; window_len];
        file.read_exact(&mut window_data)
            .map_err(|error| EfexError {
                code: -1,
                name: "FileRead".to_string(),
                message: format!("Failed to read file data: {error}"),
            })?;

        if let Some(checksum) = checksum.as_mut() {
            checksum.update(&window_data);
        }

        let chunk_start_sector = start_sector.wrapping_add((total_written / 512) as u32);
        match transfer_fes_bytes(
            progress,
            FesTransfer {
                handle,
                addr: chunk_start_sector,
                data: window_data,
                data_type: FesDataType::Flash,
                item_name: &partition_name,
                progress_range: TransferProgressRange {
                    written_base: total_written,
                    total_bytes: data_length,
                    stage_start_percent: 0.0,
                    stage_end_percent: 100.0,
                },
                timeout_secs: calculate_transfer_timeout_secs(window_len, 60),
            },
        )
        .await
        {
            Ok(written) => total_written += written,
            Err(error) => {
                emit_log(
                    app_handle,
                    task_id,
                    "error",
                    &format!(
                        "Partition {partition_name} download failed: {}",
                        error.message
                    ),
                );
                return Ok(DownloadPartitionResult {
                    success: false,
                    bytes_written: total_written,
                    partition_name,
                });
            }
        }
    }

    if partition_info.need_verify {
        check_cancelled()?;
        emit_log(
            app_handle,
            task_id,
            LEVEL_INFO,
            &format!("Verifying {partition_name}"),
        );
        emit_download_progress(
            progress,
            &format!("Verifying {partition_name}"),
            &partition_name,
            total_written,
            data_length,
        );

        let local_checksum = checksum
            .as_mut()
            .map(IncrementalChecksum::finalize)
            .unwrap_or(0);
        let verify_timeout = Duration::from_secs(
            (data_length as f64 / (1024.0 * 1024.0) * 4.0).clamp(10.0, 120.0) as u64,
        );
        let addr = partition.address as u32;
        let size = data_length;

        let verify_result = run_device_blocking_with_timeout(
            handle,
            verify_timeout,
            &format!("Timed out while verifying {partition_name}"),
            move || {
                let func = EfexFunction::new(handle);
                func.fes_verify_value(addr, size)
            },
        )
        .await;

        if let Ok(verify_resp) = verify_result {
            let media_crc = verify_resp.media_crc as u32;
            if local_checksum != media_crc {
                emit_log(
                    app_handle,
                    task_id,
                    LEVEL_WARN,
                    &format!(
                        "Partition {partition_name} checksum mismatch: local=0x{local_checksum:x}, device=0x{media_crc:x}"
                    ),
                );
            } else {
                emit_log(
                    app_handle,
                    task_id,
                    LEVEL_INFO,
                    &format!("Partition {partition_name} verification successful"),
                );
            }
        } else {
            let message = verify_result
                .err()
                .map(|error| error.message)
                .unwrap_or_else(|| "failed".to_string());
            emit_log(
                app_handle,
                task_id,
                LEVEL_WARN,
                &format!("Partition {partition_name} verification failed: {message}"),
            );
        }
    }

    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        &format!("Partition {partition_name} download completed, {total_written} bytes written"),
    );

    Ok(DownloadPartitionResult {
        success: true,
        bytes_written: total_written,
        partition_name,
    })
}
