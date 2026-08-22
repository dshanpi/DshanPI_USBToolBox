use log::{debug, error, info, warn};
use std::fs::File;
use std::io::{Cursor, Seek, SeekFrom, Write};
use std::path::Path;
use tauri::{AppHandle, Emitter, Runtime};

use crate::diskpart::gpt::{
    modify_backup_gpt_in_place, modify_gpt_header_in_place, GPT_MIN_HEADER_SIZE, SECTOR_SIZE,
};
use crate::packer::tools::{
    build_partition_subtype, extract_file_data, find_file_by_subtype, parse_image,
};
use crate::packer::types::{
    EmmcUfsMergeConfig, EmmcUfsMergeResult, PackerLogEvent, PackerProgressEvent,
};

const BUFFER_SIZE: usize = 8 * 1024;
const MBR_SIZE: u64 = 64 * 1024;

const BOOT0_OFFSET: u64 = 16 * 512;
const BOOT0_BACKUP_DEFAULT_SECTOR: u64 = 256;
const UBOOT_OFFSET: u64 = 24576 * 512;
const UBOOT_BACKUP_OFFSET: u64 = 32800 * 512;

const SPARSE_HEADER_MAGIC: u32 = 0xED26FF3A;

fn align_up(value: u64, alignment: u64) -> Result<u64, String> {
    if alignment == 0 {
        return Err("Alignment must not be zero".to_string());
    }
    value
        .checked_add(alignment - 1)
        .map(|adjusted| adjusted / alignment * alignment)
        .ok_or_else(|| "Aligned firmware size overflow".to_string())
}

fn is_sparse_image(data: &[u8]) -> bool {
    if data.len() < 28 {
        return false;
    }
    let magic = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    magic == SPARSE_HEADER_MAGIC
}

fn write_sparse_to_file<R: Runtime, W: Write + Seek>(
    data: &[u8],
    dest: &mut W,
    max_output_size: u64,
    app_handle: &AppHandle<R>,
    progress_ctx: &mut ProgressContext,
) -> Result<u64, String> {
    let mut cursor = Cursor::new(data);
    let reader = android_sparse::Reader::new(&mut cursor)
        .map_err(|e| format!("Failed to create sparse reader: {}", e))?;

    let mut decoder = android_sparse::Decoder::new(dest)
        .map_err(|e| format!("Failed to create decoder: {}", e))?;

    let mut total_written: u64 = 0;
    const BLOCK_SIZE: u64 = 4096;

    for block_result in reader {
        let block = block_result.map_err(|e| format!("Failed to read sparse block: {}", e))?;
        let block_size = match &block {
            android_sparse::Block::Raw(_) => BLOCK_SIZE,
            android_sparse::Block::Fill(_) => BLOCK_SIZE,
            android_sparse::Block::Skip => BLOCK_SIZE,
            android_sparse::Block::Crc32(_) => 0,
        };
        let next_written = total_written
            .checked_add(block_size)
            .ok_or_else(|| "Sparse output size overflow".to_string())?;
        if next_written > max_output_size {
            return Err(format!(
                "Sparse output exceeds destination: {next_written} bytes (maximum {max_output_size})"
            ));
        }
        decoder
            .write_block(&block)
            .map_err(|e| format!("Failed to decode sparse block: {}", e))?;

        total_written = next_written;
        progress_ctx.written_bytes = progress_ctx
            .written_bytes
            .checked_add(block_size)
            .ok_or_else(|| "Progress byte count overflow".to_string())?;

        if progress_ctx.should_update_progress() {
            progress_ctx.emit_progress(app_handle);
        }
    }

    Ok(total_written)
}

fn log_and_emit<R: Runtime>(app_handle: &AppHandle<R>, level: &str, message: &str) {
    match level {
        "error" => error!("{}", message),
        "warn" => warn!("{}", message),
        "info" => info!("{}", message),
        _ => debug!("{}", message),
    }
    let _ = app_handle.emit(
        "packer-log",
        PackerLogEvent {
            level: level.to_string(),
            message: message.to_string(),
        },
    );
}

fn emit_progress<R: Runtime>(
    app_handle: &AppHandle<R>,
    stage: &str,
    current: u64,
    total: u64,
    message: &str,
) {
    debug!("Progress: {} - {}/{} - {}", stage, current, total, message);
    let _ = app_handle.emit(
        "packer-progress",
        PackerProgressEvent {
            stage: stage.to_string(),
            current,
            total,
            message: message.to_string(),
        },
    );
}

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

