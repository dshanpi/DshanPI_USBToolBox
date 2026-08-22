use std::sync::Arc;

use tauri::State;

use crate::ch347::Ch347State;

fn unavailable(state: &Ch347State) -> String {
    state
        .dll_error()
        .unwrap_or("CH347 is only supported on Windows")
        .to_string()
}

fn unsupported<T>(state: &Ch347State) -> Result<T, String> {
    Err(unavailable(state))
}

#[tauri::command]
pub fn ch347_runtime_info(state: State<'_, Arc<Ch347State>>) -> serde_json::Value {
    serde_json::json!({
        "available": false,
        "path": serde_json::Value::Null,
        "error": state.dll_error(),
    })
}

#[tauri::command]
pub async fn ch347_list_devices(
    state: State<'_, Arc<Ch347State>>,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(list_devices_core(&state))
}

pub fn list_devices_core(_state: &Ch347State) -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn ch347_open(state: State<'_, Arc<Ch347State>>, index: u32) -> Result<(), String> {
    open_core(&state, index)
}

pub fn open_core(state: &Ch347State, index: u32) -> Result<(), String> {
    let _ = index;
    unsupported(state)
}

#[tauri::command]
pub fn ch347_close(state: State<'_, Arc<Ch347State>>, index: u32) -> Result<(), String> {
    close_core(&state, index)
}

pub fn close_core(state: &Ch347State, index: u32) -> Result<(), String> {
    let _ = index;
    unsupported(state)
}

#[tauri::command]
pub fn ch347_reopen(state: State<'_, Arc<Ch347State>>, index: u32) -> Result<(), String> {
    reopen_core(&state, index)
}

pub fn reopen_core(state: &Ch347State, index: u32) -> Result<(), String> {
    let _ = index;
    unsupported(state)
}

#[tauri::command]
pub fn ch347_i2c_transfer(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    write_data: Vec<u8>,
    read_len: u32,
    speed_khz: Option<u32>,
    scl_stretch: Option<bool>,
    delay_ms: Option<u32>,
) -> Result<Vec<u8>, String> {
    i2c_transfer_core(
        &state,
        index,
        write_data,
        read_len,
        speed_khz,
        scl_stretch,
        delay_ms,
    )
}

pub fn i2c_transfer_core(
    state: &Ch347State,
    index: u32,
    write_data: Vec<u8>,
    read_len: u32,
    speed_khz: Option<u32>,
    scl_stretch: Option<bool>,
    delay_ms: Option<u32>,
) -> Result<Vec<u8>, String> {
    let _ = (
        index,
        write_data,
        read_len,
        speed_khz,
        scl_stretch,
        delay_ms,
    );
    unsupported(state)
}

#[tauri::command]
pub fn ch347_i2c_scan(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    speed_khz: Option<u32>,
    scl_stretch: Option<bool>,
    delay_ms: Option<u32>,
) -> Result<Vec<u32>, String> {
    i2c_scan_core(&state, index, speed_khz, scl_stretch, delay_ms)
}

