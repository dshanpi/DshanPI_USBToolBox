use std::fs::File;
use std::io::{BufReader, Cursor, Read, Seek, SeekFrom};
use std::path::PathBuf;

use gptman::GPT;
use log::{debug, error, info, warn};
use tauri::command;

use super::types::{GptHeader, GptInfo, GptPartition, ParseGptResult};

const GPT_HEADER_SIZE: u64 = 92;
const MAX_SCAN_SIZE: u64 = 4 * 1024 * 1024;

fn guid_bytes_to_string(guid: &[u8; 16]) -> String {
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        guid[3], guid[2], guid[1], guid[0],
        guid[5], guid[4],
        guid[7], guid[6],
        guid[8], guid[9],
        guid[10], guid[11], guid[12], guid[13], guid[14], guid[15]
    )
}

fn find_gpt_signature<R: Read + Seek>(reader: &mut R, file_size: u64) -> Option<u64> {
    debug!("Finding GPT signature in file of size {} bytes", file_size);
    let scan_size = MAX_SCAN_SIZE.min(file_size);
    let sector_size: u64 = 512;
    let mut buffer = vec![0u8; GPT_HEADER_SIZE as usize];

    let mut offset: u64 = 0;
    while offset < scan_size {
        if reader.seek(SeekFrom::Start(offset)).is_err() {
            break;
        }

        if reader.read_exact(&mut buffer).is_ok() && &buffer[0..8] == b"EFI PART" {
            debug!("Found GPT signature at offset {}", offset);
            return Some(offset);
        }

        offset += sector_size;
    }

    debug!("GPT signature not found in first {} bytes", scan_size);
    None
}

fn parse_gpt_from_reader<R: Read + Seek>(mut reader: R) -> ParseGptResult {
    debug!("Starting GPT parsing from reader");
    let file_size = match reader.seek(SeekFrom::End(0)) {
        Ok(size) => {
            debug!("File size: {} bytes", size);
            size
        }
        Err(e) => {
            error!("Failed to get file size: {}", e);
            return ParseGptResult {
                success: false,
                message: format!("Failed to get file size: {}", e),
                gpt_info: None,
            };
        }
    };

    debug!("Trying direct GPT parse from file start");
    if reader.seek(SeekFrom::Start(0)).is_ok() {
        match GPT::read_from(&mut reader, 512) {
            Ok(gpt) => {
                debug!("Successfully parsed GPT directly from file start");
                return build_gpt_result_from_gptman(gpt, file_size);
            }
            Err(e) => {
                debug!("Direct GPT parse failed: {}, trying with offset scan", e);
            }
        }
    }

    let gpt_header_offset = match find_gpt_signature(&mut reader, file_size) {
        Some(offset) => {
            debug!("GPT header found at offset: {}", offset);
            offset
        }
        None => {
            warn!("GPT signature not found in first 4MB");
            return ParseGptResult {
                success: false,
                message: "GPT signature not found in first 4MB".to_string(),
                gpt_info: None,
            };
        }
    };

    let gpt_start_offset = if gpt_header_offset >= 512 {
        gpt_header_offset - 512
    } else {
        gpt_header_offset
    };
    debug!(
        "Reading GPT from offset: {} (protective MBR)",
        gpt_start_offset
    );

    let gpt_data_size = 34 * 512;
    let mut gpt_buffer = vec![0u8; gpt_data_size];

    if let Err(e) = reader.seek(SeekFrom::Start(gpt_start_offset)) {
        error!(
            "Failed to seek to GPT start offset {}: {}",
            gpt_start_offset, e
        );
        return ParseGptResult {
            success: false,
            message: format!("Failed to seek to GPT offset: {}", e),
            gpt_info: None,
        };
    }

    let bytes_read = match reader.read(&mut gpt_buffer) {
        Ok(n) => n,
        Err(e) => {
            error!("Failed to read GPT data: {}", e);
            return ParseGptResult {
                success: false,
                message: format!("Failed to read GPT data: {}", e),
                gpt_info: None,
            };
        }
    };

    if bytes_read < 1024 {
        error!("Insufficient data read for GPT: {} bytes", bytes_read);
        return ParseGptResult {
            success: false,
            message: format!("Insufficient data read for GPT: {} bytes", bytes_read),
            gpt_info: None,
        };
    }

    debug!("Read {} bytes for GPT parsing", bytes_read);

    let mut gpt_cursor = Cursor::new(&gpt_buffer[..bytes_read]);
    let gpt = match GPT::read_from(&mut gpt_cursor, 512) {
        Ok(g) => {
            debug!("Successfully parsed GPT header with offset");
            g
        }
        Err(e) => {
            error!("Failed to parse GPT: {}", e);
            return ParseGptResult {
                success: false,
                message: format!("Failed to parse GPT: {}", e),
                gpt_info: None,
            };
        }
    };

    build_gpt_result_from_gptman(gpt, file_size)
}

