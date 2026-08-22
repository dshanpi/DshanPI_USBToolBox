use std::fs::File;
use std::io::{BufReader, Cursor, Read, Seek, SeekFrom};
use std::path::PathBuf;

use log::{debug, error, info, warn};
use mbrman::MBR;
use tauri::command;

use super::types::{MbrInfo, MbrPartition, ParseMbrResult};

const MAX_SCAN_SIZE: u64 = 4 * 1024 * 1024;
const MIN_SECTOR_SIZE: u64 = 512;
const MAX_SECTOR_SIZE: u64 = 64 * 1024;

fn validate_sector_size(sector_size: u64) -> Result<u64, String> {
    if !(MIN_SECTOR_SIZE..=MAX_SECTOR_SIZE).contains(&sector_size) || !sector_size.is_power_of_two()
    {
        return Err(format!(
            "Invalid sector size {sector_size}; expected a power of two between {MIN_SECTOR_SIZE} and {MAX_SECTOR_SIZE}"
        ));
    }
    Ok(sector_size)
}

fn get_partition_type_name(partition_type: u8) -> String {
    match partition_type {
        0x00 => "Empty".to_string(),
        0x01 => "FAT12".to_string(),
        0x04 => "FAT16 <32M".to_string(),
        0x05 => "Extended (CHS)".to_string(),
        0x06 => "FAT16".to_string(),
        0x07 => "NTFS/EXFAT".to_string(),
        0x0B => "FAT32 (CHS)".to_string(),
        0x0C => "FAT32 (LBA)".to_string(),
        0x0E => "FAT16 (LBA)".to_string(),
        0x0F => "Extended (LBA)".to_string(),
        0x11 => "Hidden FAT12".to_string(),
        0x14 => "Hidden FAT16 <32M".to_string(),
        0x16 => "Hidden FAT16".to_string(),
        0x17 => "Hidden NTFS".to_string(),
        0x1B => "Hidden FAT32 (CHS)".to_string(),
        0x1C => "Hidden FAT32 (LBA)".to_string(),
        0x1E => "Hidden FAT16 (LBA)".to_string(),
        0x27 => "PQSERVICE".to_string(),
        0x39 => "Plan 9".to_string(),
        0x3C => "PartitionMagic".to_string(),
        0x40 => "Venix 80286".to_string(),
        0x41 => "PPC PReP Boot".to_string(),
        0x42 => "SFS/LDM".to_string(),
        0x4D => "QNX4.x".to_string(),
        0x4E => "QNX4.x 2nd".to_string(),
        0x4F => "QNX4.x 3rd".to_string(),
        0x50 => "OnTrack DM".to_string(),
        0x51 => "OnTrack DM6 Aux1".to_string(),
        0x52 => "CP/M".to_string(),
        0x53 => "OnTrack DM6 Aux3".to_string(),
        0x54 => "OnTrack DM6".to_string(),
        0x55 => "EZ-Drive".to_string(),
        0x56 => "Golden Bow".to_string(),
        0x5C => "Priam EDisk".to_string(),
        0x61 => "SpeedStor".to_string(),
        0x63 => "GNU HURD/SysV".to_string(),
        0x64 => "Novell Netware".to_string(),
        0x65 => "Novell Netware".to_string(),
        0x70 => "DiskSecure".to_string(),
        0x75 => "PC/IX".to_string(),
        0x80 => "Old Minix".to_string(),
        0x81 => "Minix/old Linux".to_string(),
        0x82 => "Linux Swap/Solaris".to_string(),
        0x83 => "Linux".to_string(),
        0x84 => "OS/2 Hidden C:".to_string(),
        0x85 => "Linux Extended".to_string(),
        0x86 => "NTFT Mirror Set".to_string(),
        0x87 => "NTFT Mirror Set".to_string(),
        0x88 => "Linux Plaintext".to_string(),
        0x8E => "Linux LVM".to_string(),
        0x93 => "Amoeba".to_string(),
        0x94 => "Amoeba BBT".to_string(),
        0x9F => "BSD/OS".to_string(),
        0xA0 => "IBM Thinkpad".to_string(),
        0xA5 => "FreeBSD".to_string(),
        0xA6 => "OpenBSD".to_string(),
        0xA7 => "NeXTSTEP".to_string(),
        0xA8 => "Darwin UFS".to_string(),
        0xA9 => "NetBSD".to_string(),
        0xAB => "Darwin Boot".to_string(),
        0xAF => "HFS/HFS+".to_string(),
        0xB7 => "BSDI fs".to_string(),
        0xB8 => "BSDI swap".to_string(),
        0xBB => "Boot Wizard".to_string(),
        0xBE => "Solaris Boot".to_string(),
        0xBF => "Solaris".to_string(),
        0xC1 => "DRDOS/Secure FAT12".to_string(),
        0xC4 => "DRDOS/Secure FAT16 <32M".to_string(),
        0xC6 => "DRDOS/Secure FAT16".to_string(),
        0xC7 => "Syrinx".to_string(),
        0xDA => "Non-FS Data".to_string(),
        0xDB => "CP/M/CTOS".to_string(),
        0xDE => "Dell Utility".to_string(),
        0xDF => "BootIt".to_string(),
        0xE1 => "DOS Access".to_string(),
        0xE3 => "DOS R/O".to_string(),
        0xE4 => "SpeedStor".to_string(),
        0xEB => "BeOS fs".to_string(),
        0xEE => "GPT Protective".to_string(),
        0xEF => "EFI System".to_string(),
        0xF0 => "Linux/PA-RISC".to_string(),
        0xF1 => "SpeedStor".to_string(),
        0xF2 => "DOS Secondary".to_string(),
        0xF4 => "SpeedStor".to_string(),
        0xFB => "VMware VMFS".to_string(),
        0xFC => "VMware VMKCORE".to_string(),
        0xFD => "Linux RAID".to_string(),
        0xFE => "LANstep/IBM PS2 IML".to_string(),
        0xFF => "Xenix BBT".to_string(),
        _ => format!("Unknown ({:#04X})", partition_type),
    }
}

