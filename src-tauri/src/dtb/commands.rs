use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

use log::{debug, error, warn};
use tauri::command;

use super::types::{
    FdtChosen, FdtCpu, FdtInfo, FdtMemoryRegion, FdtNode, FdtProperty, FdtRootInfo,
    GenerateDtsResult, GetNodeResult, GetPropertyResult, ListNodeChildrenResult, ParseFdtResult,
};

fn parse_u32_from_bytes(bytes: &[u8]) -> Option<u32> {
    if bytes.len() >= 4 {
        Some(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    } else {
        None
    }
}

fn parse_u64_from_bytes(bytes: &[u8]) -> Option<u64> {
    if bytes.len() >= 8 {
        Some(u64::from_be_bytes([
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        ]))
    } else {
        None
    }
}

fn property_to_fdt_property(prop: fdt::node::NodeProperty<'_>) -> FdtProperty {
    let name = prop.name.to_string();

    let value = if let Ok(s) = core::str::from_utf8(prop.value) {
        if s.ends_with('\0') {
            Some(s.trim_end_matches('\0').to_string())
        } else {
            Some(s.to_string())
        }
    } else if let Some(v) = parse_u32_from_bytes(prop.value) {
        Some(format!("0x{:08x}", v))
    } else if let Some(v) = parse_u64_from_bytes(prop.value) {
        Some(format!("0x{:016x}", v))
    } else {
        let bytes = prop.value;
        if bytes.len() <= 32 {
            Some(
                bytes
                    .iter()
                    .map(|b| format!("{:02x}", b))
                    .collect::<Vec<_>>()
                    .join(" "),
            )
        } else {
            None
        }
    };

    let raw_value = Some(prop.value.to_vec());

    FdtProperty {
        name,
        value,
        raw_value,
    }
}

fn parse_fdt_from_data(data: &[u8]) -> ParseFdtResult {
    debug!("Parsing FDT from data, size: {} bytes", data.len());

    let fdt = match fdt::Fdt::new(data) {
        Ok(f) => f,
        Err(e) => {
            error!("Failed to parse FDT: {:?}", e);
            return ParseFdtResult {
                success: false,
                message: format!("Failed to parse FDT: {:?}", e),
                fdt_info: None,
            };
        }
    };

    let root = fdt.root();

    let model = Some(root.model().to_string());
    let compatible: Vec<String> = root.compatible().all().map(|s| s.to_string()).collect();

    let address_cells = root
        .property("#address-cells")
        .and_then(|p| parse_u32_from_bytes(p.value));
    let size_cells = root
        .property("#size-cells")
        .and_then(|p| parse_u32_from_bytes(p.value));

    debug!(
        "FDT root: model={:?}, compatible={:?}, address_cells={:?}, size_cells={:?}",
        model, compatible, address_cells, size_cells
    );

    let mut memory_regions = Vec::new();
    if let Some(memory_node) = fdt.find_node("/memory") {
        for prop in memory_node.properties() {
            if prop.name == "reg" {
                let reg_data = prop.value;
                let addr_cells = address_cells.unwrap_or(2) as usize;
                let size_cells_val = size_cells.unwrap_or(1) as usize;
                let cell_size = 4;
                let entry_size = (addr_cells + size_cells_val) * cell_size;

                for chunk in reg_data.chunks(entry_size) {
                    if chunk.len() >= entry_size {
                        let mut addr: u64 = 0;
                        for i in 0..addr_cells {
                            addr = (addr << 32)
                                | u32::from_be_bytes([
                                    chunk[i * 4],
                                    chunk[i * 4 + 1],
                                    chunk[i * 4 + 2],
                                    chunk[i * 4 + 3],
                                ]) as u64;
                        }
                        let mut size: u64 = 0;
                        for i in 0..size_cells_val {
                            size = (size << 32)
                                | u32::from_be_bytes([
                                    chunk[(addr_cells + i) * 4],
                                    chunk[(addr_cells + i) * 4 + 1],
                                    chunk[(addr_cells + i) * 4 + 2],
                                    chunk[(addr_cells + i) * 4 + 3],
                                ]) as u64;
                        }
                        memory_regions.push(FdtMemoryRegion {
                            starting_address: addr,
                            size,
                        });
                    }
                }
                break;
            }
        }
    }

    debug!("Found {} memory regions", memory_regions.len());

    let mut cpus = Vec::new();
    if let Some(cpus_node) = fdt.find_node("/cpus") {
        for child in cpus_node.children() {
            let device_type = child
                .property("device_type")
                .and_then(|p| core::str::from_utf8(p.value).ok())
                .map(|s| s.trim_end_matches('\0').to_string());

            let cpu_compatible: Vec<String> = child
                .property("compatible")
                .and_then(|p| {
                    core::str::from_utf8(p.value).ok().map(|s| {
                        s.split('\0')
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string())
                            .collect()
                    })
                })
                .unwrap_or_default();

            let reg = child.property("reg").map(|p| p.value.to_vec());

            let clock_frequency = child
                .property("clock-frequency")
                .and_then(|p| parse_u32_from_bytes(p.value));

            let timebase_frequency = child
                .property("timebase-frequency")
                .and_then(|p| parse_u32_from_bytes(p.value));

            let name = child.name.to_string();

            cpus.push(FdtCpu {
                name,
                device_type,
                compatible: cpu_compatible,
                reg,
                clock_frequency,
                timebase_frequency,
            });
        }
    }

    debug!("Found {} CPUs", cpus.len());

    let chosen_node = fdt.find_node("/chosen");
    let bootargs = chosen_node
        .as_ref()
        .and_then(|n| n.property("bootargs"))
        .and_then(|p| core::str::from_utf8(p.value).ok())
        .map(|s| s.trim_end_matches('\0').to_string());
    let stdout_path = chosen_node
        .as_ref()
        .and_then(|n| n.property("stdout-path"))
        .and_then(|p| core::str::from_utf8(p.value).ok())
        .map(|s| s.trim_end_matches('\0').to_string());
    let stdin_path = chosen_node
        .as_ref()
        .and_then(|n| n.property("stdin-path"))
        .and_then(|p| core::str::from_utf8(p.value).ok())
        .map(|s| s.trim_end_matches('\0').to_string());

    let linux_initrd_start = chosen_node.as_ref().and_then(|n| {
        n.property("linux,initrd-start")
            .and_then(|p| parse_u64_from_bytes(p.value))
    });
    let linux_initrd_end = chosen_node.as_ref().and_then(|n| {
        n.property("linux,initrd-end")
            .and_then(|p| parse_u64_from_bytes(p.value))
    });

    let mut total_nodes = 0;
    fn count_nodes(node: fdt::node::FdtNode<'_, '_>) -> usize {
        let mut count = 1;
        for child in node.children() {
            count += count_nodes(child);
        }
        count
    }
    if let Some(root_node) = fdt.find_node("/") {
        total_nodes = count_nodes(root_node);
    }

    debug!("Total nodes: {}", total_nodes);

    let fdt_info = FdtInfo {
        root: FdtRootInfo {
            model,
            compatible,
            address_cells,
            size_cells,
        },
        memory_regions,
        cpus,
        chosen: FdtChosen {
            bootargs,
            stdout_path,
            stdin_path,
            linux_initrd_start,
            linux_initrd_end,
        },
        total_nodes,
    };

    ParseFdtResult {
        success: true,
        message: format!(
            "Successfully parsed FDT with {} nodes, {} CPUs, {} memory regions",
            fdt_info.total_nodes,
            fdt_info.cpus.len(),
            fdt_info.memory_regions.len()
        ),
        fdt_info: Some(fdt_info),
    }
}

