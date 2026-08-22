use crate::firmware::common::{read_packed, string_from_bytes};
use crate::firmware::types::{
    UBootBaseHeadDto, UBootDataHeadDto, UBootExtHeadDto, UBootHeadDto, UBootNormalGpioCfgDto,
};
use std::mem::size_of;

const UBOOT_EXT_COUNT: usize = 15;

#[repr(C, packed)]
#[derive(Clone, Copy)]
struct UbootNormalGpioCfgRaw {
    port: u8,
    port_num: u8,
    mul_sel: u8,
    pull: u8,
    drv_level: u8,
    data: u8,
    reserved: [u8; 2],
}

#[repr(C, packed)]
#[derive(Clone, Copy)]
struct SpareBootCtrlHeadRaw {
    jump_instruction: u32,
    magic: [u8; 8],
    check_sum: u32,
    align_size: u32,
    length: u32,
    uboot_length: u32,
    version: [u8; 8],
    platform: [u8; 8],
    run_addr: u32,
}

#[repr(C, packed)]
#[derive(Clone, Copy)]
struct SpareBootDataHeadRaw {
    dram_para: [u32; 32],
    run_clock: i32,
    run_core_vol: i32,
    uart_port: i32,
    uart_gpio: [UbootNormalGpioCfgRaw; 2],
    twi_port: i32,
    twi_gpio: [UbootNormalGpioCfgRaw; 2],
    work_mode: i32,
    storage_type: i32,
    nand_gpio: [UbootNormalGpioCfgRaw; 32],
    nand_spare_data: [u8; 256],
    sdcard_gpio: [UbootNormalGpioCfgRaw; 32],
    sdcard_spare_data: [u8; 256],
    secureos_exist: u8,
    monitor_exist: u8,
    func_mask: u8,
    uboot_backup: u8,
    uboot_start_sector_in_mmc: u32,
    dtb_offset: i32,
    boot_package_size: i32,
    dram_scan_size: u32,
    reserved: [i32; 1],
    pmu_type: u16,
    uart_input: u16,
    key_input: u16,
    secure_mode: u8,
    debug_mode: u8,
    reserved2: [i32; 2],
}

#[repr(C, packed)]
#[derive(Clone, Copy)]
struct UbootExtHeadRaw {
    data: [i32; 4],
}

fn gpio_raw_to_dto(raw: &UbootNormalGpioCfgRaw) -> UBootNormalGpioCfgDto {
    UBootNormalGpioCfgDto {
        port: raw.port,
        port_num: raw.port_num,
        mul_sel: raw.mul_sel,
        pull: raw.pull,
        drv_level: raw.drv_level,
        data: raw.data,
        reserved: raw.reserved.to_vec(),
    }
}