fn parse_storage_size(size_str: &str) -> Option<u64> {
    let size_str = size_str.trim().to_lowercase();

    if size_str == "auto" || size_str.is_empty() {
        return None;
    }

    let (num_part, multiplier) = if size_str.ends_with("gb") {
        (&size_str[..size_str.len() - 2], 1024u64 * 1024 * 1024)
    } else if size_str.ends_with("mb") {
        (&size_str[..size_str.len() - 2], 1024u64 * 1024)
    } else if size_str.ends_with("kb") {
        (&size_str[..size_str.len() - 2], 1024u64)
    } else if size_str.ends_with('g') {
        (&size_str[..size_str.len() - 1], 1024u64 * 1024 * 1024)
    } else if size_str.ends_with('m') {
        (&size_str[..size_str.len() - 1], 1024u64 * 1024)
    } else if size_str.ends_with('k') {
        (&size_str[..size_str.len() - 1], 1024u64)
    } else {
        (size_str.as_str(), 1u64)
    };

    num_part
        .trim()
        .parse::<u64>()
        .ok()
        .and_then(|n| n.checked_mul(multiplier))
}

fn get_boot0_subtype(flash_type: &str) -> &'static str {
    match flash_type.to_lowercase().as_str() {
        "nand" => "BOOT0_0000000000",
        "ufs" => "1234567890BUFS_0",
        _ => "1234567890BOOT_0",
    }
}

fn get_toc0_subtype(flash_type: &str) -> &'static str {
    match flash_type.to_lowercase().as_str() {
        "nand" => "TOC0_NAND0000000",
        "ufs" => "TOC0_UFS00000000",
        _ => "TOC0_SDCARD00000",
    }
}

const TOC1_SUBTYPE: &str = "TOC1_00000000000";
const BOOTPKG_SUBTYPE: &str = "BOOTPKG-00000000";

struct ProgressContext {
    total_bytes: u64,
    written_bytes: u64,
    current_stage: String,
    last_update: std::time::Instant,
}

impl ProgressContext {
    fn new(total_bytes: u64) -> Self {
        Self {
            total_bytes,
            written_bytes: 0,
            current_stage: String::new(),
            last_update: std::time::Instant::now(),
        }
    }

    fn set_stage(&mut self, stage: &str) {
        self.current_stage = stage.to_string();
    }

    fn should_update_progress(&self) -> bool {
        self.last_update.elapsed().as_millis() >= 100
    }

    fn emit_progress<R: Runtime>(&mut self, app_handle: &AppHandle<R>) {
        self.last_update = std::time::Instant::now();
        let percent = if self.total_bytes > 0 {
            (self.written_bytes as f64 / self.total_bytes as f64 * 100.0) as u64
        } else {
            0
        };
        let message = format!(
            "{} - {} / {} ({}%)",
            self.current_stage,
            format_size(self.written_bytes),
            format_size(self.total_bytes),
            percent
        );
        emit_progress(
            app_handle,
            &self.current_stage,
            self.written_bytes,
            self.total_bytes,
            &message,
        );
    }

    fn emit_final_progress<R: Runtime>(&mut self, app_handle: &AppHandle<R>) {
        self.last_update = std::time::Instant::now();
        let message = format!("Completed - {} (100%)", format_size(self.total_bytes));
        emit_progress(
            app_handle,
            "done",
            self.total_bytes,
            self.total_bytes,
            &message,
        );
    }
}

fn fill_file_data<R: Runtime>(
    dest: &mut File,
    fill_size: u64,
    app_handle: &AppHandle<R>,
    progress_ctx: &mut ProgressContext,
) -> Result<(), String> {
    if fill_size == 0 {
        return Ok(());
    }

    let buffer = vec![0u8; BUFFER_SIZE];
    let mut remaining = fill_size;

    while remaining > 0 {
        let write_size = std::cmp::min(remaining, BUFFER_SIZE as u64) as usize;
        dest.write_all(&buffer[..write_size])
            .map_err(|e| format!("Failed to fill data: {}", e))?;
        remaining -= write_size as u64;

        progress_ctx.written_bytes += write_size as u64;
        if progress_ctx.should_update_progress() {
            progress_ctx.emit_progress(app_handle);
        }
    }

    Ok(())
}

