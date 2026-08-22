use std::mem::size_of;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn read_packed<T: Copy>(bytes: &[u8]) -> Result<T, String> {
    if bytes.len() < size_of::<T>() {
        return Err(format!(
            "buffer too small: {} < {}",
            bytes.len(),
            size_of::<T>()
        ));
    }
    // SAFETY: length is checked above and we intentionally support packed C layouts.
    let value = unsafe { std::ptr::read_unaligned(bytes.as_ptr() as *const T) };
    Ok(value)
}

pub fn string_from_bytes(bytes: &[u8]) -> String {
    let len = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
    String::from_utf8_lossy(&bytes[..len]).into_owned()
}

pub fn bytes_from_string<const N: usize>(value: &str) -> [u8; N] {
    let mut out = [0u8; N];
    let bytes = value.as_bytes();
    let len = bytes.len().min(N);
    out[..len].copy_from_slice(&bytes[..len]);
    out
}

pub fn combine_hi_lo(hi: u32, lo: u32) -> u64 {
    ((hi as u64) << 32) | (lo as u64)
}

pub fn current_unix_timestamp() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_secs() as u32)
        .unwrap_or(0)
}

pub fn parse_number(value: &str) -> Result<u32, String> {
    if let Some(hex) = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
    {
        u32::from_str_radix(hex, 16).map_err(|e| format!("invalid number {value}: {e}"))
    } else {
        value
            .parse::<i64>()
            .map(|v| v as u32)
            .map_err(|e| format!("invalid number {value}: {e}"))
    }
}