#[command]
pub async fn fdt_parse_from_file(file_path: String) -> ParseFdtResult {
    debug!("fdt_parse_from_file called: {}", file_path);

    let path = PathBuf::from(&file_path);
    if !path.exists() {
        error!("File not found: {}", file_path);
        return ParseFdtResult {
            success: false,
            message: format!("File not found: {}", file_path),
            fdt_info: None,
        };
    }

    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(e) => {
            error!("Failed to open file: {}", e);
            return ParseFdtResult {
                success: false,
                message: format!("Failed to open file: {}", e),
                fdt_info: None,
            };
        }
    };

    let mut data = Vec::new();
    if let Err(e) = file.read_to_end(&mut data) {
        error!("Failed to read file: {}", e);
        return ParseFdtResult {
            success: false,
            message: format!("Failed to read file: {}", e),
            fdt_info: None,
        };
    }

    parse_fdt_from_data(&data)
}

#[command]
pub async fn fdt_parse_from_data(data: Vec<u8>) -> ParseFdtResult {
    debug!("fdt_parse_from_data called, size: {} bytes", data.len());

    if data.is_empty() {
        warn!("Empty data provided");
        return ParseFdtResult {
            success: false,
            message: "Data is empty".to_string(),
            fdt_info: None,
        };
    }

    parse_fdt_from_data(&data)
}