pub fn parse_uboot(data: &[u8]) -> Result<UBootHeadDto, String> {
    let base: SpareBootCtrlHeadRaw = read_packed(data)?;
    let magic = string_from_bytes(&base.magic);
    if !magic.starts_with("uboot") {
        return Err(format!("invalid u-boot magic: {magic}"));
    }

    let data_offset = size_of::<SpareBootCtrlHeadRaw>();
    let data_head: SpareBootDataHeadRaw = read_packed(&data[data_offset..])?;
    let ext_offset = data_offset + size_of::<SpareBootDataHeadRaw>();
    let ext_size = size_of::<UbootExtHeadRaw>() * UBOOT_EXT_COUNT;
    if data.len() < ext_offset + ext_size + 64 {
        return Err("u-boot buffer too small".to_string());
    }

    let mut ext_headers = Vec::with_capacity(UBOOT_EXT_COUNT);
    for index in 0..UBOOT_EXT_COUNT {
        let start = ext_offset + index * size_of::<UbootExtHeadRaw>();
        let raw: UbootExtHeadRaw = read_packed(&data[start..])?;
        let ext_data = raw.data;
        ext_headers.push(UBootExtHeadDto {
            data: ext_data.to_vec(),
        });
    }

    let hash_offset = ext_offset + ext_size;
    let hash = data[hash_offset..hash_offset + 64].to_vec();
    let dram_para = data_head.dram_para;
    let reserved = data_head.reserved;
    let reserved2 = data_head.reserved2;

    Ok(UBootHeadDto {
        uboot_head: UBootBaseHeadDto {
            jump_instruction: base.jump_instruction,
            magic,
            check_sum: base.check_sum,
            align_size: base.align_size,
            length: base.length,
            uboot_length: base.uboot_length,
            version: string_from_bytes(&base.version),
            platform: string_from_bytes(&base.platform),
            run_addr: base.run_addr,
        },
        uboot_data: UBootDataHeadDto {
            dram_para: dram_para.to_vec(),
            run_clock: data_head.run_clock,
            run_core_vol: data_head.run_core_vol,
            uart_port: data_head.uart_port,
            uart_gpio: data_head.uart_gpio.iter().map(gpio_raw_to_dto).collect(),
            twi_port: data_head.twi_port,
            twi_gpio: data_head.twi_gpio.iter().map(gpio_raw_to_dto).collect(),
            work_mode: data_head.work_mode,
            storage_type: data_head.storage_type,
            nand_gpio: data_head.nand_gpio.iter().map(gpio_raw_to_dto).collect(),
            nand_spare_data: data_head.nand_spare_data.to_vec(),
            sdcard_gpio: data_head.sdcard_gpio.iter().map(gpio_raw_to_dto).collect(),
            sdcard_spare_data: data_head.sdcard_spare_data.to_vec(),
            secureos_exist: data_head.secureos_exist,
            monitor_exist: data_head.monitor_exist,
            func_mask: data_head.func_mask,
            uboot_backup: data_head.uboot_backup,
            uboot_start_sector_in_mmc: data_head.uboot_start_sector_in_mmc,
            dtb_offset: data_head.dtb_offset,
            boot_package_size: data_head.boot_package_size,
            dram_scan_size: data_head.dram_scan_size,
            reserved: reserved.to_vec(),
            pmu_type: data_head.pmu_type,
            uart_input: data_head.uart_input,
            key_input: data_head.key_input,
            secure_mode: data_head.secure_mode,
            debug_mode: data_head.debug_mode,
            reserved2: reserved2.to_vec(),
        },
        uboot_ext: ext_headers,
        hash,
    })
}

pub fn get_uboot_work_mode(data: &[u8]) -> Result<u32, String> {
    let raw: SpareBootDataHeadRaw = read_packed(&data[size_of::<SpareBootCtrlHeadRaw>()..])?;
    Ok(raw.work_mode as u32)
}

pub fn get_uboot_storage_type(data: &[u8]) -> Result<u32, String> {
    let raw: SpareBootDataHeadRaw = read_packed(&data[size_of::<SpareBootCtrlHeadRaw>()..])?;
    Ok(raw.storage_type as u32)
}

pub fn set_uboot_work_mode(data: &[u8], mode: u32) -> Result<Vec<u8>, String> {
    let mut bytes = data.to_vec();
    let data_offset = size_of::<SpareBootCtrlHeadRaw>();
    let mut raw: SpareBootDataHeadRaw = read_packed(&bytes[data_offset..])?;
    raw.work_mode = mode as i32;
    // SAFETY: raw is a packed POD copied into the original byte buffer.
    unsafe {
        std::ptr::copy_nonoverlapping(
            (&raw as *const SpareBootDataHeadRaw) as *const u8,
            bytes[data_offset..].as_mut_ptr(),
            size_of::<SpareBootDataHeadRaw>(),
        );
    }
    Ok(bytes)
}

pub fn set_uboot_storage_type(data: &[u8], storage_type: u32) -> Result<Vec<u8>, String> {
    let mut bytes = data.to_vec();
    let data_offset = size_of::<SpareBootCtrlHeadRaw>();
    let mut raw: SpareBootDataHeadRaw = read_packed(&bytes[data_offset..])?;
    raw.storage_type = storage_type as i32;
    // SAFETY: raw is a packed POD copied into the original byte buffer.
    unsafe {
        std::ptr::copy_nonoverlapping(
            (&raw as *const SpareBootDataHeadRaw) as *const u8,
            bytes[data_offset..].as_mut_ptr(),
            size_of::<SpareBootDataHeadRaw>(),
        );
    }
    Ok(bytes)
}
