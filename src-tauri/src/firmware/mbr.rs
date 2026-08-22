use crate::firmware::common::{
    bytes_from_string, combine_hi_lo, current_unix_timestamp, read_packed, string_from_bytes,
};
use crate::firmware::types::{MbrInfoDto, PartitionInfoDto, SunxiMbrDto, SunxiPartitionDto};
use crc32fast::Hasher;
use std::mem::size_of;

const MBR_MAGIC: &str = "softw411";
const MBR_VERSION: u32 = 0x0000_0200;
const PART_NAME_MAX_LEN: usize = 16;
const PART_SIZE_RES_LEN: usize = 68;
const MBR_MAX_PART_CNT: usize = 120;
const MBR_SIZE: usize = 16 * 1024;
const MBR_RESERVED: usize = MBR_SIZE - 32 - MBR_MAX_PART_CNT * 128;

#[repr(C, packed)]
#[derive(Clone, Copy)]
struct SunxiPartitionRaw {
    addrhi: u32,
    addrlo: u32,
    lenhi: u32,
    lenlo: u32,
    classname: [u8; PART_NAME_MAX_LEN],
    name: [u8; PART_NAME_MAX_LEN],
    user_type: u32,
    keydata: u32,
    ro: u32,
    res: [u8; PART_SIZE_RES_LEN],
}

#[repr(C, packed)]
#[derive(Clone, Copy)]
struct SunxiMbrRaw {
    crc32: u32,
    version: u32,
    magic: [u8; 8],
    copy: u32,
    index: u32,
    part_count: u32,
    stamp: [u32; 1],
    array: [SunxiPartitionRaw; MBR_MAX_PART_CNT],
    res: [u8; MBR_RESERVED],
}

fn partition_raw_to_dto(raw: &SunxiPartitionRaw) -> SunxiPartitionDto {
    SunxiPartitionDto {
        addrhi: raw.addrhi,
        addrlo: raw.addrlo,
        lenhi: raw.lenhi,
        lenlo: raw.lenlo,
        classname: string_from_bytes(&raw.classname),
        name: string_from_bytes(&raw.name),
        user_type: raw.user_type,
        keydata: raw.keydata,
        ro: raw.ro,
        res: raw.res.to_vec(),
    }
}

fn partition_dto_to_raw(dto: &SunxiPartitionDto) -> SunxiPartitionRaw {
    let mut res = [0u8; PART_SIZE_RES_LEN];
    let copy_len = dto.res.len().min(PART_SIZE_RES_LEN);
    res[..copy_len].copy_from_slice(&dto.res[..copy_len]);
    SunxiPartitionRaw {
        addrhi: dto.addrhi,
        addrlo: dto.addrlo,
        lenhi: dto.lenhi,
        lenlo: dto.lenlo,
        classname: bytes_from_string::<PART_NAME_MAX_LEN>(&dto.classname),
        name: bytes_from_string::<PART_NAME_MAX_LEN>(&dto.name),
        user_type: dto.user_type,
        keydata: dto.keydata,
        ro: dto.ro,
        res,
    }
}

fn dto_to_partition_info(dto: &SunxiPartitionDto) -> PartitionInfoDto {
    PartitionInfoDto {
        name: dto.name.clone(),
        classname: dto.classname.clone(),
        address: combine_hi_lo(dto.addrhi, dto.addrlo).to_string(),
        length: combine_hi_lo(dto.lenhi, dto.lenlo).to_string(),
        user_type: dto.user_type,
        keydata: dto.keydata,
        readonly: dto.ro != 0,
    }
}