#[command]
pub async fn fdt_get_node(data: Vec<u8>, node_path: String) -> GetNodeResult {
    debug!("fdt_get_node called: path={}", node_path);

    let fdt = match fdt::Fdt::new(&data) {
        Ok(f) => f,
        Err(e) => {
            error!("Failed to parse FDT: {:?}", e);
            return GetNodeResult {
                success: false,
                message: format!("Failed to parse FDT: {:?}", e),
                node: None,
            };
        }
    };

    let node = match fdt.find_node(&node_path) {
        Some(n) => n,
        None => {
            warn!("Node not found: {}", node_path);
            return GetNodeResult {
                success: false,
                message: format!("Node not found: {}", node_path),
                node: None,
            };
        }
    };

    let mut properties = Vec::new();
    for prop in node.properties() {
        properties.push(property_to_fdt_property(prop));
    }

    let children: Vec<String> = node
        .children()
        .map(|c| {
            if node_path.ends_with('/') {
                format!("{}{}", node_path, c.name)
            } else {
                format!("{}/{}", node_path, c.name)
            }
        })
        .collect();

    debug!(
        "Found node: {} with {} properties and {} children",
        node_path,
        properties.len(),
        children.len()
    );

    GetNodeResult {
        success: true,
        message: format!("Found node: {}", node_path),
        node: Some(FdtNode {
            name: node.name.to_string(),
            path: node_path,
            properties,
            children,
        }),
    }
}

#[command]
pub async fn fdt_get_property(
    data: Vec<u8>,
    node_path: String,
    property_name: String,
) -> GetPropertyResult {
    debug!(
        "fdt_get_property called: node={}, property={}",
        node_path, property_name
    );

    let fdt = match fdt::Fdt::new(&data) {
        Ok(f) => f,
        Err(e) => {
            error!("Failed to parse FDT: {:?}", e);
            return GetPropertyResult {
                success: false,
                message: format!("Failed to parse FDT: {:?}", e),
                property: None,
            };
        }
    };

    let node = match fdt.find_node(&node_path) {
        Some(n) => n,
        None => {
            warn!("Node not found: {}", node_path);
            return GetPropertyResult {
                success: false,
                message: format!("Node not found: {}", node_path),
                property: None,
            };
        }
    };

    let prop = match node.property(&property_name) {
        Some(p) => p,
        None => {
            warn!("Property not found: {} in {}", property_name, node_path);
            return GetPropertyResult {
                success: false,
                message: format!("Property not found: {} in {}", property_name, node_path),
                property: None,
            };
        }
    };

    debug!("Found property: {}", property_name);

    GetPropertyResult {
        success: true,
        message: format!("Found property: {}", property_name),
        property: Some(property_to_fdt_property(prop)),
    }
}

#[command]
pub async fn fdt_list_node_children(data: Vec<u8>, node_path: String) -> ListNodeChildrenResult {
    debug!("fdt_list_node_children called: path={}", node_path);

    let fdt = match fdt::Fdt::new(&data) {
        Ok(f) => f,
        Err(e) => {
            error!("Failed to parse FDT: {:?}", e);
            return ListNodeChildrenResult {
                success: false,
                message: format!("Failed to parse FDT: {:?}", e),
                children: vec![],
            };
        }
    };

    let node = match fdt.find_node(&node_path) {
        Some(n) => n,
        None => {
            warn!("Node not found: {}", node_path);
            return ListNodeChildrenResult {
                success: false,
                message: format!("Node not found: {}", node_path),
                children: vec![],
            };
        }
    };

    let children: Vec<String> = node.children().map(|c| c.name.to_string()).collect();

    debug!("Found {} children", children.len());

    ListNodeChildrenResult {
        success: true,
        message: format!("Found {} children", children.len()),
        children,
    }
}

#[command]
pub async fn fdt_find_compatible(
    data: Vec<u8>,
    compatible_string: String,
) -> ListNodeChildrenResult {
    debug!(
        "fdt_find_compatible called: compatible={}",
        compatible_string
    );

    let fdt = match fdt::Fdt::new(&data) {
        Ok(f) => f,
        Err(e) => {
            error!("Failed to parse FDT: {:?}", e);
            return ListNodeChildrenResult {
                success: false,
                message: format!("Failed to parse FDT: {:?}", e),
                children: vec![],
            };
        }
    };

    let mut found_nodes = Vec::new();

    fn find_compatible_recursive(
        node: fdt::node::FdtNode<'_, '_>,
        compatible: &str,
        results: &mut Vec<String>,
    ) {
        if let Some(node_compatible) = node.compatible() {
            if node_compatible.all().any(|c| c == compatible) {
                results.push(node.name.to_string());
            }
        }
        for child in node.children() {
            find_compatible_recursive(child, compatible, results);
        }
    }

    if let Some(root) = fdt.find_node("/") {
        find_compatible_recursive(root, &compatible_string, &mut found_nodes);
    }

    debug!(
        "Found {} nodes with compatible: {}",
        found_nodes.len(),
        compatible_string
    );

    ListNodeChildrenResult {
        success: true,
        message: format!(
            "Found {} nodes with compatible: {}",
            found_nodes.len(),
            compatible_string
        ),
        children: found_nodes,
    }
}