pub fn i2c_scan_core(
    state: &Ch347State,
    index: u32,
    speed_khz: Option<u32>,
    scl_stretch: Option<bool>,
    delay_ms: Option<u32>,
) -> Result<Vec<u32>, String> {
    let _ = (index, speed_khz, scl_stretch, delay_ms);
    unsupported(state)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn ch347_spi_init(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    mode: Option<u8>,
    speed_mhz: Option<u32>,
    frequency_hz: Option<u32>,
    cs: Option<u32>,
    data_bits: Option<u8>,
    byte_order: Option<u8>,
    write_read_interval: Option<u16>,
    out_default_data: Option<u8>,
    cs1_polarity: Option<u8>,
    cs2_polarity: Option<u8>,
    is_auto_deactive_cs: Option<u16>,
    active_delay: Option<u16>,
    delay_deactive: Option<u32>,
) -> Result<(), String> {
    spi_init_core(
        &state,
        index,
        mode,
        speed_mhz,
        frequency_hz,
        cs,
        data_bits,
        byte_order,
        write_read_interval,
        out_default_data,
        cs1_polarity,
        cs2_polarity,
        is_auto_deactive_cs,
        active_delay,
        delay_deactive,
    )
}

#[allow(clippy::too_many_arguments)]
pub fn spi_init_core(
    state: &Ch347State,
    index: u32,
    mode: Option<u8>,
    speed_mhz: Option<u32>,
    frequency_hz: Option<u32>,
    cs: Option<u32>,
    data_bits: Option<u8>,
    byte_order: Option<u8>,
    write_read_interval: Option<u16>,
    out_default_data: Option<u8>,
    cs1_polarity: Option<u8>,
    cs2_polarity: Option<u8>,
    is_auto_deactive_cs: Option<u16>,
    active_delay: Option<u16>,
    delay_deactive: Option<u32>,
) -> Result<(), String> {
    let _ = (
        index,
        mode,
        speed_mhz,
        frequency_hz,
        cs,
        data_bits,
        byte_order,
        write_read_interval,
        out_default_data,
        cs1_polarity,
        cs2_polarity,
        is_auto_deactive_cs,
        active_delay,
        delay_deactive,
    );
    unsupported(state)
}

#[tauri::command]
pub fn ch347_spi_get_config(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
) -> Result<serde_json::Value, String> {
    let _ = index;
    unsupported(&state)
}

#[tauri::command]
pub fn ch347_spi_set_frequency(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    frequency_hz: u32,
) -> Result<(), String> {
    let _ = (index, frequency_hz);
    unsupported(&state)
}

#[tauri::command]
pub fn ch347_spi_set_data_bits(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    data_bits: u8,
) -> Result<(), String> {
    let _ = (index, data_bits);
    unsupported(&state)
}

#[tauri::command]
pub fn ch347_spi_change_cs(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    status: u8,
) -> Result<(), String> {
    let _ = (index, status);
    unsupported(&state)
}

#[tauri::command]
pub fn ch347_spi_set_chip_select(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    enable_select: u16,
    chip_select: u16,
    is_auto_deactive_cs: u32,
    active_delay: u32,
    delay_deactive: u32,
) -> Result<(), String> {
    let _ = (
        index,
        enable_select,
        chip_select,
        is_auto_deactive_cs,
        active_delay,
        delay_deactive,
    );
    unsupported(&state)
}

#[tauri::command]
pub fn ch347_spi_write(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    tx_data: Vec<u8>,
    cs: Option<u32>,
    mode: Option<u8>,
    speed_mhz: Option<u32>,
    data_bits: Option<u8>,
) -> Result<(), String> {
    let _ = (mode, speed_mhz, data_bits);
    spi_write_core(&state, index, tx_data, cs)
}

pub fn spi_write_core(
    state: &Ch347State,
    index: u32,
    tx_data: Vec<u8>,
    cs: Option<u32>,
) -> Result<(), String> {
    let _ = (index, tx_data, cs);
    unsupported(state)
}

#[tauri::command]
pub async fn ch347_spi_fill(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    color: Vec<u8>,
    pixel_count: u32,
    cs: Option<u32>,
) -> Result<(), String> {
    let _ = (index, color, pixel_count, cs);
    unsupported(&state)
}

#[tauri::command]
pub async fn ch347_spi_write_buffer(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    data: Vec<u8>,
    cs: Option<u32>,
) -> Result<(), String> {
    let _ = (index, data, cs);
    unsupported(&state)
}

#[tauri::command]
pub fn ch347_spi_read(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    read_len: u32,
    cs: Option<u32>,
    mode: Option<u8>,
    speed_mhz: Option<u32>,
    data_bits: Option<u8>,
) -> Result<Vec<u8>, String> {
    let _ = (mode, speed_mhz, data_bits);
    spi_read_core(&state, index, read_len, cs)
}

pub fn spi_read_core(
    state: &Ch347State,
    index: u32,
    read_len: u32,
    cs: Option<u32>,
) -> Result<Vec<u8>, String> {
    let _ = (index, read_len, cs);
    unsupported(state)
}

#[tauri::command]
pub fn ch347_spi_transfer(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    tx_data: Vec<u8>,
    cs: Option<u32>,
    mode: Option<u8>,
    speed_mhz: Option<u32>,
    data_bits: Option<u8>,
) -> Result<Vec<u8>, String> {
    let _ = (mode, speed_mhz, data_bits);
    spi_transfer_core(&state, index, tx_data, cs)
}

pub fn spi_transfer_core(
    state: &Ch347State,
    index: u32,
    tx_data: Vec<u8>,
    cs: Option<u32>,
) -> Result<Vec<u8>, String> {
    let _ = (index, tx_data, cs);
    unsupported(state)
}

#[tauri::command]
pub fn ch347_spi_stream4(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    tx_data: Vec<u8>,
    cs: Option<u32>,
    mode: Option<u8>,
    speed_mhz: Option<u32>,
    data_bits: Option<u8>,
) -> Result<Vec<u8>, String> {
    let _ = (index, tx_data, cs, mode, speed_mhz, data_bits);
    unsupported(&state)
}

#[tauri::command]
pub fn ch347_gpio_get(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
) -> Result<serde_json::Value, String> {
    let (direction, data) = gpio_get_core(&state, index)?;
    Ok(serde_json::json!({ "direction": direction, "data": data }))
}

pub fn gpio_get_core(state: &Ch347State, index: u32) -> Result<(u8, u8), String> {
    let _ = index;
    unsupported(state)
}

#[tauri::command]
pub fn ch347_gpio_set(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    enable: u8,
    dir_out: u8,
    data_out: u8,
) -> Result<(), String> {
    gpio_set_core(&state, index, enable, dir_out, data_out)
}

pub fn gpio_set_core(
    state: &Ch347State,
    index: u32,
    enable: u8,
    dir_out: u8,
    data_out: u8,
) -> Result<(), String> {
    let _ = (index, enable, dir_out, data_out);
    unsupported(state)
}
