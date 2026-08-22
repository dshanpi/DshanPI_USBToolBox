use log::{debug, error, info, warn};
use std::fs::File;
use std::io::Write;
use std::path::Path;

use crate::packer::tools::{
    build_partition_subtype, extract_file_data, find_file_by_subtype, parse_image,
};
use crate::packer::types::{SpinorMergeConfig, SpinorMergeResult};

const GPT_SIZE: u64 = 16 * 1024;
const MAX_NOR_IMAGE_SIZE: u64 = 512 * 1024 * 1024;

pub fn merge_spinor_firmware(config: SpinorMergeConfig) -> Result<SpinorMergeResult, String> {
    info!("Starting SPI NOR firmware merge...");
    debug!(
        "Config: output={}, logic_start={} sectors, uboot_start={} sectors, nor_size={} MB",
        config.output_path,
        config.logic_start / 512,
        config.uboot_start / 512,
        config.nor_size / (1024 * 1024)
    );

    if config.nor_size == 0 || config.nor_size > MAX_NOR_IMAGE_SIZE {
        return Err(format!(
            "NOR size must be between 1 byte and {} MiB",
            MAX_NOR_IMAGE_SIZE / (1024 * 1024)
        ));
    }
    let nor_size = usize::try_from(config.nor_size)
        .map_err(|_| "NOR size is not supported on this platform".to_string())?;

    let firmware_path = Path::new(&config.firmware_path);
    if !firmware_path.exists() {
        error!("Firmware file does not exist: {}", config.firmware_path);
        return Err(format!(
            "Firmware file does not exist: {}",
            config.firmware_path
        ));
    }

    let mut firmware_file = File::open(firmware_path).map_err(|e| {
        error!("Failed to open firmware file: {}", e);
        format!("Failed to open firmware file: {}", e)
    })?;

    let (image_header, file_entries) = parse_image(&mut firmware_file)?;
    info!("Parsed image: {} files", image_header.num_files);

    let mut output_buffer = Vec::new();
    output_buffer
        .try_reserve_exact(nor_size)
        .map_err(|e| format!("Cannot allocate {nor_size} bytes for NOR image: {e}"))?;
    output_buffer.resize(nor_size, 0xFF);

    if let Some(boot0_entry) = find_file_by_subtype(&file_entries, "1234567890BNOR_0") {
        match extract_file_data(&mut firmware_file, boot0_entry) {
            Ok(data) => {
                if data.len() > nor_size {
                    return Err("Boot0 exceeds NOR size".to_string());
                }
                output_buffer[0..data.len()].copy_from_slice(&data);
                info!("Boot0 NOR loaded: {} bytes at offset 0", data.len());
            }
            Err(e) => {
                return Err(format!("Failed to extract Boot0 NOR: {e}"));
            }
        }
    } else {
        warn!("Boot0 NOR not found in firmware");
    }

    if let Some(uboot_entry) = find_file_by_subtype(&file_entries, "BOOTPKG-NOR00000") {
        match extract_file_data(&mut firmware_file, uboot_entry) {
            Ok(data) => {
                let uboot_offset = usize::try_from(config.uboot_start)
                    .map_err(|_| "U-Boot offset is too large".to_string())?;
                let uboot_end = uboot_offset
                    .checked_add(data.len())
                    .ok_or_else(|| "U-Boot range overflow".to_string())?;
                if uboot_end > nor_size {
                    error!("U-Boot exceeds NOR size");
                    return Err("U-Boot exceeds NOR size".to_string());
                }
                output_buffer[uboot_offset..uboot_end].copy_from_slice(&data);
                info!(
                    "U-Boot NOR loaded: {} bytes at offset {}",
                    data.len(),
                    uboot_offset
                );
            }
            Err(e) => {
                return Err(format!("Failed to extract U-Boot NOR: {e}"));
            }
        }
    } else {
        warn!("U-Boot NOR not found in firmware");
    }

    if let Some(gpt_entry) = find_file_by_subtype(&file_entries, "1234567890___GPT") {
        match extract_file_data(&mut firmware_file, gpt_entry) {
            Ok(data) => {
                let gpt_offset = usize::try_from(config.logic_start)
                    .map_err(|_| "GPT offset is too large".to_string())?;
                let gpt_end = gpt_offset
                    .checked_add(data.len())
                    .ok_or_else(|| "GPT range overflow".to_string())?;
                if gpt_end > nor_size {
                    error!("GPT exceeds NOR size");
                    return Err("GPT exceeds NOR size".to_string());
                }
                output_buffer[gpt_offset..gpt_end].copy_from_slice(&data);
                info!("GPT loaded: {} bytes at offset {}", data.len(), gpt_offset);
            }
            Err(e) => {
                return Err(format!("Failed to extract GPT: {e}"));
            }
        }
    } else {
        warn!("GPT not found in firmware");
    }

    let mut partition_offset = config
        .logic_start
        .checked_add(GPT_SIZE)
        .ok_or_else(|| "Partition start offset overflow".to_string())?;

    for partition in &config.partitions {
        if partition.download_file.is_empty() {
            debug!(
                "Partition {} has no download file, skipping",
                partition.name
            );
            partition_offset = partition_offset
                .checked_add(partition.size)
                .ok_or_else(|| format!("Partition {} offset overflow", partition.name))?;
            if partition_offset > config.nor_size {
                return Err(format!("Partition {} exceeds NOR size", partition.name));
            }
            continue;
        }

        let partition_subtype = build_partition_subtype(&partition.download_file);

        if let Some(partition_entry) = find_file_by_subtype(&file_entries, &partition_subtype) {
            match extract_file_data(&mut firmware_file, partition_entry) {
                Ok(data) => {
                    let partition_size = usize::try_from(partition.size)
                        .map_err(|_| format!("Partition {} is too large", partition.name))?;

                    if data.len() > partition_size {
                        error!(
                            "Partition {} file size ({}) exceeds partition size ({})",
                            partition.name,
                            data.len(),
                            partition_size
                        );
                        return Err(format!(
                            "Partition {} file size exceeds partition size",
                            partition.name
                        ));
                    }

                    let offset = usize::try_from(partition_offset)
                        .map_err(|_| format!("Partition {} offset is too large", partition.name))?;
                    let end = offset.checked_add(data.len()).ok_or_else(|| {
                        format!("Partition {} data range overflow", partition.name)
                    })?;
                    if end > nor_size {
                        error!("Partition {} exceeds NOR size", partition.name);
                        return Err(format!("Partition {} exceeds NOR size", partition.name));
                    }

                    output_buffer[offset..end].copy_from_slice(&data);
                    info!(
                        "Partition {} loaded: {} bytes at offset {}",
                        partition.name,
                        data.len(),
                        offset
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
                "Partition file not found in firmware: {} -> {} (subtype: {})",
                partition.name, partition.download_file, partition_subtype
            ));
        }

        partition_offset = partition_offset
            .checked_add(partition.size)
            .ok_or_else(|| format!("Partition {} offset overflow", partition.name))?;
        if partition_offset > config.nor_size {
            return Err(format!("Partition {} exceeds NOR size", partition.name));
        }
    }

    let output_path = Path::new(&config.output_path);
    let mut output_file = File::create(output_path).map_err(|e| {
        error!("Failed to create output file: {}", e);
        format!("Failed to create output file: {}", e)
    })?;

    output_file.write_all(&output_buffer).map_err(|e| {
        error!("Failed to write output file: {}", e);
        format!("Failed to write output file: {}", e)
    })?;

    output_file.flush().map_err(|e| {
        error!("Failed to flush output file: {}", e);
        format!("Failed to flush output file: {}", e)
    })?;

    info!("SPI NOR firmware merge completed: {} bytes", nor_size);

    Ok(SpinorMergeResult {
        success: true,
        message: format!("Successfully created SPI NOR firmware: {} bytes", nor_size),
        output_size: nor_size as u64,
    })
}
