use crate::efex::error::EfexError;
use log::{debug, error};

use super::super::*;

#[allow(dead_code)]
pub(in crate::flash::task) fn sparse_format_probe(data: &[u8]) -> Result<SparseHeader, EfexError> {
    debug!("Probing sparse format");

    let header = SparseHeader::from_bytes(data).ok_or_else(|| EfexError {
        code: -1,
        name: "SparseProbe".to_string(),
        message: "Failed to parse sparse header: insufficient data".to_string(),
    })?;

    if header.magic != SPARSE_HEADER_MAGIC {
        error!(
            "Invalid sparse magic: expected 0x{:08x}, got 0x{:08x}",
            SPARSE_HEADER_MAGIC, header.magic
        );
        return Err(EfexError {
            code: -1,
            name: "SparseProbe".to_string(),
            message: format!(
                "Invalid sparse magic: expected 0x{:08x}, got 0x{:08x}",
                SPARSE_HEADER_MAGIC, header.magic
            ),
        });
    }

    if header.major_version != SPARSE_HEADER_MAJOR_VER {
        return Err(EfexError {
            code: -1,
            name: "SparseProbe".to_string(),
            message: format!("Unsupported sparse version: {}", header.major_version),
        });
    }

    if header.file_hdr_sz as usize != SPARSE_HEADER_SIZE {
        return Err(EfexError {
            code: -1,
            name: "SparseProbe".to_string(),
            message: format!(
                "Invalid file header size: expected {}, got {}",
                SPARSE_HEADER_SIZE, header.file_hdr_sz
            ),
        });
    }

    if header.chunk_hdr_sz as usize != CHUNK_HEADER_SIZE {
        return Err(EfexError {
            code: -1,
            name: "SparseProbe".to_string(),
            message: format!(
                "Invalid chunk header size: expected {}, got {}",
                CHUNK_HEADER_SIZE, header.chunk_hdr_sz
            ),
        });
    }

    Ok(header)
}
