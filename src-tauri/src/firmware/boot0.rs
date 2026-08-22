use crate::firmware::common::{bytes_from_string, read_packed, string_from_bytes};
use crate::firmware::types::{BootFileHeadDto, DramParamInfoDto};
use std::mem::size_of;

const BOOT0_MAGIC: &str = "eGON.BT0";

#[repr(C, packed)]
#[derive(Clone, Copy)]
struct StandardBootFileHeadRaw {
    jump_instruction: u32,
    magic: [u8; 8],
    check_sum: u32,
    length: u32,
    pub_head_size: u32,
    pub_head_vsn: [u8; 4],
    ret_addr: u32,
    run_addr: u32,
    boot_cpu: u32,
    platform: [u8; 8],
}

#[repr(C, packed)]
#[derive(Clone, Copy)]
struct DramParamInfoRaw {
    dram_init_flag: u32,
    dram_update_flag: u32,
    dram_para: [u32; 32],
}

pub fn parse_boot0(data: &[u8]) -> Result<BootFileHeadDto, String> {
    let raw: StandardBootFileHeadRaw = read_packed(data)?;
    let magic = string_from_bytes(&raw.magic);
    if magic != BOOT0_MAGIC {
        return Err(format!("invalid BOOT0 magic: {magic}"));
    }
    Ok(BootFileHeadDto {
        jump_instruction: raw.jump_instruction,
        magic,
        check_sum: raw.check_sum,
        length: raw.length,
        pub_head_size: raw.pub_head_size,
        pub_head_vsn: raw.pub_head_vsn.to_vec(),
        ret_addr: raw.ret_addr,
        run_addr: raw.run_addr,
        boot_cpu: raw.boot_cpu,
        platform: string_from_bytes(&raw.platform),
    })
}

pub fn serialize_boot0(header: &BootFileHeadDto) -> Vec<u8> {
    let mut raw = StandardBootFileHeadRaw {
        jump_instruction: header.jump_instruction,
        magic: bytes_from_string::<8>(&header.magic),
        check_sum: header.check_sum,
        length: header.length,
        pub_head_size: header.pub_head_size,
        pub_head_vsn: [0u8; 4],
        ret_addr: header.ret_addr,
        run_addr: header.run_addr,
        boot_cpu: header.boot_cpu,
        platform: bytes_from_string::<8>(&header.platform),
    };
    for (idx, value) in header.pub_head_vsn.iter().take(4).enumerate() {
        raw.pub_head_vsn[idx] = *value;
    }
    // SAFETY: raw is a packed POD written into a standalone byte slice.
    unsafe {
        std::slice::from_raw_parts(
            (&raw as *const StandardBootFileHeadRaw) as *const u8,
            size_of::<StandardBootFileHeadRaw>(),
        )
        .to_vec()
    }
}

pub fn parse_dram_params(data: &[u8]) -> Result<DramParamInfoDto, String> {
    let raw: DramParamInfoRaw = read_packed(data)?;
    let dram_para = raw.dram_para;
    Ok(DramParamInfoDto {
        dram_init_flag: raw.dram_init_flag,
        dram_update_flag: raw.dram_update_flag,
        dram_para: dram_para.to_vec(),
    })
}

pub fn serialize_dram_params(info: &DramParamInfoDto) -> Result<Vec<u8>, String> {
    if info.dram_para.len() != 32 {
        return Err("dram_para length must be 32".to_string());
    }
    let mut raw = DramParamInfoRaw {
        dram_init_flag: info.dram_init_flag,
        dram_update_flag: info.dram_update_flag,
        dram_para: [0u32; 32],
    };
    let mut dram_para = [0u32; 32];
    dram_para.copy_from_slice(&info.dram_para[..32]);
    raw.dram_para = dram_para;
    // SAFETY: raw is a plain packed POD written as bytes.
    let bytes = unsafe {
        std::slice::from_raw_parts(
            (&raw as *const DramParamInfoRaw) as *const u8,
            size_of::<DramParamInfoRaw>(),
        )
    };
    Ok(bytes.to_vec())
}
