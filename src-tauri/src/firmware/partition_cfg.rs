use crate::firmware::common::parse_number;
use crate::firmware::types::{PartitionConfigDto, PartitionDto};

pub fn parse_partition_config(data: &[u8]) -> Result<PartitionConfigDto, String> {
    let content = String::from_utf8_lossy(data);
    let mut mbr_size = 0u64;
    let mut partitions = Vec::new();
    let mut in_mbr = false;
    let mut in_partition = false;
    let mut current = PartitionDto {
        name: String::new(),
        size: 0,
        downloadfile: String::new(),
        user_type: 0,
        keydata: false,
        encrypt: false,
        verify: false,
        ro: false,
    };

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with("//") {
            continue;
        }
        match line {
            "[mbr]" => {
                in_mbr = true;
                in_partition = false;
                continue;
            }
            "[partition_start]" => {
                in_partition = true;
                in_mbr = false;
                continue;
            }
            "[partition]" => {
                if !current.name.is_empty() {
                    partitions.push(current.clone());
                }
                current = PartitionDto {
                    name: String::new(),
                    size: 0,
                    downloadfile: String::new(),
                    user_type: 0,
                    keydata: false,
                    encrypt: false,
                    verify: false,
                    ro: false,
                };
                in_partition = true;
                in_mbr = false;
                continue;
            }
            _ => {}
        }

        let Some((key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let raw_value = raw_value.trim().trim_matches('"');
        if in_mbr && key == "size" {
            mbr_size = parse_number(raw_value)? as u64;
            continue;
        }
        if !in_partition {
            continue;
        }
        match key {
            "name" => current.name = raw_value.to_string(),
            "size" => current.size = parse_number(raw_value)? as u64,
            "downloadfile" => current.downloadfile = raw_value.to_string(),
            "user_type" => current.user_type = parse_number(raw_value)?,
            "keydata" => current.keydata = parse_number(raw_value)? != 0,
            "encrypt" => current.encrypt = parse_number(raw_value)? != 0,
            "verify" => current.verify = parse_number(raw_value)? != 0,
            "ro" => current.ro = parse_number(raw_value)? != 0,
            _ => {}
        }
    }

    if in_partition && !current.name.is_empty() {
        partitions.push(current);
    }

    Ok(PartitionConfigDto {
        mbr_size,
        partitions,
    })
}

pub fn serialize_partition_config(config: &PartitionConfigDto) -> Vec<u8> {
    let mut lines = Vec::new();
    lines.push("[mbr]".to_string());
    lines.push(format!("size = {}", config.mbr_size));
    lines.push(String::new());
    lines.push("[partition_start]".to_string());
    for partition in &config.partitions {
        lines.push("[partition]".to_string());
        lines.push(format!("name = {}", partition.name));
        lines.push(format!("size = {}", partition.size));
        if !partition.downloadfile.is_empty() {
            lines.push(format!("downloadfile = {}", partition.downloadfile));
        }
        lines.push(format!("user_type = {}", partition.user_type));
        lines.push(format!("keydata = {}", u32::from(partition.keydata)));
        lines.push(format!("encrypt = {}", u32::from(partition.encrypt)));
        lines.push(format!("verify = {}", u32::from(partition.verify)));
        lines.push(format!("ro = {}", u32::from(partition.ro)));
        lines.push(String::new());
    }
    lines.join("\n").into_bytes()
}