fn recalc_partition_addresses(mbr: &mut SunxiMbrDto, start_index: usize) {
    const SECTOR_SIZE: u64 = 512;
    let mbr_sectors = (MBR_SIZE as u64) / SECTOR_SIZE;
    let part_count = (mbr.part_count as usize).min(mbr.array.len());
    if start_index > part_count {
        return;
    }

    let mut current_address = if start_index == 0 {
        mbr_sectors
    } else {
        let prev = &mbr.array[start_index - 1];
        combine_hi_lo(prev.addrhi, prev.addrlo) + combine_hi_lo(prev.lenhi, prev.lenlo)
    };

    for index in start_index..part_count {
        let part = &mut mbr.array[index];
        let length = combine_hi_lo(part.lenhi, part.lenlo);
        part.addrhi = (current_address >> 32) as u32;
        part.addrlo = current_address as u32;
        current_address = current_address.saturating_add(length);
    }
}

fn partition_info_to_partition_dto(info: &PartitionInfoDto) -> Result<SunxiPartitionDto, String> {
    let address = info
        .address
        .parse::<u64>()
        .map_err(|e| format!("invalid address: {e}"))?;
    let length = info
        .length
        .parse::<u64>()
        .map_err(|e| format!("invalid length: {e}"))?;
    Ok(SunxiPartitionDto {
        addrhi: (address >> 32) as u32,
        addrlo: address as u32,
        lenhi: (length >> 32) as u32,
        lenlo: length as u32,
        classname: info.classname.clone(),
        name: info.name.clone(),
        user_type: info.user_type,
        keydata: info.keydata,
        ro: u32::from(info.readonly),
        res: vec![0u8; PART_SIZE_RES_LEN],
    })
}

fn crc32_with_skip(bytes: &[u8], skip: usize) -> u32 {
    let mut hasher = Hasher::new();
    hasher.update(&bytes[skip..]);
    hasher.finalize()
}

pub fn parse_sunxi_mbr(data: &[u8]) -> Result<SunxiMbrDto, String> {
    let raw: SunxiMbrRaw = read_packed(data)?;
    let magic = string_from_bytes(&raw.magic);
    if magic != MBR_MAGIC {
        return Err(format!("invalid MBR magic: {magic}"));
    }
    let stamp = raw.stamp;
    Ok(SunxiMbrDto {
        crc32: raw.crc32,
        version: raw.version,
        magic,
        copy: raw.copy,
        index: raw.index,
        part_count: raw.part_count,
        stamp: stamp.to_vec(),
        array: raw.array.iter().map(partition_raw_to_dto).collect(),
        res: raw.res.to_vec(),
    })
}

pub fn is_valid_sunxi_mbr(data: &[u8]) -> bool {
    parse_sunxi_mbr(data).is_ok()
}

pub fn sunxi_mbr_to_info(mbr: &SunxiMbrDto) -> MbrInfoDto {
    let count = (mbr.part_count as usize).min(mbr.array.len());
    MbrInfoDto {
        crc32: mbr.crc32,
        version: mbr.version,
        magic: mbr.magic.clone(),
        copy: mbr.copy,
        index: mbr.index,
        part_count: mbr.part_count,
        partitions: mbr.array[..count]
            .iter()
            .map(dto_to_partition_info)
            .collect(),
    }
}

pub fn create_empty_mbr() -> SunxiMbrDto {
    SunxiMbrDto {
        crc32: 0,
        version: MBR_VERSION,
        magic: MBR_MAGIC.to_string(),
        copy: 1,
        index: 0,
        part_count: 0,
        stamp: vec![current_unix_timestamp()],
        array: (0..MBR_MAX_PART_CNT)
            .map(|_| SunxiPartitionDto {
                addrhi: 0,
                addrlo: 0,
                lenhi: 0,
                lenlo: 0,
                classname: String::new(),
                name: String::new(),
                user_type: 0,
                keydata: 0,
                ro: 0,
                res: vec![0u8; PART_SIZE_RES_LEN],
            })
            .collect(),
        res: vec![0u8; MBR_RESERVED],
    }
}