fn format_property_value(prop: &FdtProperty) -> String {
    if let Some(ref value) = prop.value {
        if !value.is_empty() {
            let has_non_printable = value
                .chars()
                .any(|c| c.is_control() && c != '\n' && c != '\t');
            if has_non_printable {
                if let Some(ref raw) = prop.raw_value {
                    if raw.len() == 4 {
                        let num = u32::from_be_bytes([raw[0], raw[1], raw[2], raw[3]]);
                        return format!("<0x{:X}>", num);
                    }
                    if raw.len() == 8 {
                        let num = u64::from_be_bytes([
                            raw[0], raw[1], raw[2], raw[3], raw[4], raw[5], raw[6], raw[7],
                        ]);
                        return format!("<0x{:X}>", num);
                    }
                    let hex_str = raw
                        .iter()
                        .map(|b| format!("{:02x}", b))
                        .collect::<Vec<_>>()
                        .join(" ");
                    return format!("[{}]", hex_str);
                }
            }
            let escaped = value
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\n', "\\n")
                .replace('\t', "\\t");
            return format!("\"{}\"", escaped);
        }
    }
    if let Some(ref raw) = prop.raw_value {
        if raw.is_empty() {
            return "\"\"".to_string();
        }
        if raw.len() == 4 {
            let num = u32::from_be_bytes([raw[0], raw[1], raw[2], raw[3]]);
            return format!("<0x{:X}>", num);
        }
        if raw.len() == 8 {
            let num = u64::from_be_bytes([
                raw[0], raw[1], raw[2], raw[3], raw[4], raw[5], raw[6], raw[7],
            ]);
            return format!("<0x{:X}>", num);
        }
        let hex_str = raw
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<_>>()
            .join(" ");
        return format!("[{}]", hex_str);
    }
    "\"\"".to_string()
}

#[command]
pub async fn fdt_generate_dts(data: Vec<u8>) -> GenerateDtsResult {
    debug!("fdt_generate_dts called");

    let fdt = match fdt::Fdt::new(&data) {
        Ok(f) => f,
        Err(e) => {
            error!("Failed to parse FDT: {:?}", e);
            return GenerateDtsResult {
                success: false,
                message: format!("Failed to parse FDT: {:?}", e),
                dts: None,
            };
        }
    };

    let mut lines: Vec<String> = Vec::new();
    lines.push("/dts-v1/;".to_string());
    lines.push("".to_string());
    lines.push("/ {".to_string());

    if let Some(root_node) = fdt.find_node("/") {
        for prop in root_node.properties() {
            let fdt_prop = property_to_fdt_property(prop);
            lines.push(format!(
                "\t{} = {};",
                fdt_prop.name,
                format_property_value(&fdt_prop)
            ));
        }
    }

    fn print_node(fdt: &fdt::Fdt<'_>, node_path: &str, indent: &str, lines: &mut Vec<String>) {
        let node = match fdt.find_node(node_path) {
            Some(n) => n,
            None => return,
        };

        let child_indent = format!("{}\t", indent);

        for child in node.children() {
            let child_name = child.name.to_string();
            lines.push(format!("{}{} {{", indent, child_name));

            for prop in child.properties() {
                let fdt_prop = property_to_fdt_property(prop);
                lines.push(format!(
                    "{}{} = {};",
                    child_indent,
                    fdt_prop.name,
                    format_property_value(&fdt_prop)
                ));
            }

            let child_path = if node_path.ends_with('/') {
                format!("{}{}", node_path, child_name)
            } else {
                format!("{}/{}", node_path, child_name)
            };
            print_node(fdt, &child_path, &child_indent, lines);
            lines.push(format!("{}}};", indent));
        }
    }

    print_node(&fdt, "/", "\t", &mut lines);

    lines.push("};".to_string());

    debug!("DTS generated successfully, {} lines", lines.len());

    GenerateDtsResult {
        success: true,
        message: "DTS generated successfully".to_string(),
        dts: Some(lines.join("\n")),
    }
}
