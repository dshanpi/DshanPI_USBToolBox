use crate::efex::error::EfexError;
use crate::efex::function::EfexFunction;
use crate::efex::types::FesDataType;
use log::error;
use std::time::Duration;

use super::super::*;
use super::utils::{
    add_sum, ALIGNMENT_SIZE, EFEX_CRC32_VALID_FLAG, MAX_FILL_COUNT, MIN_DOWNLOAD_SIZE, SECTOR_SIZE,
};
use super::{LastChunkType, ParseState, SparseParser};

pub(super) struct ParseDownloadContext<'a, R: Runtime> {
    pub(super) app_handle: &'a AppHandle<R>,
    pub(super) task_id: u64,
    pub(super) progress: &'a DownloadProgressContext<R>,
    pub(super) partition_name: &'a str,
    pub(super) partition_total_bytes: u64,
}

impl SparseParser {
    pub(super) fn new(
        handle: u32,
        block_size: u32,
        start_sector: u32,
        verify_enabled: bool,
    ) -> Self {
        Self {
            handle,
            state: ParseState::TotalHead,
            last_chunk_type: LastChunkType::Undefine,
            block_size,
            chunk_length: 0,
            flash_sector: start_sector,
            last_rest_size: 0,
            last_rest_data: Vec::new(),
            rawdata_start_sector: start_sector,
            rawdata_size: 0,
            checksum: 0,
            verify_enabled,
            total_written: 0,
        }
    }

    pub(super) fn checksum(&self) -> u32 {
        self.checksum
    }

    pub(super) fn rawdata_info(&self) -> (u32, u64) {
        (self.rawdata_start_sector, self.rawdata_size)
    }

    pub(super) fn need_verify(&self) -> bool {
        self.verify_enabled && self.last_chunk_type == LastChunkType::Raw && self.rawdata_size > 0
    }

    pub(super) fn total_written(&self) -> u64 {
        self.total_written
    }