fn write_data_at_offset<R: Runtime>(
    dest: &mut File,
    offset: u64,
    data: &[u8],
    app_handle: &AppHandle<R>,
    progress_ctx: &mut ProgressContext,
) -> Result<(), String> {
    dest.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Failed to seek to offset {}: {}", offset, e))?;
    dest.write_all(data)
        .map_err(|e| format!("Failed to write data at offset {}: {}", offset, e))?;

    progress_ctx.written_bytes += data.len() as u64;
    if progress_ctx.should_update_progress() {
        progress_ctx.emit_progress(app_handle);
    }

    Ok(())
}

fn write_data_at_offset_streaming<R: Runtime>(
    dest: &mut File,
    offset: u64,
    data: &[u8],
    is_sparse: bool,
    max_output_size: u64,
    app_handle: &AppHandle<R>,
    progress_ctx: &mut ProgressContext,
) -> Result<u64, String> {
    dest.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Failed to seek to offset {}: {}", offset, e))?;

    if is_sparse {
        write_sparse_to_file(data, dest, max_output_size, app_handle, progress_ctx)
    } else {
        if data.len() as u64 > max_output_size {
            return Err(format!(
                "Data exceeds destination: {} bytes (maximum {max_output_size})",
                data.len()
            ));
        }
        dest.write_all(data)
            .map_err(|e| format!("Failed to write data at offset {}: {}", offset, e))?;
        progress_ctx.written_bytes += data.len() as u64;
        if progress_ctx.should_update_progress() {
            progress_ctx.emit_progress(app_handle);
        }
        Ok(data.len() as u64)
    }
}

struct FirmwareLoader<'a, R: Runtime> {
    firmware_file: &'a mut File,
    file_entries: &'a [crate::packer::tools::utils::FileEntry],
    output_file: &'a mut File,
    app_handle: &'a AppHandle<R>,
    progress_ctx: &'a mut ProgressContext,
}

impl<'a, R: Runtime> FirmwareLoader<'a, R> {
    fn load_firmware_component(
        &mut self,
        name: &str,
        subtype: &str,
        primary_offset: u64,
        backup_offset: u64,
    ) -> Result<bool, String> {
        self.progress_ctx.set_stage(&format!("Loading {}", name));
        self.progress_ctx.emit_progress(self.app_handle);

        if let Some(entry) = find_file_by_subtype(self.file_entries, subtype) {
            match extract_file_data(self.firmware_file, entry) {
                Ok(data) => {
                    let is_sparse = is_sparse_image(&data);
                    if is_sparse {
                        log_and_emit(
                            self.app_handle,
                            "info",
                            &format!("{} is sparse, streaming to raw...", name),
                        );
                    }

                    let max_component_size = backup_offset.checked_sub(primary_offset).ok_or_else(|| {
                        format!("Invalid {name} slot offsets: primary={primary_offset}, backup={backup_offset}")
                    })?;
                    let written = write_data_at_offset_streaming(
                        self.output_file,
                        primary_offset,
                        &data,
                        is_sparse,
                        max_component_size,
                        self.app_handle,
                        self.progress_ctx,
                    )?;

                    log_and_emit(
                        self.app_handle,
                        "info",
                        &format!(
                            "{} loaded: {} bytes at sector {} (offset {})",
                            name,
                            written,
                            primary_offset / 512,
                            primary_offset
                        ),
                    );

                    write_data_at_offset_streaming(
                        self.output_file,
                        backup_offset,
                        &data,
                        is_sparse,
                        max_component_size,
                        self.app_handle,
                        self.progress_ctx,
                    )?;
                    log_and_emit(
                        self.app_handle,
                        "info",
                        &format!(
                            "{} backup written at sector {} (offset {})",
                            name,
                            backup_offset / 512,
                            backup_offset
                        ),
                    );
                    return Ok(true);
                }
                Err(e) => {
                    log_and_emit(
                        self.app_handle,
                        "warn",
                        &format!("Failed to extract {}: {}", name, e),
                    );
                }
            }
        } else {
            log_and_emit(
                self.app_handle,
                "warn",
                &format!("{} not found in firmware (subtype: {})", name, subtype),
            );
        }
        Ok(false)
    }
}