fn find_mbr_signature<R: Read + Seek>(
    reader: &mut R,
    file_size: u64,
    sector_size: u64,
) -> Option<u64> {
    debug!(
        "Finding MBR signature in file of size {} bytes with sector size {}",
        file_size, sector_size
    );
    let scan_size = MAX_SCAN_SIZE.min(file_size);
    let signature_offset = sector_size - 2;
    let mut signature_buf = [0u8; 2];

    let mut offset: u64 = 0;
    while offset < scan_size {
        if reader
            .seek(SeekFrom::Start(offset + signature_offset))
            .is_err()
        {
            break;
        }

        if reader.read_exact(&mut signature_buf).is_ok() && signature_buf == [0x55, 0xAA] {
            debug!("Found MBR signature at offset {}", offset);
            return Some(offset);
        }

        offset += sector_size;
    }

    debug!("MBR signature not found in first {} bytes", scan_size);
    None
}

fn parse_mbr_from_reader<R: Read + Seek>(mut reader: R, sector_size: u64) -> ParseMbrResult {
    debug!(
        "Starting MBR parsing from reader with sector size {}",
        sector_size
    );
    let file_size = match reader.seek(SeekFrom::End(0)) {
        Ok(size) => {
            debug!("File size: {} bytes", size);
            size
        }
        Err(e) => {
            error!("Failed to get file size: {}", e);
            return ParseMbrResult {
                success: false,
                message: format!("Failed to get file size: {}", e),
                mbr_info: None,
                partitions: Vec::new(),
            };
        }
    };

    let mbr_offset = match find_mbr_signature(&mut reader, file_size, sector_size) {
        Some(offset) => {
            debug!("MBR found at offset: {}", offset);
            offset
        }
        None => {
            warn!("MBR signature not found in first 4MB");
            return ParseMbrResult {
                success: false,
                message: "MBR signature not found in first 4MB".to_string(),
                mbr_info: None,
                partitions: Vec::new(),
            };
        }
    };

    // Read MBR data from the found offset into a buffer
    let mut mbr_buffer = vec![0u8; sector_size as usize];

    if let Err(e) = reader.seek(SeekFrom::Start(mbr_offset)) {
        error!("Failed to seek to MBR offset {}: {}", mbr_offset, e);
        return ParseMbrResult {
            success: false,
            message: format!("Failed to seek to MBR offset: {}", e),
            mbr_info: None,
            partitions: Vec::new(),
        };
    }

    if let Err(e) = reader.read_exact(&mut mbr_buffer) {
        error!("Failed to read MBR data: {}", e);
        return ParseMbrResult {
            success: false,
            message: format!("Failed to read MBR data: {}", e),
            mbr_info: None,
            partitions: Vec::new(),
        };
    }

    // Create a cursor from the buffer so the library reads from offset 0
    let mut mbr_cursor = Cursor::new(mbr_buffer);
    let mbr = match MBR::read_from(&mut mbr_cursor, sector_size as u32) {
        Ok(m) => {
            debug!("Successfully parsed MBR header");
            m
        }
        Err(e) => {
            error!("Failed to parse MBR: {}", e);
            return ParseMbrResult {
                success: false,
                message: format!("Failed to parse MBR: {}", e),
                mbr_info: None,
                partitions: Vec::new(),
            };
        }
    };

    let disk_signature = u32::from_le_bytes([
        mbr.header.disk_signature[0],
        mbr.header.disk_signature[1],
        mbr.header.disk_signature[2],
        mbr.header.disk_signature[3],
    ]);
    debug!("Disk signature: {:#010X}", disk_signature);

    let mut partitions = Vec::new();
    let mut valid_count = 0;

    for (i, partition) in mbr.iter() {
        if partition.is_used() {
            valid_count += 1;
            let start_lba = partition.starting_lba as u64;
            let sectors = partition.sectors as u64;
            let end_lba = if sectors > 0 {
                start_lba + sectors - 1
            } else {
                start_lba
            };
            let size = sectors * sector_size;

            debug!(
                "Found partition {} at LBA {}-{}, size {}, type {:#04X} ({})",
                i,
                start_lba,
                end_lba,
                size,
                partition.sys,
                get_partition_type_name(partition.sys)
            );

            partitions.push(MbrPartition {
                index: i as u8,
                name: format!("Partition {}", i),
                start_lba,
                end_lba,
                size,
                partition_type: partition.sys,
                partition_type_name: get_partition_type_name(partition.sys),
                bootable: partition.boot != 0,
            });
        }
    }

    info!("Parsed {} partitions from MBR", valid_count);

    let mbr_info = MbrInfo {
        disk_signature,
        partition_count: valid_count,
        sector_size,
        total_size: file_size,
    };

    ParseMbrResult {
        success: true,
        message: format!("Successfully parsed {} partitions", valid_count),
        mbr_info: Some(mbr_info),
        partitions,
    }
}