    pub(super) async fn parse_and_download<R: Runtime>(
        &mut self,
        ctx: ParseDownloadContext<'_, R>,
        buffer: &[u8],
        length: usize,
    ) -> Result<(), EfexError> {
        let combined_data: Vec<u8>;
        let work_buffer: &[u8];
        let mut offset = 0usize;

        if self.last_rest_size > 0 && !self.last_rest_data.is_empty() {
            combined_data = [self.last_rest_data.as_slice(), &buffer[..length]].concat();
            work_buffer = &combined_data;
        } else {
            work_buffer = buffer;
        }

        let mut this_rest_size = self.last_rest_size + length;
        self.last_rest_size = 0;
        self.last_rest_data.clear();

        while this_rest_size > 0 {
            match self.state {
                ParseState::TotalHead => {
                    if this_rest_size < SPARSE_HEADER_SIZE {
                        self.save_rest_data(work_buffer, offset, this_rest_size);
                        return Ok(());
                    }

                    this_rest_size -= SPARSE_HEADER_SIZE;
                    offset += SPARSE_HEADER_SIZE;
                    self.state = ParseState::ChunkHead;
                }
                ParseState::ChunkHead => {
                    if this_rest_size < CHUNK_HEADER_SIZE {
                        self.save_rest_data(work_buffer, offset, this_rest_size);
                        return Ok(());
                    }

                    let chunk =
                        ChunkHeader::from_bytes(&work_buffer[offset..]).ok_or_else(|| {
                            error!("Failed to parse chunk header");
                            EfexError {
                                code: -1,
                                name: "SparseParse".to_string(),
                                message: "Failed to parse chunk header".to_string(),
                            }
                        })?;

                    offset += CHUNK_HEADER_SIZE;
                    this_rest_size -= CHUNK_HEADER_SIZE;
                    self.chunk_length = chunk.chunk_sz * self.block_size;

                    if self.verify_enabled
                        && self.last_chunk_type == LastChunkType::Raw
                        && chunk.chunk_type != CHUNK_TYPE_RAW
                        && self.rawdata_size > 0
                    {
                        emit_log(
                            ctx.app_handle,
                            ctx.task_id,
                            LEVEL_INFO,
                            &format!(
                                "Verifying previous RAW chunk at sector 0x{:x}, size {} bytes",
                                self.rawdata_start_sector, self.rawdata_size
                            ),
                        );
                        self.verify_last_chunk(ctx.app_handle, ctx.task_id).await?;
                    }

                    match chunk.chunk_type {
                        CHUNK_TYPE_RAW => {
                            if chunk.total_sz != self.chunk_length + CHUNK_HEADER_SIZE as u32 {
                                return Err(EfexError {
                                    code: -1,
                                    name: "SparseParse".to_string(),
                                    message: "Invalid RAW chunk size".to_string(),
                                });
                            }

                            if self.last_chunk_type != LastChunkType::Raw {
                                self.checksum = 0;
                                self.rawdata_start_sector = self.flash_sector;
                                self.rawdata_size = 0;
                            }

                            emit_log(
                                ctx.app_handle,
                                ctx.task_id,
                                LEVEL_INFO,
                                &format!(
                                    "Downloading RAW chunk at sector 0x{:x}, size {} bytes",
                                    self.flash_sector, self.chunk_length
                                ),
                            );

                            self.state = ParseState::ChunkData;
                            self.last_chunk_type = LastChunkType::Raw;
                        }
                        CHUNK_TYPE_FILL => {
                            if chunk.total_sz != CHUNK_HEADER_SIZE as u32 + 4 {
                                return Err(EfexError {
                                    code: -1,
                                    name: "SparseParse".to_string(),
                                    message: "Invalid FILL chunk size".to_string(),
                                });
                            }

                            self.state = ParseState::ChunkFillData;
                            self.last_chunk_type = LastChunkType::Fill;
                        }
                        CHUNK_TYPE_DONT_CARE => {
                            if chunk.total_sz != CHUNK_HEADER_SIZE as u32 {
                                return Err(EfexError {
                                    code: -1,
                                    name: "SparseParse".to_string(),
                                    message: "Invalid DONT_CARE chunk size".to_string(),
                                });
                            }

                            emit_log(
                                ctx.app_handle,
                                ctx.task_id,
                                LEVEL_INFO,
                                &format!(
                                    "don't care chunk at sector 0x{:x}, size {} bytes, total written {} bytes",
                                    self.flash_sector, self.chunk_length, self.total_written
                                ),
                            );

                            self.flash_sector = self
                                .flash_sector
                                .wrapping_add(self.chunk_length / SECTOR_SIZE as u32);
                            self.state = ParseState::ChunkHead;
                            self.last_chunk_type = LastChunkType::DontCare;
                        }
                        _ => {
                            return Err(EfexError {
                                code: -1,
                                name: "SparseParse".to_string(),
                                message: format!("Unknown chunk type: 0x{:x}", chunk.chunk_type),
                            });
                        }
                    }
                }
                ParseState::ChunkData => {
                    let unenough_length = self.chunk_length.saturating_sub(this_rest_size as u32);

                    if unenough_length == 0 {
                        let data = &work_buffer[offset..offset + self.chunk_length as usize];
                        self.download_data(
                            ctx.progress,
                            data,
                            true,
                            ctx.partition_name,
                            ctx.partition_total_bytes,
                        )
                        .await?;
                        this_rest_size -= self.chunk_length as usize;
                        offset += self.chunk_length as usize;
                        self.chunk_length = 0;
                        self.state = ParseState::ChunkHead;
                    } else {
                        if this_rest_size < MIN_DOWNLOAD_SIZE {
                            self.save_rest_data(work_buffer, offset, this_rest_size);
                            return Ok(());
                        }

                        let download_size = if unenough_length < ALIGNMENT_SIZE as u32 {
                            this_rest_size + unenough_length as usize - ALIGNMENT_SIZE
                        } else {
                            this_rest_size & !(SECTOR_SIZE as usize - 1)
                        };

                        let data = &work_buffer[offset..offset + download_size];
                        self.download_data(
                            ctx.progress,
                            data,
                            true,
                            ctx.partition_name,
                            ctx.partition_total_bytes,
                        )
                        .await?;
                        offset += download_size;
                        self.chunk_length -= download_size as u32;
                        this_rest_size -= download_size;
                        self.save_rest_data(work_buffer, offset, this_rest_size);
                        return Ok(());
                    }
                }
                ParseState::ChunkFillData => {
                    if this_rest_size < 4 {
                        self.save_rest_data(work_buffer, offset, this_rest_size);
                        return Ok(());
                    }

                    let fill_value = u32::from_le_bytes([
                        work_buffer[offset],
                        work_buffer[offset + 1],
                        work_buffer[offset + 2],
                        work_buffer[offset + 3],
                    ]);

                    offset += 4;
                    this_rest_size -= 4;
                    self.process_fill_chunk(
                        ctx.progress,
                        fill_value,
                        ctx.partition_name,
                        ctx.partition_total_bytes,
                    )
                    .await?;
                    self.chunk_length = 0;
                    self.state = ParseState::ChunkHead;
                }
            }
        }

        Ok(())
    }

