pub const SPARSE_HEADER_MAGIC: u32 = 0xed26ff3a;
pub const SPARSE_HEADER_MAJOR_VER: u16 = 1;

pub const CHUNK_TYPE_RAW: u16 = 0xcac1;
pub const CHUNK_TYPE_FILL: u16 = 0xcac2;
pub const CHUNK_TYPE_DONT_CARE: u16 = 0xcac3;
#[allow(dead_code)]
pub const CHUNK_TYPE_CRC32: u16 = 0xcac4;

pub const SPARSE_HEADER_SIZE: usize = 28;
pub const CHUNK_HEADER_SIZE: usize = 12;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PartitionInfo {
    pub name: String,
    pub classname: String,
    pub address: u64,
    pub length: u64,
    pub user_type: u32,
    pub keydata: u32,
    pub readonly: bool,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PartitionDownloadInfo {
    pub partition: PartitionInfo,
    pub data_offset: u64,
    pub data_length: u64,
    pub need_verify: bool,
    pub external_file_path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ExternalFileDownloadInfo {
    pub partition: PartitionInfo,
    pub file_path: String,
    pub need_verify: bool,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct DownloadPartitionResult {
    pub success: bool,
    pub bytes_written: u64,
    pub partition_name: String,
}

#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub struct SparseHeader {
    pub magic: u32,
    pub major_version: u16,
    pub minor_version: u16,
    pub file_hdr_sz: u16,
    pub chunk_hdr_sz: u16,
    pub blk_sz: u32,
    pub total_blks: u32,
    pub total_chunks: u32,
    pub image_checksum: u32,
}

impl SparseHeader {
    pub fn from_bytes(data: &[u8]) -> Option<Self> {
        if data.len() < SPARSE_HEADER_SIZE {
            return None;
        }

        Some(Self {
            magic: u32::from_le_bytes([data[0], data[1], data[2], data[3]]),
            major_version: u16::from_le_bytes([data[4], data[5]]),
            minor_version: u16::from_le_bytes([data[6], data[7]]),
            file_hdr_sz: u16::from_le_bytes([data[8], data[9]]),
            chunk_hdr_sz: u16::from_le_bytes([data[10], data[11]]),
            blk_sz: u32::from_le_bytes([data[12], data[13], data[14], data[15]]),
            total_blks: u32::from_le_bytes([data[16], data[17], data[18], data[19]]),
            total_chunks: u32::from_le_bytes([data[20], data[21], data[22], data[23]]),
            image_checksum: u32::from_le_bytes([data[24], data[25], data[26], data[27]]),
        })
    }

    pub fn is_valid(&self) -> bool {
        self.magic == SPARSE_HEADER_MAGIC
            && self.major_version == SPARSE_HEADER_MAJOR_VER
            && self.file_hdr_sz as usize == SPARSE_HEADER_SIZE
            && self.chunk_hdr_sz as usize == CHUNK_HEADER_SIZE
    }
}

#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub struct ChunkHeader {
    pub chunk_type: u16,
    pub reserved1: u16,
    pub chunk_sz: u32,
    pub total_sz: u32,
}

impl ChunkHeader {
    pub fn from_bytes(data: &[u8]) -> Option<Self> {
        if data.len() < CHUNK_HEADER_SIZE {
            return None;
        }

        Some(Self {
            chunk_type: u16::from_le_bytes([data[0], data[1]]),
            reserved1: u16::from_le_bytes([data[2], data[3]]),
            chunk_sz: u32::from_le_bytes([data[4], data[5], data[6], data[7]]),
            total_sz: u32::from_le_bytes([data[8], data[9], data[10], data[11]]),
        })
    }
}

pub fn is_sparse_format(data: &[u8]) -> bool {
    SparseHeader::from_bytes(data).is_some_and(|header| header.is_valid())
}