#[command]
pub async fn parse_mbr_from_file(file_path: String, sector_size: Option<u64>) -> ParseMbrResult {
    let sector_size = match validate_sector_size(sector_size.unwrap_or(512)) {
        Ok(value) => value,
        Err(message) => {
            return ParseMbrResult {
                success: false,
                message,
                mbr_info: None,
                partitions: Vec::new(),
            };
        }
    };
    debug!(
        "Parsing MBR from file: {} with sector size {}",
        file_path, sector_size
    );

    let path = PathBuf::from(&file_path);
    if !path.exists() {
        error!("File not found: {}", file_path);
        return ParseMbrResult {
            success: false,
            message: format!("File not found: {}", file_path),
            mbr_info: None,
            partitions: Vec::new(),
        };
    }

    let file = match File::open(&path) {
        Ok(f) => {
            debug!("Successfully opened file: {}", file_path);
            f
        }
        Err(e) => {
            error!("Failed to open file {}: {}", file_path, e);
            return ParseMbrResult {
                success: false,
                message: format!("Failed to open file: {}", e),
                mbr_info: None,
                partitions: Vec::new(),
            };
        }
    };

    let reader = BufReader::new(file);
    parse_mbr_from_reader(reader, sector_size)
}

#[command]
pub async fn parse_mbr_from_data(data: Vec<u8>, sector_size: Option<u64>) -> ParseMbrResult {
    let sector_size = match validate_sector_size(sector_size.unwrap_or(512)) {
        Ok(value) => value,
        Err(message) => {
            return ParseMbrResult {
                success: false,
                message,
                mbr_info: None,
                partitions: Vec::new(),
            };
        }
    };
    debug!(
        "Parsing MBR from data ({} bytes) with sector size {}",
        data.len(),
        sector_size
    );

    if data.len() < 512 {
        warn!("Data too small to contain MBR: {} bytes", data.len());
        return ParseMbrResult {
            success: false,
            message: "Data too small to contain MBR".to_string(),
            mbr_info: None,
            partitions: Vec::new(),
        };
    }

    let cursor = Cursor::new(data);
    parse_mbr_from_reader(cursor, sector_size)
}
