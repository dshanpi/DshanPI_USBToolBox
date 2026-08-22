use log::error;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

pub const IMAGEWTY_MAGIC: &[u8; 8] = b"IMAGEWTY";
pub const IMAGEWTY_FILEHDR_LEN: u64 = 1024;
const PARTITION_SUBTYPE_SUFFIX: &str = "0000000000";
const MAX_IMAGE_FILE_COUNT: u32 = 4096;

#[derive(Debug, Clone)]
pub struct ImageHeader {
    #[allow(dead_code)]
    pub header_version: u32,
    pub num_files: u32,
}

#[derive(Debug, Clone)]
pub struct FileEntry {
    pub subtype: String,
    pub original_length: u32,
    pub offset: u32,
}

pub fn build_partition_subtype(filename: &str) -> String {
    let base_name = filename.to_uppercase().replace('.', "_");
    let suffix = format!("{}{}", base_name, PARTITION_SUBTYPE_SUFFIX);
    if suffix.len() > 16 {
        suffix[..16].to_string()
    } else {
        suffix
    }
}

pub fn parse_image(file: &mut File) -> Result<(ImageHeader, Vec<FileEntry>), String> {
    let file_len = file
        .metadata()
        .map_err(|e| format!("Failed to read firmware metadata: {e}"))?
        .len();
    file.seek(SeekFrom::Start(0)).map_err(|e| {
        error!("Failed to seek to start: {}", e);
        format!("Failed to seek to start: {}", e)
    })?;

    let mut magic_buf = [0u8; 8];
    file.read_exact(&mut magic_buf).map_err(|e| {
        error!("Failed to read magic: {}", e);
        format!("Failed to read magic: {}", e)
    })?;

    if &magic_buf != IMAGEWTY_MAGIC {
        error!("Invalid image magic: {:?}", magic_buf);
        return Err("Invalid image magic (not IMAGEWTY format)".to_string());
    }

    let mut header_buf = [0u8; 1024];
    file.seek(SeekFrom::Start(0)).map_err(|e| {
        error!("Failed to seek to start: {}", e);
        format!("Failed to seek to start: {}", e)
    })?;
    file.read_exact(&mut header_buf).map_err(|e| {
        error!("Failed to read header: {}", e);
        format!("Failed to read header: {}", e)
    })?;

    let header_version =
        u32::from_le_bytes([header_buf[8], header_buf[9], header_buf[10], header_buf[11]]);
    if header_version != 0x0100 && header_version != 0x0300 {
        return Err(format!(
            "Unsupported image header version: 0x{header_version:04x}"
        ));
    }
    let num_files = if header_version == 0x0300 {
        u32::from_le_bytes([
            header_buf[60],
            header_buf[61],
            header_buf[62],
            header_buf[63],
        ])
    } else {
        u32::from_le_bytes([
            header_buf[56],
            header_buf[57],
            header_buf[58],
            header_buf[59],
        ])
    };
    if num_files > MAX_IMAGE_FILE_COUNT {
        return Err(format!(
            "Image declares too many files: {num_files} (maximum {MAX_IMAGE_FILE_COUNT})"
        ));
    }
    let headers_end = (u64::from(num_files) + 1)
        .checked_mul(IMAGEWTY_FILEHDR_LEN)
        .ok_or_else(|| "Image header table size overflow".to_string())?;
    if headers_end > file_len {
        return Err(format!(
            "Image header table exceeds firmware size: need {headers_end}, file has {file_len}"
        ));
    }

    let image_header = ImageHeader {
        header_version,
        num_files,
    };

    let mut file_entries = Vec::new();
    file_entries
        .try_reserve_exact(num_files as usize)
        .map_err(|e| format!("Cannot allocate image entry table: {e}"))?;
    for i in 0..num_files {
        let offset = IMAGEWTY_FILEHDR_LEN + (i as u64) * IMAGEWTY_FILEHDR_LEN;
        file.seek(SeekFrom::Start(offset)).map_err(|e| {
            error!("Failed to seek to file header: {}", e);
            format!("Failed to seek to file header: {}", e)
        })?;

        let mut file_header_buf = [0u8; 1024];
        file.read_exact(&mut file_header_buf).map_err(|e| {
            error!("Failed to read file header: {}", e);
            format!("Failed to read file header: {}", e)
        })?;

        let subtype = String::from_utf8_lossy(&file_header_buf[16..32])
            .trim_end_matches('\0')
            .to_string();

        let (original_length, data_offset) = if header_version == 0x0300 {
            let original_length = u32::from_le_bytes([
                file_header_buf[300],
                file_header_buf[301],
                file_header_buf[302],
                file_header_buf[303],
            ]);
            let offset = u32::from_le_bytes([
                file_header_buf[308],
                file_header_buf[309],
                file_header_buf[310],
                file_header_buf[311],
            ]);
            (original_length, offset)
        } else {
            let original_length = u32::from_le_bytes([
                file_header_buf[40],
                file_header_buf[41],
                file_header_buf[42],
                file_header_buf[43],
            ]);
            let offset = u32::from_le_bytes([
                file_header_buf[44],
                file_header_buf[45],
                file_header_buf[46],
                file_header_buf[47],
            ]);
            (original_length, offset)
        };

        let data_end = u64::from(data_offset)
            .checked_add(u64::from(original_length))
            .ok_or_else(|| format!("Image entry {i} data range overflow"))?;
        if data_end > file_len {
            return Err(format!(
                "Image entry {i} exceeds firmware size: end={data_end}, file={file_len}"
            ));
        }

        file_entries.push(FileEntry {
            subtype,
            original_length,
            offset: data_offset,
        });
    }

    Ok((image_header, file_entries))
}

pub fn find_file_by_subtype<'a>(entries: &'a [FileEntry], subtype: &str) -> Option<&'a FileEntry> {
    entries.iter().find(|e| e.subtype == subtype)
}

pub fn extract_file_data(file: &mut File, entry: &FileEntry) -> Result<Vec<u8>, String> {
    let file_len = file
        .metadata()
        .map_err(|e| format!("Failed to read firmware metadata: {e}"))?
        .len();
    let data_end = u64::from(entry.offset)
        .checked_add(u64::from(entry.original_length))
        .ok_or_else(|| "File entry data range overflow".to_string())?;
    if data_end > file_len {
        return Err(format!(
            "File entry exceeds firmware size: end={data_end}, file={file_len}"
        ));
    }
    file.seek(SeekFrom::Start(entry.offset as u64))
        .map_err(|e| {
            error!("Failed to seek to file data: {}", e);
            format!("Failed to seek to file data: {}", e)
        })?;

    let read_len = entry.original_length as usize;
    let mut buffer = Vec::new();
    buffer
        .try_reserve_exact(read_len)
        .map_err(|e| format!("Cannot allocate {read_len} bytes for firmware entry: {e}"))?;
    buffer.resize(read_len, 0);
    file.read_exact(&mut buffer).map_err(|e| {
        error!("Failed to read file data: {}", e);
        format!("Failed to read file data: {}", e)
    })?;

    Ok(buffer)
}

#[allow(dead_code)]
pub fn read_file(path: &Path) -> Result<Vec<u8>, String> {
    let mut file = File::open(path).map_err(|e| {
        error!("Failed to open file {}: {}", path.display(), e);
        format!("Failed to open file {}: {}", path.display(), e)
    })?;

    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| {
        error!("Failed to read file {}: {}", path.display(), e);
        format!("Failed to read file {}: {}", path.display(), e)
    })?;

    Ok(buffer)
}
