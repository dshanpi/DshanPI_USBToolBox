pub(super) const MAX_FILL_COUNT: u32 = 4096;
pub(super) const SECTOR_SIZE: u64 = 512;
pub(super) const MIN_DOWNLOAD_SIZE: usize = 8 * 1024;
pub(super) const ALIGNMENT_SIZE: usize = 4 * 1024;
pub(super) const EFEX_CRC32_VALID_FLAG: u32 = 0x6a617603;

pub(super) fn add_sum(data: &[u8], initial: u32) -> u32 {
    let mut sum = initial;
    let aligned_len = data.len() & !0x03;

    for index in (0..aligned_len).step_by(4) {
        let value = u32::from_le_bytes([
            data[index],
            data[index + 1],
            data[index + 2],
            data[index + 3],
        ]);
        sum = sum.wrapping_add(value);
    }

    let remaining = data.len() & 0x03;
    if remaining > 0 {
        let last_value = match remaining {
            1 => data[aligned_len] as u32,
            2 => data[aligned_len] as u32 | (data[aligned_len + 1] as u32) << 8,
            3 => {
                data[aligned_len] as u32
                    | (data[aligned_len + 1] as u32) << 8
                    | (data[aligned_len + 2] as u32) << 16
            }
            _ => 0,
        };
        sum = sum.wrapping_add(last_value);
    }

    sum
}