fn build_gpt_result_from_gptman(gpt: GPT, file_size: u64) -> ParseGptResult {
    let disk_guid = guid_bytes_to_string(&gpt.header.disk_guid);
    debug!("Disk GUID: {}", disk_guid);
    let mut partitions = Vec::new();

    for (_i, partition) in gpt.iter() {
        if partition.is_used() {
            let start_lba = partition.starting_lba;
            let end_lba = partition.ending_lba;
            let size = if end_lba > start_lba {
                (end_lba - start_lba) * gpt.sector_size
            } else {
                0
            };

            debug!(
                "Found partition: {} (LBA {}-{}, size {})",
                partition.partition_name, start_lba, end_lba, size
            );

            partitions.push(GptPartition {
                name: partition.partition_name.to_string(),
                start_lba,
                end_lba,
                size,
                partition_type_guid: guid_bytes_to_string(&partition.partition_type_guid),
                partition_guid: guid_bytes_to_string(&partition.unique_partition_guid),
                attributes: partition.attribute_bits,
            });
        }
    }

    info!("Parsed {} partitions from GPT", partitions.len());

    let gpt_info = GptInfo {
        header: GptHeader {
            disk_guid,
            first_usable_lba: gpt.header.first_usable_lba,
            last_usable_lba: gpt.header.last_usable_lba,
            partition_count: partitions.len() as u32,
            partition_entry_size: gpt.header.size_of_partition_entry,
        },
        partitions,
        sector_size: gpt.sector_size,
        total_size: file_size,
    };

    ParseGptResult {
        success: true,
        message: format!(
            "Successfully parsed {} partitions",
            gpt_info.partitions.len()
        ),
        gpt_info: Some(gpt_info),
    }
}

#[command]
pub async fn parse_gpt_from_file(file_path: String, _sector_size: Option<u64>) -> ParseGptResult {
    debug!("Parsing GPT from file: {}", file_path);
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        error!("File not found: {}", file_path);
        return ParseGptResult {
            success: false,
            message: format!("File not found: {}", file_path),
            gpt_info: None,
        };
    }

    let file = match File::open(&path) {
        Ok(f) => {
            debug!("Successfully opened file: {}", file_path);
            f
        }
        Err(e) => {
            error!("Failed to open file {}: {}", file_path, e);
            return ParseGptResult {
                success: false,
                message: format!("Failed to open file: {}", e),
                gpt_info: None,
            };
        }
    };

    let reader = BufReader::new(file);
    parse_gpt_from_reader(reader)
}

#[command]
pub async fn parse_gpt_from_data(data: Vec<u8>, _sector_size: Option<u64>) -> ParseGptResult {
    debug!("Parsing GPT from data ({} bytes)", data.len());
    if data.len() < 1024 {
        warn!("Data too small to contain GPT: {} bytes", data.len());
        return ParseGptResult {
            success: false,
            message: "Data too small to contain GPT".to_string(),
            gpt_info: None,
        };
    }

    let cursor = Cursor::new(data);
    parse_gpt_from_reader(cursor)
}