pub fn mbr_add_partition(
    mut mbr: SunxiMbrDto,
    partition: PartitionInfoDto,
    index: Option<usize>,
) -> Result<SunxiMbrDto, String> {
    if mbr.array.len() < MBR_MAX_PART_CNT {
        return Err("invalid MBR array size".to_string());
    }
    if mbr.part_count as usize >= MBR_MAX_PART_CNT {
        return Err(format!(
            "maximum partition count reached ({MBR_MAX_PART_CNT})"
        ));
    }
    let partition = partition_info_to_partition_dto(&partition)?;
    let insert_index = index.unwrap_or(mbr.part_count as usize);
    if insert_index > mbr.part_count as usize {
        return Err(format!("invalid index {insert_index}"));
    }
    for idx in ((insert_index + 1)..=mbr.part_count as usize).rev() {
        mbr.array[idx] = mbr.array[idx - 1].clone();
    }
    mbr.array[insert_index] = partition;
    mbr.part_count += 1;
    recalc_partition_addresses(&mut mbr, insert_index);
    Ok(mbr)
}

/// Add partition without recalculating addresses. Used for custom address scenarios
/// like logic offset mode where negative offsets are encoded as large u32 values.
pub fn mbr_add_partition_raw(
    mut mbr: SunxiMbrDto,
    partition: PartitionInfoDto,
    index: Option<usize>,
) -> Result<SunxiMbrDto, String> {
    if mbr.array.len() < MBR_MAX_PART_CNT {
        return Err("invalid MBR array size".to_string());
    }
    if mbr.part_count as usize >= MBR_MAX_PART_CNT {
        return Err(format!(
            "maximum partition count reached ({MBR_MAX_PART_CNT})"
        ));
    }
    let partition = partition_info_to_partition_dto(&partition)?;
    let insert_index = index.unwrap_or(mbr.part_count as usize);
    if insert_index > mbr.part_count as usize {
        return Err(format!("invalid index {insert_index}"));
    }
    for idx in ((insert_index + 1)..=mbr.part_count as usize).rev() {
        mbr.array[idx] = mbr.array[idx - 1].clone();
    }
    mbr.array[insert_index] = partition;
    mbr.part_count += 1;
    // Do NOT recalculate addresses - preserve user-provided values
    Ok(mbr)
}

pub fn mbr_update_partition(
    mut mbr: SunxiMbrDto,
    index: usize,
    partition: PartitionInfoDto,
) -> Result<SunxiMbrDto, String> {
    if index >= mbr.part_count as usize {
        return Err(format!("invalid index {index}"));
    }
    mbr.array[index] = partition_info_to_partition_dto(&partition)?;
    recalc_partition_addresses(&mut mbr, index + 1);
    Ok(mbr)
}

pub fn mbr_remove_partition(mut mbr: SunxiMbrDto, index: usize) -> Result<SunxiMbrDto, String> {
    if index >= mbr.part_count as usize {
        return Err(format!("invalid index {index}"));
    }
    for idx in index..(mbr.part_count as usize - 1) {
        mbr.array[idx] = mbr.array[idx + 1].clone();
    }
    mbr.array[mbr.part_count as usize - 1] = create_empty_mbr().array[0].clone();
    mbr.part_count -= 1;
    recalc_partition_addresses(&mut mbr, index);
    Ok(mbr)
}

pub fn mbr_move_partition(
    mut mbr: SunxiMbrDto,
    from_index: usize,
    to_index: usize,
) -> Result<SunxiMbrDto, String> {
    if from_index >= mbr.part_count as usize || to_index >= mbr.part_count as usize {
        return Err("invalid partition index".to_string());
    }
    if from_index == to_index {
        return Ok(mbr);
    }
    let part = mbr.array[from_index].clone();
    if from_index < to_index {
        for idx in from_index..to_index {
            mbr.array[idx] = mbr.array[idx + 1].clone();
        }
    } else {
        for idx in (to_index + 1..=from_index).rev() {
            mbr.array[idx] = mbr.array[idx - 1].clone();
        }
    }
    mbr.array[to_index] = part;
    recalc_partition_addresses(&mut mbr, from_index.min(to_index));
    Ok(mbr)
}

