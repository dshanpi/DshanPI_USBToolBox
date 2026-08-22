use crate::efex::error::EfexError;
use crate::efex::function::EfexFunction;
use log::{debug, warn};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::time::Duration;

use super::super::*;
use super::parser::ParseDownloadContext;
use super::utils::EFEX_CRC32_VALID_FLAG;
use super::{sparse_format_probe, SparseParser};

pub(in crate::flash::task) async fn download_sparse_partition<R: Runtime>(
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
        &format!("Starting sparse partition download: {partition_name}"),
    );

    file.seek(SeekFrom::Start(data_offset))
        .map_err(|error| EfexError {
            code: -1,
            name: "FileSeek".to_string(),
            message: format!("Failed to seek file offset: {error}"),
        })?;

    let mut header_buf = vec![0u8; SPARSE_HEADER_SIZE];
    file.read_exact(&mut header_buf)
        .map_err(|error| EfexError {
            code: -1,
            name: "FileRead".to_string(),
            message: format!("Failed to read sparse header: {error}"),
        })?;

    let sparse_header = sparse_format_probe(&header_buf)?;
    emit_log(
        app_handle,
        task_id,
        LEVEL_INFO,
        &format!(
            "Sparse image: block_size={}, total_blocks={}, total_chunks={}",
            sparse_header.blk_sz, sparse_header.total_blks, sparse_header.total_chunks
        ),
    );

    let mut parser = SparseParser::new(
        handle,
        sparse_header.blk_sz,
        partition.address as u32,
        partition_info.need_verify,
    );

    let buffer_size = 256 * 1024usize;
    let mut buffer = vec![0u8; buffer_size];

    let first_read_size = std::cmp::min(buffer_size, data_length as usize);
    file.seek(SeekFrom::Start(data_offset))
        .map_err(|error| EfexError {
            code: -1,
            name: "FileSeek".to_string(),
            message: format!("Failed to seek file offset: {error}"),
        })?;

    let mut read_buf = vec![0u8; first_read_size];
    file.read_exact(&mut read_buf).map_err(|error| EfexError {
        code: -1,
        name: "FileRead".to_string(),
        message: format!("Failed to read initial data: {error}"),
    })?;

    parser
        .parse_and_download(
            ParseDownloadContext {
                app_handle,
                task_id,
                progress,
                partition_name: &partition_name,
                partition_total_bytes: data_length,
            },
            &read_buf,
            first_read_size,
        )
        .await?;

    let mut left_len = data_length as i64 - first_read_size as i64;
    while left_len >= buffer_size as i64 {
        check_cancelled()?;

        file.read_exact(&mut buffer).map_err(|error| EfexError {
            code: -1,
            name: "FileRead".to_string(),
            message: format!("Failed to read data chunk: {error}"),
        })?;

        parser
            .parse_and_download(
                ParseDownloadContext {
                    app_handle,
                    task_id,
                    progress,
                    partition_name: &partition_name,
                    partition_total_bytes: data_length,
                },
                &buffer,
                buffer_size,
            )
            .await?;

        left_len -= buffer_size as i64;
    }

    if left_len > 0 {
        let remaining = left_len as usize;
        let mut remaining_buf = vec![0u8; remaining];
        file.read_exact(&mut remaining_buf)
            .map_err(|error| EfexError {
                code: -1,
                name: "FileRead".to_string(),
                message: format!("Failed to read remaining data: {error}"),
            })?;

        parser
            .parse_and_download(
                ParseDownloadContext {
                    app_handle,
                    task_id,
                    progress,
                    partition_name: &partition_name,
                    partition_total_bytes: data_length,
                },
                &remaining_buf,
                remaining,
            )
            .await?;
    }

    if parser.need_verify() {
        emit_log(
            app_handle,
            task_id,
            LEVEL_INFO,
            &format!("Verifying final chunk for partition {partition_name}"),
        );
        emit_download_progress(
            progress,
            &format!("Verifying {partition_name}"),
            &partition_name,
            parser.total_written(),
            data_length,
        );

        let (sector, size) = parser.rawdata_info();
        let local_checksum = parser.checksum();
        let verify_timeout =
            Duration::from_secs((size as f64 / (1024.0 * 1024.0) * 4.0).clamp(10.0, 120.0) as u64);

        let verify_result = run_device_blocking_with_timeout(
            handle,
            verify_timeout,
            &format!("Timed out while verifying {partition_name}"),
            move || {
                let func = EfexFunction::new(handle);
                func.fes_verify_value(sector, size)
            },
        )
        .await;

        match verify_result {
            Ok(result) if result.flag == EFEX_CRC32_VALID_FLAG => {
                let device_crc = result.media_crc as u32;
                if local_checksum != device_crc {
                    warn!(
                        "Partition {} checksum mismatch: local=0x{:08x}, device=0x{:08x}",
                        partition_name, local_checksum, device_crc
                    );
                    emit_log(
                        app_handle,
                        task_id,
                        LEVEL_WARN,
                        &format!(
                            "Partition {partition_name} checksum mismatch: local=0x{local_checksum:08x}, device=0x{device_crc:08x}"
                        ),
                    );
                } else {
                    emit_log(
                        app_handle,
                        task_id,
                        LEVEL_INFO,
                        &format!("Partition {partition_name} verification passed"),
                    );
                }
            }
            Ok(_) => {
                emit_log(
                    app_handle,
                    task_id,
                    LEVEL_WARN,
                    &format!("Partition {partition_name} verification failed: invalid CRC flag"),
                );
            }
            Err(error) => {
                emit_log(
                    app_handle,
                    task_id,
                    LEVEL_WARN,
                    &format!(
                        "Partition {partition_name} verification error: {}",
                        error.message
                    ),
                );
            }
        }
    }

    let total_written = parser.total_written();
    debug!(
        "Sparse partition {} download completed, {} bytes written",
        partition_name, total_written
    );
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
