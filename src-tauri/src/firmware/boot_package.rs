use crate::firmware::common::{read_packed, string_from_bytes};
use crate::firmware::types::{BootPackageDto, Toc1ItemDto};
use std::mem::size_of;

/// TOC1 magic number: TOC_MAIN_INFO_MAGIC
const TOC1_MAGIC: u32 = 0x89119800;
/// TOC1 end marker: "MEIC" in little endian
const TOC1_END_MARKER: u32 = 0x3b45494d;

/// TOC1 header structure (sbrom_toc1_head_info_t)
/// Total size: 64 bytes
#[repr(C, packed)]
#[derive(Clone, Copy)]
struct Toc1HeadRaw {
    /// Package name, typically "sunxi-secure"
    name: [u8; 16],
    /// Magic number, must be 0x89119800
    magic: u32,
    /// Checksum
    add_sum: u32,
    /// Serial number
    serial_num: u32,
    /// Status flags
    status: u32,
    /// Number of items in package
    items_nr: u32,
    /// Valid length of package
    valid_len: u32,
    /// Main version (one byte used)
    version_main: u32,
    /// Sub version (two bytes used)
    version_sub: u32,
    /// Reserved fields
    reserved: [u32; 3],
    /// End marker, must be 0x3b45494d
    end: u32,
}

/// TOC1 item entry structure (sbrom_toc1_item_info_t)
/// Total size: 368 bytes
#[repr(C, packed)]
#[derive(Clone, Copy)]
struct Toc1ItemRaw {
    /// Item name (e.g., "u-boot", "dtb", "opensbi")
    name: [u8; 64],
    /// Offset to item data from package start
    data_offset: u32,
    /// Length of item data
    data_len: u32,
    /// Encryption flag (0=no AES, 1=AES encrypted)
    encrypt: u32,
    /// Item type (0=normal, 1=key cert, 2=sign cert, 3=bin file)
    item_type: u32,
    /// Run address for executable items
    run_addr: u32,
    /// Execution index for bin files
    index: u32,
    /// Reserved fields (69 * 4 = 276 bytes)
    reserved: [u32; 69],
    /// End marker
    end: u32,
}

fn toc1_item_raw_to_dto(raw: &Toc1ItemRaw) -> Toc1ItemDto {
    Toc1ItemDto {
        name: string_from_bytes(&raw.name),
        data_offset: raw.data_offset,
        data_len: raw.data_len,
        encrypt: raw.encrypt,
        item_type: raw.item_type,
        run_addr: raw.run_addr,
        index: raw.index,
    }
}

/// Check if data contains a valid TOC1 boot package
pub fn is_valid_boot_package(data: &[u8]) -> bool {
    if data.len() < size_of::<Toc1HeadRaw>() {
        return false;
    }
    let head: Toc1HeadRaw = read_packed(data).unwrap_or_else(|_| {
        // Create a dummy struct with wrong magic
        Toc1HeadRaw {
            name: [0; 16],
            magic: 0,
            add_sum: 0,
            serial_num: 0,
            status: 0,
            items_nr: 0,
            valid_len: 0,
            version_main: 0,
            version_sub: 0,
            reserved: [0; 3],
            end: 0,
        }
    });
    head.magic == TOC1_MAGIC
}

/// Parse TOC1 boot package header and items
///
/// # Arguments
/// * `data` - Raw boot package data
///
/// # Returns
/// * `BootPackageDto` -Parsed package info with items list
pub fn parse_boot_package(data: &[u8]) -> Result<BootPackageDto, String> {
    if data.len() < size_of::<Toc1HeadRaw>() {
        return Err(format!(
            "buffer too small for TOC1 header: {} < {}",
            data.len(),
            size_of::<Toc1HeadRaw>()
        ));
    }

    let head: Toc1HeadRaw = read_packed(data)?;

    // Copy fields to local variables to avoid unaligned references
    let magic = head.magic;
    let end_marker = head.end;

    // Validate magic
    if magic != TOC1_MAGIC {
        return Err(format!(
            "invalid TOC1 magic: 0x{:08x}, expected 0x{:08x}",
            magic, TOC1_MAGIC
        ));
    }

    // Validate end marker (optional, some packages may not have it)
    if end_marker != TOC1_END_MARKER && end_marker != 0 {
        log::warn!(
            "TOC1 end marker mismatch: 0x{:08x}, expected 0x{:08x}",
            end_marker,
            TOC1_END_MARKER
        );
    }

    let items_nr = head.items_nr as usize;
    let item_size = size_of::<Toc1ItemRaw>();
    let header_size = size_of::<Toc1HeadRaw>();

    // Validate buffer size for items
    let required_size = header_size + item_size * items_nr;
    if data.len() < required_size {
        return Err(format!(
            "buffer too small for {} items: {} < {}",
            items_nr,
            data.len(),
            required_size
        ));
    }

    // Parse items
    let mut items = Vec::with_capacity(items_nr);
    for i in 0..items_nr {
        let offset = header_size + i * item_size;
        let item_raw: Toc1ItemRaw = read_packed(&data[offset..])?;
        items.push(toc1_item_raw_to_dto(&item_raw));
    }

    Ok(BootPackageDto {
        name: string_from_bytes(&head.name),
        magic: head.magic,
        add_sum: head.add_sum,
        serial_num: head.serial_num,
        status: head.status,
        items_nr: head.items_nr,
        valid_len: head.valid_len,
        version_main: head.version_main,
        version_sub: head.version_sub,
        items,
    })
}

/// Get item data from boot package by name
///
/// # Arguments
/// * `data` - Raw boot package data
/// * `item_name` - Name of the item to extract
///
/// # Returns
/// * `Option<Vec<u8>>` - Item data if found
pub fn get_boot_package_item_data(data: &[u8], item_name: &str) -> Result<Option<Vec<u8>>, String> {
    let package = parse_boot_package(data)?;

    for item in &package.items {
        if item.name == item_name {
            let start = item.data_offset as usize;
            let end = start + item.data_len as usize;
            if end > data.len() {
                return Err(format!(
                    "item '{}' data exceeds buffer: {} > {}",
                    item_name,
                    end,
                    data.len()
                ));
            }
            return Ok(Some(data[start..end].to_vec()));
        }
    }

    Ok(None)
}

/// Get item data from boot package by index
///
/// # Arguments
/// * `data` - Raw boot package data
/// * `index` - Index of the item (0-based)
///
/// # Returns
/// * `Option<Vec<u8>>` - Item data if index is valid
pub fn get_boot_package_item_data_by_index(
    data: &[u8],
    index: usize,
) -> Result<Option<Vec<u8>>, String> {
    let package = parse_boot_package(data)?;

    if index >= package.items.len() {
        return Ok(None);
    }

    let item = &package.items[index];
    let start = item.data_offset as usize;
    let end = start + item.data_len as usize;

    if end > data.len() {
        return Err(format!(
            "item {} data exceeds buffer: {} > {}",
            index,
            end,
            data.len()
        ));
    }

    Ok(Some(data[start..end].to_vec()))
}

/// Get item type name string
pub fn get_item_type_name(item_type: u32) -> &'static str {
    match item_type {
        0 => "normal",
        1 => "key_cert",
        2 => "sign_cert",
        3 => "bin_file",
        _ => "unknown",
    }
}
