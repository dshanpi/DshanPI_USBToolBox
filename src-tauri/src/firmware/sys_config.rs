use crate::firmware::common::parse_number;
use crate::firmware::types::{GpioConfigDto, SysConfigDto, TwiParaDto, UartParaDto};

pub fn parse_sys_config(data: &[u8]) -> Result<SysConfigDto, String> {
    let content = String::from_utf8_lossy(data);
    let mut current_section = String::new();
    let mut config = SysConfigDto {
        debug_mode: 8,
        storage_type: -1,
        twi_para: TwiParaDto {
            twi_port: 0,
            twi_scl: None,
            twi_sda: None,
        },
        uart_para: UartParaDto {
            uart_baud_rate: 115200,
            uart_debug_port: 0,
            uart_debug_tx: None,
            uart_debug_rx: None,
        },
    };

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            current_section = line[1..line.len() - 1].to_string();
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        match current_section.as_str() {
            "platform" if key == "debug_mode" => config.debug_mode = parse_number(value)? as i32,
            "target" if key == "storage_type" => config.storage_type = parse_number(value)? as i32,
            "twi_para" => match key {
                "twi_port" => config.twi_para.twi_port = parse_number(value)? as i32,
                "twi_scl" => config.twi_para.twi_scl = parse_gpio_config(value),
                "twi_sda" => config.twi_para.twi_sda = parse_gpio_config(value),
                _ => {}
            },
            "uart_para" => match key {
                "uart_baudrate" => config.uart_para.uart_baud_rate = parse_number(value)? as i32,
                "uart_debug_port" => config.uart_para.uart_debug_port = parse_number(value)? as i32,
                "uart_debug_tx" => config.uart_para.uart_debug_tx = parse_gpio_config(value),
                "uart_debug_rx" => config.uart_para.uart_debug_rx = parse_gpio_config(value),
                _ => {}
            },
            _ => {}
        }
    }

    Ok(config)
}

fn parse_gpio_config(value: &str) -> Option<GpioConfigDto> {
    let rest = value.trim().strip_prefix("port:P")?;
    let bank = rest.chars().next()?.to_string();
    let rest = &rest[1..];
    let first_sep = rest.find('<')?;
    let pin = rest[..first_sep].parse::<u32>().ok()?;
    let mut parts = rest[first_sep..]
        .split('<')
        .skip(1)
        .filter_map(|part| part.split('>').next())
        .map(|part| part.to_string());
    Some(GpioConfigDto {
        port: "P".to_string(),
        bank,
        pin,
        function: parts.next()?.parse().ok()?,
        pull: parts.next()?,
        drive: parts.next()?,
        level: parts.next()?,
    })
}
