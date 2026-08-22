mod download;
mod parser;
mod probe;
mod utils;

pub(super) use download::download_sparse_partition;
pub(super) use probe::sparse_format_probe;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) enum ParseState {
    TotalHead,
    ChunkHead,
    ChunkData,
    ChunkFillData,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) enum LastChunkType {
    Undefine,
    Raw,
    Fill,
    DontCare,
}

pub(super) struct SparseParser {
    handle: u32,
    state: ParseState,
    last_chunk_type: LastChunkType,
    block_size: u32,
    chunk_length: u32,
    flash_sector: u32,
    last_rest_size: usize,
    last_rest_data: Vec<u8>,
    rawdata_start_sector: u32,
    rawdata_size: u64,
    checksum: u32,
    verify_enabled: bool,
    total_written: u64,
}