    fn save_rest_data(&mut self, work_buffer: &[u8], offset: usize, size: usize) {
        self.last_rest_size = size;
        self.last_rest_data = work_buffer[offset..offset + size].to_vec();
    }

    async fn download_data<R: Runtime>(
        &mut self,
        progress: &DownloadProgressContext<R>,
        data: &[u8],
        calc_checksum: bool,
        partition_name: &str,
        partition_total_bytes: u64,
    ) -> Result<(), EfexError> {
        let data_len = data.len() as u64;
        let total_written_before = self.total_written;
        let download_result = transfer_fes_bytes(
            progress,
            FesTransfer {
                handle: self.handle,
                addr: self.flash_sector,
                data: data.to_vec(),
                data_type: FesDataType::Flash,
                item_name: partition_name,
                progress_range: TransferProgressRange {
                    written_base: total_written_before,
                    total_bytes: partition_total_bytes,
                    stage_start_percent: 0.0,
                    stage_end_percent: 100.0,
                },
                timeout_secs: calculate_transfer_timeout_secs(data.len(), 30),
            },
        )
        .await
        .map_err(|error| EfexError {
            code: error.code,
            name: error.name,
            message: error.message,
        })?;

        self.flash_sector = self
            .flash_sector
            .wrapping_add((data_len / SECTOR_SIZE) as u32);
        self.total_written = self.total_written.saturating_add(download_result);

        if calc_checksum && self.verify_enabled {
            self.checksum = add_sum(data, self.checksum);
            self.rawdata_size = self.rawdata_size.saturating_add(data_len);
        }

        Ok(())
    }

    async fn process_fill_chunk<R: Runtime>(
        &mut self,
        progress: &DownloadProgressContext<R>,
        fill_value: u32,
        partition_name: &str,
        partition_total_bytes: u64,
    ) -> Result<(), EfexError> {
        let mut remaining = self.chunk_length as usize;
        while remaining > 0 {
            let count = ((remaining / 4) as u32).min(MAX_FILL_COUNT) as usize;
            let mut fill_data = Vec::with_capacity(count * 4);
            for _ in 0..count {
                fill_data.extend_from_slice(&fill_value.to_le_bytes());
            }

            self.download_data(
                progress,
                &fill_data,
                false,
                partition_name,
                partition_total_bytes,
            )
            .await?;
            remaining = remaining.saturating_sub(fill_data.len());
        }

        Ok(())
    }

    async fn verify_last_chunk<R: Runtime>(
        &mut self,
        app_handle: &AppHandle<R>,
        task_id: u64,
    ) -> Result<(), EfexError> {
        let sector = self.rawdata_start_sector;
        let size = self.rawdata_size;
        let handle = self.handle;
        let local_checksum = self.checksum;

        let verify_result = run_device_blocking_with_timeout(
            handle,
            Duration::from_secs((size as f64 / (1024.0 * 1024.0) * 4.0).clamp(10.0, 120.0) as u64),
            "Timed out while verifying RAW chunk",
            move || {
                let func = EfexFunction::new(handle);
                func.fes_verify_value(sector, size)
            },
        )
        .await;

        match verify_result {
            Ok(result) if result.flag == EFEX_CRC32_VALID_FLAG => {
                if result.media_crc as u32 != local_checksum {
                    emit_log(
                        app_handle,
                        task_id,
                        LEVEL_WARN,
                        &format!(
                            "RAW chunk verification mismatch: local=0x{local_checksum:08x}, device=0x{:08x}",
                            result.media_crc as u32
                        ),
                    );
                }
            }
            Ok(_) => {
                emit_log(
                    app_handle,
                    task_id,
                    LEVEL_WARN,
                    "RAW chunk verification failed: invalid CRC flag",
                );
            }
            Err(error) => {
                emit_log(
                    app_handle,
                    task_id,
                    LEVEL_WARN,
                    &format!("RAW chunk verification error: {}", error.message),
                );
            }
        }

        self.checksum = 0;
        self.rawdata_size = 0;
        self.rawdata_start_sector = self.flash_sector;
        Ok(())
    }
}