pub fn mbr_clear_partitions(mut mbr: SunxiMbrDto) -> SunxiMbrDto {
    let empty = create_empty_mbr();
    mbr.part_count = 0;
    mbr.array = empty.array;
    mbr
}

pub fn mbr_set_copy(mut mbr: SunxiMbrDto, copy: u32) -> SunxiMbrDto {
    mbr.copy = copy;
    mbr
}

pub fn mbr_set_version(mut mbr: SunxiMbrDto, version: u32) -> SunxiMbrDto {
    mbr.version = version;
    mbr
}

pub fn mbr_set_index(mut mbr: SunxiMbrDto, index: u32) -> SunxiMbrDto {
    mbr.index = index;
    mbr
}

pub fn mbr_update_stamp(mut mbr: SunxiMbrDto) -> SunxiMbrDto {
    mbr.stamp = vec![current_unix_timestamp()];
    mbr
}

pub fn serialize_mbr(mbr: &SunxiMbrDto) -> Result<Vec<u8>, String> {
    if mbr.array.len() != MBR_MAX_PART_CNT {
        return Err("invalid MBR array size".to_string());
    }
    if mbr.res.len() != MBR_RESERVED {
        return Err("invalid MBR reserve size".to_string());
    }
    let empty = create_empty_mbr();
    let mut raw = SunxiMbrRaw {
        crc32: 0,
        version: mbr.version,
        magic: bytes_from_string::<8>(&mbr.magic),
        copy: mbr.copy,
        index: mbr.index,
        part_count: mbr.part_count,
        stamp: [mbr
            .stamp
            .first()
            .copied()
            .unwrap_or_else(current_unix_timestamp)],
        array: [partition_dto_to_raw(&empty.array[0]); MBR_MAX_PART_CNT],
        res: [0u8; MBR_RESERVED],
    };
    for (idx, partition) in mbr.array.iter().take(MBR_MAX_PART_CNT).enumerate() {
        raw.array[idx] = partition_dto_to_raw(partition);
    }
    raw.res.copy_from_slice(&mbr.res[..MBR_RESERVED]);

    let mut bytes = vec![0u8; size_of::<SunxiMbrRaw>()];
    // SAFETY: raw is a packed POD copied into an owned byte buffer.
    unsafe {
        std::ptr::copy_nonoverlapping(
            (&raw as *const SunxiMbrRaw) as *const u8,
            bytes.as_mut_ptr(),
            size_of::<SunxiMbrRaw>(),
        );
    }

    let crc = crc32_with_skip(&bytes, 4);
    bytes[..4].copy_from_slice(&crc.to_le_bytes());
    Ok(bytes)
}

pub fn serialize_mbr_with_copies(
    mbr: &SunxiMbrDto,
    copy_count: Option<u32>,
) -> Result<Vec<u8>, String> {
    const MAX_MBR_COPIES: u32 = 128;
    let copies = copy_count.unwrap_or(mbr.copy).max(1);
    if copies > MAX_MBR_COPIES {
        return Err(format!(
            "invalid MBR copy count: {copies} (maximum {MAX_MBR_COPIES})"
        ));
    }
    let single = serialize_mbr(mbr)?;
    let total_len = single
        .len()
        .checked_mul(copies as usize)
        .ok_or_else(|| "MBR output size overflow".to_string())?;
    let mut result = Vec::new();
    result
        .try_reserve_exact(total_len)
        .map_err(|e| format!("cannot allocate MBR output: {e}"))?;
    result.resize(total_len, 0);
    for index in 0..copies {
        let mut current = single.clone();
        current[20..24].copy_from_slice(&index.to_le_bytes());
        let crc = crc32_with_skip(&current, 4);
        current[..4].copy_from_slice(&crc.to_le_bytes());
        let start = index as usize * single.len();
        result[start..start + single.len()].copy_from_slice(&current);
    }
    Ok(result)
}