pub fn merge_emmc_ufs_firmware<R: Runtime>(
    app_handle: &AppHandle<R>,
    config: EmmcUfsMergeConfig,
) -> Result<EmmcUfsMergeResult, String> {
    log_and_emit(app_handle, "info", "Starting firmware merge...");
    log_and_emit(
        app_handle,
        "info",
        &format!("Output file: {}", config.output_path),
    );

    debug!(
        "Config: output={}, logic_offset={} sectors, flash_type={}, is_secure={}",
        config.output_path,
        config.logic_offset / 512,
        config.flash_type,
        config.is_secure
    );
    log_and_emit(
        app_handle,
        "info",
        &format!(
            "Config: flash_type={}, logic_offset={} sectors, is_secure={}",
            config.flash_type,
            config.logic_offset / 512,
            config.is_secure
        ),
    );

    let firmware_path = Path::new(&config.firmware_path);
    if !firmware_path.exists() {
        let err = format!("Firmware file does not exist: {}", config.firmware_path);
        log_and_emit(app_handle, "error", &err);
        return Err(err);
    }

    log_and_emit(app_handle, "info", "Opening firmware file...");
    let mut firmware_file = File::open(firmware_path).map_err(|e| {
        let err = format!("Failed to open firmware file: {}", e);
        log_and_emit(app_handle, "error", &err);
        err
    })?;

    log_and_emit(app_handle, "info", "Parsing image...");
    let (image_header, file_entries) = parse_image(&mut firmware_file)?;
    log_and_emit(
        app_handle,
        "info",
        &format!("Parsed image: {} files", image_header.num_files),
    );

    let total_bytes = config
        .partitions
        .iter()
        .try_fold(0u64, |total, partition| {
            total
                .checked_add(partition.size)
                .ok_or_else(|| "Total partition size overflow".to_string())
        })?;
    let mut progress_ctx = ProgressContext::new(total_bytes);
    log_and_emit(
        app_handle,
        "info",
        &format!("Total data to process: {}", format_size(total_bytes)),
    );

    let output_path = Path::new(&config.output_path);
    let mut output_file = File::create(output_path).map_err(|e| {
        let err = format!("Failed to create output file: {}", e);
        log_and_emit(app_handle, "error", &err);
        err
    })?;

    let mut loader = FirmwareLoader {
        firmware_file: &mut firmware_file,
        file_entries: &file_entries,
        output_file: &mut output_file,
        app_handle,
        progress_ctx: &mut progress_ctx,
    };

    if config.is_secure {
        log_and_emit(app_handle, "info", "Secure firmware mode: using TOC0/TOC1");
        let toc0_subtype = get_toc0_subtype(&config.flash_type);
        loader.load_firmware_component(
            "TOC0",
            toc0_subtype,
            BOOT0_OFFSET,
            BOOT0_BACKUP_DEFAULT_SECTOR * 512,
        )?;
        loader.load_firmware_component("TOC1", TOC1_SUBTYPE, UBOOT_OFFSET, UBOOT_BACKUP_OFFSET)?;
    } else {
        log_and_emit(
            app_handle,
            "info",
            "Normal firmware mode: using Boot0/BOOTPKG",
        );
        let boot0_subtype = get_boot0_subtype(&config.flash_type);
        loader.load_firmware_component(
            "Boot0",
            boot0_subtype,
            BOOT0_OFFSET,
            BOOT0_BACKUP_DEFAULT_SECTOR * 512,
        )?;
        loader.load_firmware_component(
            "BOOTPKG",
            BOOTPKG_SUBTYPE,
            UBOOT_OFFSET,
            UBOOT_BACKUP_OFFSET,
        )?;
    }

    progress_ctx.set_stage("Loading GPT/MBR");
    progress_ctx.emit_progress(app_handle);

    let has_gpt = find_file_by_subtype(&file_entries, "1234567890___GPT").is_some();
    let has_mbr = find_file_by_subtype(&file_entries, "1234567890___MBR").is_some();

    let partition_start_offset = config
        .logic_offset
        .checked_add(MBR_SIZE)
        .ok_or_else(|| "Partition start offset overflow".to_string())?;
    let mut partition_offset = partition_start_offset;
    for partition in &config.partitions {
        partition_offset = partition_offset
            .checked_add(partition.size)
            .ok_or_else(|| format!("Partition {} offset overflow", partition.name))?;
    }
    let total_firmware_size = partition_offset;
    let aligned_firmware_size = align_up(total_firmware_size, SECTOR_SIZE)?;

    let gpt_target_size = match config.storage_size.as_ref() {
        Some(size_str) => match parse_storage_size(size_str) {
            Some(specified_size) if specified_size >= aligned_firmware_size => {
                log_and_emit(
                    app_handle,
                    "info",
                    &format!("Storage size: {} (specified)", format_size(specified_size)),
                );
                specified_size
            }
            Some(specified_size) => {
                log_and_emit(
                    app_handle,
                    "warn",
                    &format!(
                        "Specified size {} is smaller than firmware, using firmware size",
                        format_size(specified_size)
                    ),
                );
                aligned_firmware_size
            }
            None => {
                log_and_emit(
                    app_handle,
                    "info",
                    &format!(
                        "Storage size: {} (auto)",
                        format_size(aligned_firmware_size)
                    ),
                );
                aligned_firmware_size
            }
        },
        None => {
            log_and_emit(
                app_handle,
                "info",
                &format!(
                    "Total firmware size: {}",
                    format_size(aligned_firmware_size)
                ),
            );
            aligned_firmware_size
        }
    };

    info!(
        "Calculated total firmware size: {} bytes (aligned: {})",
        total_firmware_size, aligned_firmware_size
    );

    if has_gpt {
        log_and_emit(app_handle, "info", "Loading GPT...");
        if let Some(gpt_entry) = find_file_by_subtype(&file_entries, "1234567890___GPT") {
            match extract_file_data(&mut firmware_file, gpt_entry) {
                Ok(data) => {
                    if data.len() > MBR_SIZE as usize {
                        return Err(format!(
                            "GPT data is too large: {} bytes (maximum {})",
                            data.len(),
                            MBR_SIZE
                        ));
                    }
                    let mut gpt_data = data;
                    if gpt_data.len() < GPT_MIN_HEADER_SIZE {
                        return Err(format!("GPT data too small: {} bytes", gpt_data.len()));
                    }
                    let new_lba = modify_gpt_header_in_place(&mut gpt_data, gpt_target_size)?;
                    log_and_emit(
                        app_handle,
                        "info",
                        &format!(
                            "GPT last_usable_lba adjusted to {} for target size",
                            new_lba
                        ),
                    );

                    write_data_at_offset(
                        &mut output_file,
                        0,
                        &gpt_data,
                        app_handle,
                        &mut progress_ctx,
                    )?;
                    log_and_emit(
                        app_handle,
                        "info",
                        &format!(
                            "GPT loaded: {} bytes at sector 0 (offset 0)",
                            gpt_data.len()
                        ),
                    );

                    let gpt_backup_offset = config.logic_offset;
                    let mut backup_gpt_data = gpt_data.clone();
                    modify_backup_gpt_in_place(&mut backup_gpt_data, gpt_target_size, &gpt_data)?;

                    write_data_at_offset(
                        &mut output_file,
                        gpt_backup_offset,
                        &backup_gpt_data,
                        app_handle,
                        &mut progress_ctx,
                    )?;
                    log_and_emit(
                        app_handle,
                        "info",
                        &format!(
                            "GPT backup written at sector {} (offset {})",
                            gpt_backup_offset / 512,
                            gpt_backup_offset
                        ),
                    );
                }
                Err(e) => {
                    return Err(format!("Failed to extract GPT: {e}"));
                }
            }
        }
    } else if has_mbr {
        log_and_emit(app_handle, "info", "Loading MBR...");
        if let Some(mbr_entry) = find_file_by_subtype(&file_entries, "1234567890___MBR") {
            match extract_file_data(&mut firmware_file, mbr_entry) {
                Ok(data) => {
                    let mbr_data = &data[..data.len().min(MBR_SIZE as usize)];
                    let mbr_offset = config.logic_offset;
                    write_data_at_offset(
                        &mut output_file,
                        mbr_offset,
                        mbr_data,
                        app_handle,
                        &mut progress_ctx,
                    )?;
                    log_and_emit(
                        app_handle,
                        "info",
                        &format!(
                            "MBR loaded: {} bytes at sector {} (offset {})",
                            mbr_data.len(),
                            mbr_offset / 512,
                            mbr_offset
                        ),
                    );
                }
                Err(e) => {
                    return Err(format!("Failed to extract MBR: {e}"));
                }
            }
        }
    } else {
        log_and_emit(app_handle, "warn", "GPT/MBR not found in firmware");
    }

    let mut partition_offset = partition_start_offset;
    let mut max_written_offset: u64 = 0;

    log_and_emit(
        app_handle,
        "info",
        &format!("Processing {} partitions...", config.partitions.len()),
    );

    for (idx, partition) in config.partitions.iter().enumerate() {
        progress_ctx.set_stage(&format!(
            "Partition {}/{}: {}",
            idx + 1,
            config.partitions.len(),
            partition.name
        ));
        progress_ctx.emit_progress(app_handle);

        if partition.download_file.is_empty() {
            debug!(
                "Partition {} has no download file, skipping",
                partition.name
            );
            partition_offset = partition_offset
                .checked_add(partition.size)
                .ok_or_else(|| format!("Partition {} offset overflow", partition.name))?;
            progress_ctx.written_bytes = progress_ctx
                .written_bytes
                .checked_add(partition.size)
                .ok_or_else(|| "Progress byte count overflow".to_string())?;
            continue;
        }

        let partition_subtype = build_partition_subtype(&partition.download_file);

        if let Some(partition_entry) = find_file_by_subtype(&file_entries, &partition_subtype) {
            match extract_file_data(&mut firmware_file, partition_entry) {
                Ok(data) => {
                    let is_sparse = is_sparse_image(&data);
                    if !is_sparse && data.len() as u64 > partition.size {
                        return Err(format!(
                            "Partition {} file size ({}) exceeds partition size ({})",
                            partition.name,
                            data.len(),
                            partition.size
                        ));
                    }
                    if is_sparse {
                        log_and_emit(
                            app_handle,
                            "info",
                            &format!(
                                "Partition {} is sparse, streaming to raw...",
                                partition.name
                            ),
                        );
                    }

                    let offset = partition_offset;
                    let written = write_data_at_offset_streaming(
                        &mut output_file,
                        offset,
                        &data,
                        is_sparse,
                        partition.size,
                        app_handle,
                        &mut progress_ctx,
                    )?;

                    let partition_size = partition.size;
                    if written > partition_size {
                        return Err(format!(
                            "Partition {} expanded size {} exceeds partition size {}",
                            partition.name, written, partition_size
                        ));
                    }

                    let end_offset = offset.checked_add(written).ok_or_else(|| {
                        format!("Partition {} end offset overflow", partition.name)
                    })?;
                    if end_offset > max_written_offset {
                        max_written_offset = end_offset;
                    }

                    log_and_emit(
                        app_handle,
                        "info",
                        &format!(
                            "Partition {} loaded: {} bytes at sector {} (offset {})",
                            partition.name,
                            written,
                            offset / 512,
                            offset
                        ),
                    );
                }
                Err(e) => {
                    return Err(format!(
                        "Failed to extract partition {}: {e}",
                        partition.name
                    ));
                }
            }
        } else {
            return Err(format!(
                "Partition file not found: {} -> {}",
                partition.name, partition.download_file
            ));
        }

        partition_offset = partition_offset
            .checked_add(partition.size)
            .ok_or_else(|| format!("Partition {} offset overflow", partition.name))?;
    }

    progress_ctx.set_stage("Finalizing");
    progress_ctx.emit_progress(app_handle);

    let total_size = partition_offset;
    let aligned_size = align_up(total_size, SECTOR_SIZE)?;

    let current_file_size = output_file
        .metadata()
        .map_err(|e| format!("Failed to get file metadata: {}", e))?
        .len();

    if aligned_size > current_file_size {
        output_file
            .seek(SeekFrom::End(0))
            .map_err(|e| format!("Failed to seek to end: {}", e))?;
        let fill_size = aligned_size - current_file_size;
        fill_file_data(&mut output_file, fill_size, app_handle, &mut progress_ctx)?;
    }

    output_file.flush().map_err(|e| {
        let err = format!("Failed to flush output file: {}", e);
        log_and_emit(app_handle, "error", &err);
        err
    })?;

    log_and_emit(
        app_handle,
        "info",
        &format!("Firmware merge completed: {} bytes", aligned_size),
    );
    progress_ctx.emit_final_progress(app_handle);

    Ok(EmmcUfsMergeResult {
        success: true,
        message: format!("Successfully created firmware: {} bytes", aligned_size),
        output_size: aligned_size,
    })
}
