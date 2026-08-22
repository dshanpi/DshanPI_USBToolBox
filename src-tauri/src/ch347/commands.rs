use std::mem;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use tauri::{command, State};
use windows::core::{s, PCSTR, PCWSTR};
use windows::Win32::Devices::DeviceAndDriverInstallation::{
    SetupDiDestroyDeviceInfoList, SetupDiGetClassDevsW, SetupDiGetDeviceRegistryPropertyW,
    SetupDiOpenDeviceInfoW, DIGCF_ALLCLASSES, DIGCF_PRESENT, SPDRP_FRIENDLYNAME, SP_DEVINFO_DATA,
};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::System::LibraryLoader::GetProcAddress;

use crate::ch347::{load_selected_library, Ch347State};

// --- CH347 FFI types ---

type FnOpen = unsafe extern "system" fn(u32) -> HANDLE;
type FnClose = unsafe extern "system" fn(u32) -> i32;
type FnStreamI2C = unsafe extern "system" fn(u32, u32, *const u8, u32, *mut u8) -> i32;
type FnStreamI2C_RetACK =
    unsafe extern "system" fn(u32, u32, *const u8, u32, *mut u8, *mut u32) -> i32;
type FnI2CSet = unsafe extern "system" fn(u32, u32) -> i32;
type FnI2CSetStretch = unsafe extern "system" fn(u32, i32) -> i32;
type FnI2CSetDelaymS = unsafe extern "system" fn(u32, u32) -> i32;
type FnSpiInit = unsafe extern "system" fn(u32, *const SpiCfg) -> i32;
type FnSpiWriteRead = unsafe extern "system" fn(u32, u32, u32, *mut u8) -> i32;
type FnSpiWrite = unsafe extern "system" fn(u32, u32, u32, u32, *mut u8) -> i32;
type FnSpiRead = unsafe extern "system" fn(u32, u32, u32, *mut u32, *mut u8) -> i32;
type FnSpiSetFrequency = unsafe extern "system" fn(u32, u32) -> i32;
type FnSpiSetDataBits = unsafe extern "system" fn(u32, u8) -> i32;
type FnSpiChangeCS = unsafe extern "system" fn(u32, u8) -> i32;
type FnSpiSetChipSelect = unsafe extern "system" fn(u32, u16, u16, u32, u32, u32) -> i32;
type FnSpiGetCfg = unsafe extern "system" fn(u32, *mut SpiCfg) -> i32;
type FnStreamSPI4 = unsafe extern "system" fn(u32, u32, u32, *mut u8) -> i32;
type FnGpioGet = unsafe extern "system" fn(u32, *mut u8, *mut u8) -> i32;
type FnGpioSet = unsafe extern "system" fn(u32, u8, u8, u8) -> i32;
type FnSetTimeout = unsafe extern "system" fn(u32, u32, u32) -> i32;
type FnGetDeviceInfor = unsafe extern "system" fn(u32, *mut DevInfor) -> i32;
type FnGetChipType = unsafe extern "system" fn(u32) -> u8;
type DeviceNotifyCallback = extern "system" fn(u32);
type FnSetDeviceNotify =
    unsafe extern "system" fn(u32, *const u8, Option<DeviceNotifyCallback>) -> i32;

const CH347_DEVICE_ID_PREFIX: &[u8] = b"VID_1A86&PID_55\0";
const CH347_DEVICE_REMOVE: u32 = 0;
static REMOVED_DEVICE_MASK: AtomicU32 = AtomicU32::new(0);

fn handle_device_notification(index: u32, status: u32) {
    if status == CH347_DEVICE_REMOVE {
        REMOVED_DEVICE_MASK.fetch_or(1 << index, Ordering::SeqCst);
    }
    crate::ch347::device_notifier::emit_change();
}

macro_rules! device_notify_callback {
    ($name:ident, $index:expr) => {
        extern "system" fn $name(status: u32) {
            handle_device_notification($index, status);
        }
    };
}

device_notify_callback!(device_notify_0, 0);
device_notify_callback!(device_notify_1, 1);
device_notify_callback!(device_notify_2, 2);
device_notify_callback!(device_notify_3, 3);
device_notify_callback!(device_notify_4, 4);
device_notify_callback!(device_notify_5, 5);
device_notify_callback!(device_notify_6, 6);
device_notify_callback!(device_notify_7, 7);
device_notify_callback!(device_notify_8, 8);
device_notify_callback!(device_notify_9, 9);
device_notify_callback!(device_notify_10, 10);
device_notify_callback!(device_notify_11, 11);
device_notify_callback!(device_notify_12, 12);
device_notify_callback!(device_notify_13, 13);
device_notify_callback!(device_notify_14, 14);
device_notify_callback!(device_notify_15, 15);

const DEVICE_NOTIFY_CALLBACKS: [DeviceNotifyCallback; 16] = [
    device_notify_0,
    device_notify_1,
    device_notify_2,
    device_notify_3,
    device_notify_4,
    device_notify_5,
    device_notify_6,
    device_notify_7,
    device_notify_8,
    device_notify_9,
    device_notify_10,
    device_notify_11,
    device_notify_12,
    device_notify_13,
    device_notify_14,
    device_notify_15,
];

// 对应 CH347DLL.H 的 mSpiCfgS，官方用 #pragma pack(1) 1字节对齐。
// 必须用 packed，否则 #[repr(C)] 默认按自然对齐填充，chip_select 等字段会错位，
// 导致 CH347SPI_Init 收到错误的 CS/autoDeactiveCS 配置 → SPI 行为异常 → 屏幕乱码。
#[repr(C, packed)]
#[derive(Clone)]
struct SpiCfg {
    mode: u8,
    clock: u8,
    byte_order: u8,
    write_read_interval: u16,
    out_default_data: u8,
    chip_select: u32,
    cs1_polarity: u8,
    cs2_polarity: u8,
    is_auto_deactive_cs: u16,
    active_delay: u16,
    delay_deactive: u32,
}

#[repr(C)]
struct DevInfor {
    index: u8,
    device_path: [u8; 260],
    usb_class: u8,
    func_type: u8,
    device_id: [u8; 64],
    chip_mode: u8,
    dev_handle: HANDLE,
    bulk_out_max_size: u16,
    bulk_in_max_size: u16,
    usb_speed_type: u8,
    ch347_if_num: u8,
    data_up_endp: u8,
    data_dn_endp: u8,
    product_string: [u8; 64],
    manufacturer_string: [u8; 64],
    write_timeout: u32,
    read_timeout: u32,
    func_desc_str: [u8; 64],
    firmware_ver: u8,
}

fn ptr_to_str(bytes: &[u8]) -> String {
    String::from_utf8_lossy(
        &bytes
            .iter()
            .take_while(|&&b| b != 0)
            .copied()
            .collect::<Vec<u8>>(),
    )
    .to_string()
}

/// Convert a CreateFile-style device interface path into the corresponding
/// Windows device-instance ID used by SetupAPI.
///
/// Example:
/// `\\?\usb#vid_1a86&pid_55de&mi_04#7&abc&0&0004#{guid}` becomes
/// `usb\vid_1a86&pid_55de&mi_04\7&abc&0&0004`.
fn device_instance_id_from_path(device_path: &str) -> Option<String> {
    let path = device_path.trim();
    let path = path
        .strip_prefix("\\\\?\\")
        .or_else(|| path.strip_prefix("\\\\.\\"))
        .unwrap_or(path);
    let instance_part = path.split_once("#{").map_or(path, |(value, _)| value);
    let instance_id = instance_part.replace('#', "\\");
    if instance_id.is_empty() || !instance_id.contains('\\') {
        None
    } else {
        Some(instance_id)
    }
}

/// Read the exact FriendlyName shown by Device Manager for a CH347 interface.
/// Failure is intentionally non-fatal because unmodified WCH drivers may not
/// define a FriendlyName; callers keep the DLL-derived device name as fallback.
fn windows_friendly_name(device_path: &str) -> Option<String> {
    let instance_id = device_instance_id_from_path(device_path)?;
    let instance_id_wide: Vec<u16> = instance_id.encode_utf16().chain(Some(0)).collect();

    unsafe {
        let device_info_set =
            SetupDiGetClassDevsW(None, PCWSTR::null(), None, DIGCF_PRESENT | DIGCF_ALLCLASSES)
                .ok()?;

        let result = (|| {
            let mut device_info = SP_DEVINFO_DATA {
                cbSize: mem::size_of::<SP_DEVINFO_DATA>() as u32,
                ..Default::default()
            };
            SetupDiOpenDeviceInfoW(
                device_info_set,
                PCWSTR(instance_id_wide.as_ptr()),
                None,
                0,
                Some(&mut device_info),
            )
            .ok()?;

            let mut property_buffer = vec![0u8; 1024];
            let mut required_size = 0u32;
            SetupDiGetDeviceRegistryPropertyW(
                device_info_set,
                &device_info,
                SPDRP_FRIENDLYNAME,
                None,
                Some(property_buffer.as_mut_slice()),
                Some(&mut required_size),
            )
            .ok()?;

            let used = (required_size as usize).min(property_buffer.len());
            let utf16: Vec<u16> = property_buffer[..used]
                .chunks_exact(2)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                .take_while(|value| *value != 0)
                .collect();
            let friendly_name = String::from_utf16(&utf16).ok()?.trim().to_string();
            (!friendly_name.is_empty()).then_some(friendly_name)
        })();

        let _ = SetupDiDestroyDeviceInfoList(device_info_set);
        result
    }
}

struct Ch347Ffi {
    open: FnOpen,
    close: FnClose,
    stream_i2c: FnStreamI2C,
    stream_i2c_ret_ack: FnStreamI2C_RetACK,
    i2c_set: FnI2CSet,
    i2c_set_stretch: FnI2CSetStretch,
    i2c_set_delay_ms: FnI2CSetDelaymS,
    spi_init: FnSpiInit,
    spi_write_read: FnSpiWriteRead,
    spi_write: FnSpiWrite,
    spi_read: FnSpiRead,
    spi_set_frequency: FnSpiSetFrequency,
    spi_set_data_bits: FnSpiSetDataBits,
    spi_change_cs: FnSpiChangeCS,
    spi_set_chip_select: FnSpiSetChipSelect,
    spi_get_cfg: FnSpiGetCfg,
    spi_stream4: FnStreamSPI4,
    gpio_get: FnGpioGet,
    gpio_set: FnGpioSet,
    set_timeout: FnSetTimeout,
    get_device_infor: FnGetDeviceInfor,
    get_chip_type: FnGetChipType,
    set_device_notify: Option<FnSetDeviceNotify>,
}

impl Ch347Ffi {
    unsafe fn load() -> Option<Self> {
        let library = match load_selected_library() {
            Ok(module) => module,
            Err(error) => {
                log::error!("Failed to load CH347 runtime: {error}");
                return None;
            }
        };
        log::debug!("CH347 DLL loaded, resolving functions...");
        let get = |name: PCSTR| -> Option<unsafe extern "system" fn() -> isize> {
            unsafe { GetProcAddress(library, name) }
        };
        Some(Self {
            open: mem::transmute(get(s!("CH347OpenDevice"))?),
            close: mem::transmute(get(s!("CH347CloseDevice"))?),
            stream_i2c: mem::transmute(get(s!("CH347StreamI2C"))?),
            stream_i2c_ret_ack: mem::transmute(get(s!("CH347StreamI2C_RetACK"))?),
            i2c_set: mem::transmute(get(s!("CH347I2C_Set"))?),
            i2c_set_stretch: mem::transmute(get(s!("CH347I2C_SetStretch"))?),
            i2c_set_delay_ms: mem::transmute(get(s!("CH347I2C_SetDelaymS"))?),
            spi_init: mem::transmute(get(s!("CH347SPI_Init"))?),
            spi_write_read: mem::transmute(get(s!("CH347SPI_WriteRead"))?),
            spi_write: mem::transmute(get(s!("CH347SPI_Write"))?),
            spi_read: mem::transmute(get(s!("CH347SPI_Read"))?),
            spi_set_frequency: mem::transmute(get(s!("CH347SPI_SetFrequency"))?),
            spi_set_data_bits: mem::transmute(get(s!("CH347SPI_SetDataBits"))?),
            spi_change_cs: mem::transmute(get(s!("CH347SPI_ChangeCS"))?),
            spi_set_chip_select: mem::transmute(get(s!("CH347SPI_SetChipSelect"))?),
            spi_get_cfg: mem::transmute(get(s!("CH347SPI_GetCfg"))?),
            spi_stream4: mem::transmute(get(s!("CH347StreamSPI4"))?),
            gpio_get: mem::transmute(get(s!("CH347GPIO_Get"))?),
            gpio_set: mem::transmute(get(s!("CH347GPIO_Set"))?),
            set_timeout: mem::transmute(get(s!("CH347SetTimeout"))?),
            get_device_infor: mem::transmute(get(s!("CH347GetDeviceInfor"))?),
            get_chip_type: mem::transmute(get(s!("CH347GetChipType"))?),
            set_device_notify: get(s!("CH347SetDeviceNotify"))
                .map(|function| mem::transmute(function)),
        })
    }
}

fn to_bool(v: i32) -> bool {
    v != 0
}

unsafe fn register_device_notification(ffi: &Ch347Ffi, index: u32) {
    let Some(set_device_notify) = ffi.set_device_notify else {
        log::warn!("CH347SetDeviceNotify is unavailable; using Windows device notifications only");
        return;
    };
    let Some(callback) = DEVICE_NOTIFY_CALLBACKS.get(index as usize).copied() else {
        log::warn!("Cannot register CH347 device notification for out-of-range index {index}");
        return;
    };
    if to_bool(set_device_notify(
        index,
        CH347_DEVICE_ID_PREFIX.as_ptr(),
        Some(callback),
    )) {
        log::info!("CH347 device {index} removal notification registered");
    } else {
        log::warn!("Failed to register CH347 device {index} removal notification");
    }
}

unsafe fn unregister_device_notification(ffi: &Ch347Ffi, index: u32) {
    if let Some(set_device_notify) = ffi.set_device_notify {
        let _ = set_device_notify(index, CH347_DEVICE_ID_PREFIX.as_ptr(), None);
    }
}

fn take_removed_device_indices() -> Vec<u32> {
    let mask = REMOVED_DEVICE_MASK.swap(0, Ordering::SeqCst);
    (0..16u32)
        .filter(|index| mask & (1 << index) != 0)
        .collect()
}

/// 读取一个【已打开】设备的描述信息，构造统一的设备条目 JSON。
///
/// GetDeviceInfor/GetChipType 都是对已打开句柄的只读查询（见 CH347Demo EnumDevice：
/// 在 Open 与 Close 之间调用），不 open/close、不触碰 SPI/I2C 数据管线，可安全用于
/// 扫描和热插拔心跳轮询。
///
/// 关键：扫描分支与"已打开设备"分支都用这个函数生成条目，保证设备打开前后名字一致 ——
/// 否则打开后名字会从 "CH347T: <desc>" 退化成 "CH347 #i"，让用户误以为选择被重置成了 #0。
///
/// # Safety
/// 调用方必须保证 `i` 对应的设备已经 open（句柄有效），且 `ffi` 指向有效的 DLL 函数表。
unsafe fn build_device_entry(ffi: &Ch347Ffi, i: u32) -> serde_json::Value {
    let mut info = DevInfor {
        index: 0,
        device_path: [0u8; 260],
        usb_class: 0,
        func_type: 0,
        device_id: [0u8; 64],
        chip_mode: 0,
        dev_handle: HANDLE::default(),
        bulk_out_max_size: 0,
        bulk_in_max_size: 0,
        usb_speed_type: 0,
        ch347_if_num: 0,
        data_up_endp: 0,
        data_dn_endp: 0,
        product_string: [0u8; 64],
        manufacturer_string: [0u8; 64],
        write_timeout: 0,
        read_timeout: 0,
        func_desc_str: [0u8; 64],
        firmware_ver: 0,
    };
    let _ = (ffi.get_device_infor)(i, &mut info);
    let device_path = ptr_to_str(&info.device_path);
    let device_id = ptr_to_str(&info.device_id);
    let friendly_name = windows_friendly_name(&device_path);
    let desc = ptr_to_str(&info.func_desc_str);
    let chip_type = (ffi.get_chip_type)(i);
    let chip_name = match chip_type {
        0 => "CH341",
        1 => "CH347T",
        2 => "CH347F",
        3 => "CH339W",
        _ => "?",
    };
    let name = if desc.is_empty() {
        format!("{} #{}", chip_name, i)
    } else {
        format!("{}: {}", chip_name, desc)
    };
    serde_json::json!({
        "index": i,
        "name": name,
        "friendlyName": friendly_name,
        "chipType": chip_type,
        "chipName": chip_name,
        "desc": desc,
        "usbClass": info.usb_class,
        "funcType": info.func_type,
        "chipMode": info.chip_mode,
        "interfaceNumber": info.ch347_if_num,
        "firmwareVersion": info.firmware_ver,
        "devicePath": device_path,
        "deviceId": device_id,
        "product": ptr_to_str(&info.product_string),
        "manufacturer": ptr_to_str(&info.manufacturer_string),
    })
}

/// List available CH347 devices (scans indices 0-15, matches reference code EnumDevice)
///
/// 注意：扫描时会对每个索引调 open(i)+close(i) 来探测设备是否存在。
/// 但对**已经被应用打开的设备**（在 active_devices 里），绝不能再 open/close ——
/// 否则会破坏当前进行中的 SPI/I2C 会话（导致后续 spi_init 等操作失败，
/// 表现为前端轮询热插拔时把正在用的设备 close 掉）。
/// 这些已打开的设备直接当作"存在"加入结果，用简化名字 "CH347 #{i}"。
#[command]
pub fn ch347_runtime_info(state: State<'_, Arc<Ch347State>>) -> serde_json::Value {
    serde_json::json!({
        "available": state.is_available(),
        "path": state.dll_path().map(|path| path.to_string_lossy().into_owned()),
        "error": state.dll_error(),
    })
}

#[command]
pub async fn ch347_list_devices(
    state: State<'_, Arc<Ch347State>>,
) -> Result<Vec<serde_json::Value>, String> {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || list_devices_core(&state))
        .await
        .map_err(|error| format!("CH347 device scan task failed: {error}"))
}

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
pub fn list_devices_core(state: &Ch347State) -> Vec<serde_json::Value> {
    if !state.is_available() {
        log::info!("ch347_list_devices: DLL not available");
        return vec![];
    }
    let _operation_guard = state.lock_operations();
    // CH347GetDeviceInfor 在物理拔出后可能继续返回缓存信息，因此不能单独作为存活依据。
    // 官方 CH347SetDeviceNotify 回调确认拔出后，先清除引用计数；加载 DLL 后再关闭其
    // 失效句柄，随后让常规 open 探测决定设备是否还存在。
    let removed_indices = take_removed_device_indices();
    if !removed_indices.is_empty() {
        if let Ok(mut counts) = state.open_count.lock() {
            for index in &removed_indices {
                counts.remove(index);
            }
        }
    }

    // 取出当前已打开的设备索引集合 —— 这些索引扫描时跳过 open/close
    let active_set: std::collections::HashSet<u32> = state
        .open_count
        .lock()
        .map(|m| m.keys().copied().collect())
        .unwrap_or_default();

    let mut devices = Vec::new();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            for index in &removed_indices {
                log::info!(
                    "CH347 device {index} removal confirmed; clearing stale DLL handle and refcount"
                );
                let _ = (ffi.close)(*index);
            }
            log::info!(
                "ch347_list_devices: scanning indices 0-15 (skipping {} active)...",
                active_set.len()
            );
            for i in 0..16u32 {
                // 官方回调已明确确认本索引刚刚拔出，本轮不要再让 DLL 的缓存状态把它
                // 枚举回来。后续插入事件会触发新一轮正常 open 探测。
                if removed_indices.contains(&i) {
                    log::info!("  device {i} skipped after confirmed removal");
                    continue;
                }
                // 已打开的设备：不 open/close（会破坏会话），用设备信息接口做心跳探测。
                // 不能使用 CH347SPI_GetCfg：设备刚打开但尚未执行 SPI_Init 时，GetCfg 允许失败；
                // 把该失败当成拔出会关闭一个仍然在线的 CH347，正好破坏后续点屏初始化。
                if active_set.contains(&i) {
                    let mut info = DevInfor {
                        index: 0,
                        device_path: [0u8; 260],
                        usb_class: 0,
                        func_type: 0,
                        device_id: [0u8; 64],
                        chip_mode: 0,
                        dev_handle: HANDLE::default(),
                        bulk_out_max_size: 0,
                        bulk_in_max_size: 0,
                        usb_speed_type: 0,
                        ch347_if_num: 0,
                        data_up_endp: 0,
                        data_dn_endp: 0,
                        product_string: [0u8; 64],
                        manufacturer_string: [0u8; 64],
                        write_timeout: 0,
                        read_timeout: 0,
                        func_desc_str: [0u8; 64],
                        firmware_ver: 0,
                    };
                    let alive = (ffi.get_device_infor)(i, &mut info);
                    if to_bool(alive) {
                        log::info!("  device {} open & alive (GetDeviceInfor ok)", i);
                        // 设备仍在 —— 复用与扫描分支相同的命名逻辑，避免打开后名字退化成
                        // "CH347 #i"（让用户误以为选择被重置成了 #0）。GetDeviceInfor/GetChipType
                        // 是对已打开句柄的只读查询，不会破坏正在进行的 SPI/I2C 会话。
                        devices.push(build_device_entry(&ffi, i));
                    } else {
                        log::info!(
                            "  device {} was open but GetDeviceInfor failed — treat as gone",
                            i
                        );
                    }
                    continue;
                }
                let handle = (ffi.open)(i);
                if !handle.is_invalid() {
                    log::info!("  device {} opened successfully", i);
                    // 用与"已打开设备"分支相同的命名逻辑构造条目，保证名字一致。
                    let entry = build_device_entry(&ffi, i);
                    log::info!("    {}", entry["name"]);
                    devices.push(entry);
                    (ffi.close)(i);
                }
            }
            log::info!("ch347_list_devices: found {} device(s)", devices.len());
        } else {
            log::error!("ch347_list_devices: failed to resolve CH347DLL functions");
        }
    }
    devices
}

/// Open a CH347 device by index
#[command]
pub fn ch347_open(state: State<'_, Arc<Ch347State>>, index: u32) -> Result<(), String> {
    open_core(&state, index)
}

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
///
/// 引用计数：同一 index 可被多次 open（计数 +1），仅当计数从 0→1 时才真正调 DLL open。
/// 这样前端工具与 Python 脚本可共享同一设备，不会因重复 open 破坏 DLL 状态。
pub fn open_core(state: &Ch347State, index: u32) -> Result<(), String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    // 先判断是否已打开：若已打开（计数>0）只增计数，不重复调 DLL open（否则破坏 DLL 状态）
    let already_open = {
        let mut counts = state
            .open_count
            .lock()
            .map_err(|e| format!("Lock error: {e}"))?;
        let c = counts.entry(index).or_insert(0);
        *c += 1;
        *c > 1 // 之前就有打开者
    };
    if already_open {
        log::info!("CH347 device {} already open (refcount incremented)", index);
        return Ok(());
    }
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let handle = (ffi.open)(index);
            if handle.is_invalid() {
                // open 失败：回滚计数
                if let Ok(mut counts) = state.open_count.lock() {
                    if let Some(c) = counts.get_mut(&index) {
                        *c = c.saturating_sub(1);
                        if *c == 0 {
                            counts.remove(&index);
                        }
                    }
                }
                return Err(format!("Failed to open device {}", index));
            }
            (ffi.set_timeout)(index, 500, 500);
            register_device_notification(&ffi, index);
            log::info!("CH347 device {} opened", index);
            return Ok(());
        }
    }
    // DLL 加载失败：回滚计数
    if let Ok(mut counts) = state.open_count.lock() {
        if let Some(c) = counts.get_mut(&index) {
            *c = c.saturating_sub(1);
            if *c == 0 {
                counts.remove(&index);
            }
        }
    }
    Err("CH347DLL load failed".into())
}

/// Close a CH347 device
#[command]
pub fn ch347_close(state: State<'_, Arc<Ch347State>>, index: u32) -> Result<(), String> {
    close_core(&state, index)
}

/// 强制重建指定设备的 DLL 句柄。
///
/// 物理设备拔出后，CH347 DLL 偶尔仍会为原索引保留一个失效句柄。此时普通 open 会被
/// 引用计数判定为“已经打开”而跳过，SPI_Init 会持续失败。该命令仅用于通信失败后的
/// 单次自动恢复：保留现有引用计数，但无条件执行 close -> open。
#[command]
pub fn ch347_reopen(state: State<'_, Arc<Ch347State>>, index: u32) -> Result<(), String> {
    reopen_core(&state, index)
}

pub fn reopen_core(state: &Ch347State, index: u32) -> Result<(), String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();

    let previous_count = state
        .open_count
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?
        .get(&index)
        .copied()
        .unwrap_or(0);

    unsafe {
        let ffi = Ch347Ffi::load().ok_or_else(|| "CH347DLL load failed".to_string())?;
        // 即使旧句柄已经失效也要调用 close，让 DLL 清除按设备索引缓存的内部状态。
        let _ = (ffi.close)(index);
        std::thread::sleep(std::time::Duration::from_millis(50));

        let handle = (ffi.open)(index);
        if handle.is_invalid() {
            if let Ok(mut counts) = state.open_count.lock() {
                counts.remove(&index);
            }
            log::error!("CH347 device {} reopen failed", index);
            return Err(format!("Failed to reopen device {}", index));
        }

        (ffi.set_timeout)(index, 500, 500);
        register_device_notification(&ffi, index);
        let mut counts = state
            .open_count
            .lock()
            .map_err(|e| format!("Lock error: {e}"))?;
        counts.insert(index, previous_count.max(1));
        log::info!(
            "CH347 device {} handle reopened (refcount={})",
            index,
            previous_count.max(1)
        );
        Ok(())
    }
}

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
///
/// 引用计数：仅当计数减到 0（最后一个使用者关闭）才真正调 DLL close，
/// 避免脚本 close 把前端还在用的设备关掉导致后续操作崩溃。
pub fn close_core(state: &Ch347State, index: u32) -> Result<(), String> {
    let _operation_guard = state.lock_operations();
    let (should_close, had_reference) = {
        let mut counts = state
            .open_count
            .lock()
            .map_err(|e| format!("Lock error: {e}"))?;
        match counts.get_mut(&index) {
            Some(c) => {
                *c = c.saturating_sub(1);
                if *c == 0 {
                    counts.remove(&index);
                    (true, true)
                } else {
                    (false, true)
                }
            }
            None => (false, false), // 本来就没记录为打开，安全地 no-op
        }
    };
    if should_close {
        unsafe {
            if let Some(ffi) = Ch347Ffi::load() {
                unregister_device_notification(&ffi, index);
                (ffi.close)(index);
            }
        }
        log::info!("CH347 device {} closed", index);
    } else if had_reference {
        log::info!(
            "CH347 device {} close deferred (other users still holding it)",
            index
        );
    } else {
        log::debug!("CH347 device {} was already closed", index);
    }
    Ok(())
}

/// I2C transfer
#[command]
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

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
pub fn i2c_transfer_core(
    state: &Ch347State,
    index: u32,
    write_data: Vec<u8>,
    read_len: u32,
    speed_khz: Option<u32>,
    scl_stretch: Option<bool>,
    delay_ms: Option<u32>,
) -> Result<Vec<u8>, String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            if let Some(enable) = scl_stretch {
                (ffi.i2c_set_stretch)(index, enable as i32);
            }
            if let Some(delay) = delay_ms {
                (ffi.i2c_set_delay_ms)(index, delay);
            }
            let mode = match speed_khz.unwrap_or(100) {
                0..=20 => 0,
                21..=50 => 4,
                51..=100 => 1,
                101..=200 => 5,
                201..=400 => 2,
                401..=750 => 3,
                _ => 6,
            };
            (ffi.i2c_set)(index, mode);
            let mut read_buf = vec![0u8; read_len as usize];
            let ok = (ffi.stream_i2c)(
                index,
                write_data.len() as u32,
                write_data.as_ptr(),
                read_len,
                if read_len > 0 {
                    read_buf.as_mut_ptr()
                } else {
                    std::ptr::null_mut()
                },
            );
            if to_bool(ok) {
                Ok(read_buf)
            } else {
                Err("I2C transfer failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// I2C address scan
#[command]
pub fn ch347_i2c_scan(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    speed_khz: Option<u32>,
    scl_stretch: Option<bool>,
    delay_ms: Option<u32>,
) -> Result<Vec<u32>, String> {
    i2c_scan_core(&state, index, speed_khz, scl_stretch, delay_ms)
}

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
pub fn i2c_scan_core(
    state: &Ch347State,
    index: u32,
    speed_khz: Option<u32>,
    scl_stretch: Option<bool>,
    delay_ms: Option<u32>,
) -> Result<Vec<u32>, String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    let mut found = Vec::new();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            if let Some(enable) = scl_stretch {
                (ffi.i2c_set_stretch)(index, enable as i32);
            }
            if let Some(delay) = delay_ms {
                (ffi.i2c_set_delay_ms)(index, delay);
            }
            let mode = match speed_khz.unwrap_or(100) {
                0..=20 => 0,
                21..=50 => 4,
                51..=100 => 1,
                101..=200 => 5,
                201..=400 => 2,
                401..=750 => 3,
                _ => 6,
            };
            (ffi.i2c_set)(index, mode);
            for addr in 1u8..128u8 {
                let write_addr = addr << 1;
                // 扫描稳定性改进：每个地址最多重试 2 次 + 地址之间留总线恢复时间。
                // 原因：CH347 对单字节写事务的 ACK 检测在高速率/总线电容较大时余量不足，
                // 加之 EEPROM 处于内部写周期(tWR)时会 NACK，导致"上电能扫到、反复扫有时扫不到"。
                // 重试 + 延时能显著降低漏检概率。
                let mut acked = false;
                for _attempt in 0..2 {
                    let mut ack_count: u32 = 0;
                    (ffi.stream_i2c_ret_ack)(
                        index,
                        1,
                        &write_addr,
                        0,
                        std::ptr::null_mut(),
                        &mut ack_count,
                    );
                    // Device exists only if the address byte was ACKed (ack_count >= 1)
                    if ack_count >= 1 {
                        acked = true;
                        break;
                    }
                    // 重试前给总线一点恢复时间（约 1ms）
                    std::thread::sleep(std::time::Duration::from_millis(1));
                }
                if acked {
                    found.push(addr as u32);
                }
                // 地址之间的总线恢复间隔（约 1ms），降低连续 START/STOP 的时序压力
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
        }
    }
    Ok(found)
}

const CH347_CLOCK_HZ: [u32; 8] = [
    60_000_000, 30_000_000, 15_000_000, 7_500_000, 3_750_000, 1_875_000, 937_500, 468_750,
];

/// Map an exact frequency to the nearest clock index supported by SpiCfg.iClock.
fn hz_to_clock(frequency_hz: u32) -> u8 {
    CH347_CLOCK_HZ
        .iter()
        .enumerate()
        .min_by_key(|(_, candidate)| frequency_hz.abs_diff(**candidate))
        .map(|(index, _)| index as u8)
        .unwrap_or(7)
}

/// Legacy HTTP callers still provide whole MHz. Keep them supported, but use
/// the same nearest-clock mapping instead of the previous coarse 2x mapping.
fn mhz_to_clock(speed_mhz: u32) -> u8 {
    hz_to_clock(speed_mhz.saturating_mul(1_000_000))
}

#[cfg(test)]
mod spi_clock_tests {
    use super::{hz_to_clock, mhz_to_clock, CH347_CLOCK_HZ};

    #[test]
    fn exact_ch347_frequencies_map_to_their_own_clock_index() {
        for (expected_index, frequency_hz) in CH347_CLOCK_HZ.iter().enumerate() {
            assert_eq!(hz_to_clock(*frequency_hz), expected_index as u8);
        }
    }

    #[test]
    fn whole_mhz_legacy_values_use_the_nearest_clock() {
        assert_eq!(mhz_to_clock(1), 6);
        assert_eq!(mhz_to_clock(2), 5);
        assert_eq!(mhz_to_clock(4), 4);
        assert_eq!(mhz_to_clock(8), 3);
        assert_eq!(mhz_to_clock(15), 2);
        assert_eq!(mhz_to_clock(30), 1);
        assert_eq!(mhz_to_clock(60), 0);
    }
}

/// Build SpiCfg from parameters.
/// cs value: bit7=1 enables CS control, bits 1:0 select CS1(00) or CS2(01).
fn build_spi_cfg(mode: u8, speed_mhz: u32, cs: u32) -> SpiCfg {
    SpiCfg {
        mode: mode.min(3),
        clock: mhz_to_clock(speed_mhz),
        byte_order: 1, // MSB first
        write_read_interval: 0,
        out_default_data: 0xff,
        chip_select: 0x80 | (cs & 0x03), // bit7=1 enables CS, bits1:0 select line
        cs1_polarity: 0,
        cs2_polarity: 0,
        is_auto_deactive_cs: 0,
        active_delay: 0,
        delay_deactive: 0,
    }
}

/// Initialize SPI with full configuration
#[command]
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

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
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
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            if frequency_hz == Some(0) {
                return Err("SPI frequency must be greater than zero".into());
            }
            let clock = frequency_hz
                .map(hz_to_clock)
                .unwrap_or_else(|| mhz_to_clock(speed_mhz.unwrap_or(4)));
            let cfg = SpiCfg {
                mode: mode.unwrap_or(0).min(3),
                clock,
                byte_order: byte_order.unwrap_or(1),
                write_read_interval: write_read_interval.unwrap_or(0),
                out_default_data: out_default_data.unwrap_or(0xff),
                chip_select: 0x80 | (cs.unwrap_or(0) & 0x03),
                cs1_polarity: cs1_polarity.unwrap_or(0),
                cs2_polarity: cs2_polarity.unwrap_or(0),
                is_auto_deactive_cs: is_auto_deactive_cs.unwrap_or(1),
                active_delay: active_delay.unwrap_or(0),
                delay_deactive: delay_deactive.unwrap_or(0),
            };
            // WCH requires SetFrequency/SetDataBits before SPI_Init. Keeping the
            // three calls in one backend operation prevents frontend ordering
            // mistakes and makes the exact Hz value authoritative.
            if let Some(hz) = frequency_hz {
                if !to_bool((ffi.spi_set_frequency)(index, hz)) {
                    log::error!(
                        "SPI set frequency failed (index={}, frequencyHz={})",
                        index,
                        hz
                    );
                    return Err("SPI set frequency failed".into());
                }
            }
            // Apply data bits before init (convert from byte-width to DLL format: 0=8bit, 1=16bit)
            if let Some(bits) = data_bits {
                if !to_bool((ffi.spi_set_data_bits)(
                    index,
                    if bits == 16 { 1 } else { 0 },
                )) {
                    log::error!("SPI set data bits failed (index={}, bits={})", index, bits);
                    return Err("SPI set data bits failed".into());
                }
            }
            let (request_mode, request_clock, request_order, request_cs, request_auto) = (
                cfg.mode,
                cfg.clock,
                cfg.byte_order,
                cfg.chip_select,
                cfg.is_auto_deactive_cs,
            );
            log::info!(
                "SPI init request: index={}, mode={}, frequencyHz={:?}, clockIndex={}, byteOrder={}, chipSelect=0x{:02X}, autoDeactiveCS={}",
                index, request_mode, frequency_hz, request_clock, request_order, request_cs, request_auto
            );
            let ok = (ffi.spi_init)(index, &cfg);
            if to_bool(ok) {
                let mut actual = SpiCfg {
                    mode: 0,
                    clock: 0,
                    byte_order: 0,
                    write_read_interval: 0,
                    out_default_data: 0,
                    chip_select: 0,
                    cs1_polarity: 0,
                    cs2_polarity: 0,
                    is_auto_deactive_cs: 0,
                    active_delay: 0,
                    delay_deactive: 0,
                };
                if to_bool((ffi.spi_get_cfg)(index, &mut actual)) {
                    let (actual_mode, actual_clock, actual_order, actual_cs, actual_auto) = (
                        actual.mode,
                        actual.clock,
                        actual.byte_order,
                        actual.chip_select,
                        actual.is_auto_deactive_cs,
                    );
                    log::info!(
                        "SPI init readback: index={}, mode={}, clockIndex={}, byteOrder={}, chipSelect=0x{:02X}, autoDeactiveCS={}",
                        index, actual_mode, actual_clock, actual_order, actual_cs, actual_auto
                    );
                } else {
                    log::warn!(
                        "SPI init succeeded but CH347SPI_GetCfg readback failed (index={})",
                        index
                    );
                }
                Ok(())
            } else {
                log::error!("SPI init failed (index={})", index);
                Err("SPI init failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// Get current SPI configuration
#[command]
pub fn ch347_spi_get_config(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
) -> Result<serde_json::Value, String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let mut cfg = SpiCfg {
                mode: 0,
                clock: 0,
                byte_order: 0,
                write_read_interval: 0,
                out_default_data: 0,
                chip_select: 0,
                cs1_polarity: 0,
                cs2_polarity: 0,
                is_auto_deactive_cs: 1,
                active_delay: 0,
                delay_deactive: 0,
            };
            let ok = (ffi.spi_get_cfg)(index, &mut cfg);
            if to_bool(ok) {
                // packed 结构字段不能直接引用，先拷贝到局部变量（按值读取安全）
                let (mode, clock, byte_order, write_read_interval) =
                    (cfg.mode, cfg.clock, cfg.byte_order, cfg.write_read_interval);
                let (out_default_data, chip_select) = (cfg.out_default_data, cfg.chip_select);
                let (cs1_polarity, cs2_polarity) = (cfg.cs1_polarity, cfg.cs2_polarity);
                let (is_auto_deactive_cs, active_delay, delay_deactive) = (
                    cfg.is_auto_deactive_cs,
                    cfg.active_delay,
                    cfg.delay_deactive,
                );
                Ok(serde_json::json!({
                    "mode": mode,
                    "clock": clock,
                    "byteOrder": byte_order,
                    "writeReadInterval": write_read_interval,
                    "outDefaultData": out_default_data,
                    "chipSelect": chip_select,
                    "cs1Polarity": cs1_polarity,
                    "cs2Polarity": cs2_polarity,
                    "isAutoDeactiveCS": is_auto_deactive_cs,
                    "activeDelay": active_delay,
                    "delayDeactive": delay_deactive,
                }))
            } else {
                Err("SPI get config failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// Set SPI clock frequency (call before spi_init)
#[command]
pub fn ch347_spi_set_frequency(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    frequency_hz: u32,
) -> Result<(), String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let ok = (ffi.spi_set_frequency)(index, frequency_hz);
            if to_bool(ok) {
                Ok(())
            } else {
                Err("SPI set frequency failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// Set SPI data bits (8-bit or 16-bit)
#[command]
pub fn ch347_spi_set_data_bits(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    data_bits: u8,
) -> Result<(), String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let ok = (ffi.spi_set_data_bits)(index, if data_bits == 16 { 1 } else { 0 });
            if to_bool(ok) {
                Ok(())
            } else {
                Err("SPI set data bits failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// Manual chip select control
#[command]
pub fn ch347_spi_change_cs(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    status: u8,
) -> Result<(), String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let ok = (ffi.spi_change_cs)(index, status);
            if to_bool(ok) {
                log::info!(
                    "SPI ChangeCS: index={}, selected={} (physical CS={})",
                    index,
                    status != 0,
                    if status != 0 { "LOW" } else { "HIGH" }
                );
                Ok(())
            } else {
                log::error!("SPI ChangeCS failed: index={}, status={}", index, status);
                Err("SPI change CS failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// Configure chip select behavior
#[command]
pub fn ch347_spi_set_chip_select(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    enable_select: u16,
    chip_select: u16,
    is_auto_deactive_cs: u32,
    active_delay: u32,
    delay_deactive: u32,
) -> Result<(), String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let ok = (ffi.spi_set_chip_select)(
                index,
                enable_select,
                chip_select,
                is_auto_deactive_cs,
                active_delay,
                delay_deactive,
            );
            if to_bool(ok) {
                log::info!(
                    "SPI CS control: index={}, enable=0x{:04X}, level=0x{:04X}, autoDeactive=0x{:08X}",
                    index, enable_select, chip_select, is_auto_deactive_cs
                );
                Ok(())
            } else {
                log::error!(
                    "SPI CS control failed: index={}, enable=0x{:04X}, level=0x{:04X}",
                    index,
                    enable_select,
                    chip_select
                );
                Err("SPI set chip select failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// SPI write-only transfer (MOSI only, no MISO read).
/// Matches CH347Demo CH347SpiStream(Cmd=0xC4): directly calls CH347SPI_Write
/// without re-initializing SPI or changing data bits. SPI must be configured
/// first via ch347_spi_init (called once, like CH347InitSpi).
#[command]
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

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
pub fn spi_write_core(
    state: &Ch347State,
    index: u32,
    tx_data: Vec<u8>,
    cs: Option<u32>,
) -> Result<(), String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    if tx_data.is_empty() {
        return Err("txData is empty".into());
    }
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let chip_select = cs.unwrap_or(0x80);
            let len = tx_data.len() as u32;
            let mut buf = tx_data;
            // CH347Demo: CH347SPI_Write(iIndex, 0x80, iLength, 512, ioBuffer)
            let ok = (ffi.spi_write)(index, chip_select, len, 512, buf.as_mut_ptr());
            if to_bool(ok) {
                Ok(())
            } else {
                Err("SPI write failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// SPI fill: 在 Rust 端循环写入指定颜色字节，填充 pixel_count 个像素。
///
/// 用于 RGB 屏（如 ST7789V、ST7796U2）填色。显示层会把大区域切成不超过 480B 的
/// 独立 RAMWR 小窗口；本函数也把 iWriteStep 限制为最多 480B，避开 CH347 SPI OUT
/// 512B USB 包中还需占用命令头、导致只可靠发出第一块的问题。
///
/// 前置条件：SPI 已通过 ch347_spi_init 配置；已发 RAMWR(0x2C) 命令进入显存写入态；
/// DC 已拉高（数据模式）。color 为单像素的字节序列（RGB565 = 2 字节，高字节在前）。
#[command]
pub async fn ch347_spi_fill(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    color: Vec<u8>,
    pixel_count: u32,
    cs: Option<u32>,
) -> Result<(), String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    if color.is_empty() {
        return Err("color is empty".into());
    }
    if pixel_count == 0 {
        return Ok(());
    }
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let chip_select = cs.unwrap_or(0x80);
            let bpp = color.len();
            let total_len = (pixel_count as usize)
                .checked_mul(bpp)
                .ok_or_else(|| "SPI fill size overflow".to_string())?;
            let wire_len = u32::try_from(total_len)
                .map_err(|_| "SPI fill is too large for CH347".to_string())?;
            let mut buffer = Vec::with_capacity(total_len);
            for _ in 0..pixel_count {
                buffer.extend_from_slice(&color);
            }

            // 设备打开时默认 USB 超时为 500ms；低速写入可能超过该值，临时放宽到 10s。
            // CH347 SPI OUT 的 USB 包还含命令头，单块负载保守限制为 480B。
            let write_step = wire_len.min(480).max(1);
            let timeout_changed = to_bool((ffi.set_timeout)(index, 10_000, 10_000));
            if !timeout_changed {
                log::warn!("SPI fill: failed to extend CH347 timeout (index={})", index);
            }
            log::info!(
                "SPI fill write: index={}, bytes={}, writeStep={}, cs=0x{:02X}",
                index,
                wire_len,
                write_step,
                chip_select
            );
            let ok = (ffi.spi_write)(
                index,
                chip_select,
                wire_len,
                write_step,
                buffer.as_mut_ptr(),
            );
            let _ = (ffi.set_timeout)(index, 500, 500);
            if to_bool(ok) {
                Ok(())
            } else {
                Err("SPI fill continuous write failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// SPI 写任意连续字节缓冲。用于 RGB 屏（如 ST7796U2）推一帧/一区域的像素数据。
/// 与 ch347_spi_fill 的区别：fill 用单色循环填，本函数直接把传入的 data 切块写出。
/// 显示层将 RGB 区域切为不超过 480B 的独立小窗口；本函数的一次调用写一个小窗口。
#[command]
pub async fn ch347_spi_write_buffer(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    mut data: Vec<u8>,
    cs: Option<u32>,
) -> Result<(), String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    if data.is_empty() {
        return Ok(());
    }
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let chip_select = cs.unwrap_or(0x80);
            let wire_len = u32::try_from(data.len())
                .map_err(|_| "SPI write buffer is too large for CH347".to_string())?;
            let write_step = wire_len.min(480).max(1);
            let timeout_changed = to_bool((ffi.set_timeout)(index, 10_000, 10_000));
            if !timeout_changed {
                log::warn!(
                    "SPI buffer: failed to extend CH347 timeout (index={})",
                    index
                );
            }
            let ok = (ffi.spi_write)(index, chip_select, wire_len, write_step, data.as_mut_ptr());
            let _ = (ffi.set_timeout)(index, 500, 500);
            if to_bool(ok) {
                Ok(())
            } else {
                Err("SPI continuous buffer write failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// SPI read-only transfer.
/// Matches reference CH347SpiStream(Cmd=0xC3): sends cmd bytes,
/// then reads requested length from MISO.
/// SPI must be configured first via ch347_spi_init (called once, like CH347InitSpi).
#[command]
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

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
pub fn spi_read_core(
    state: &Ch347State,
    index: u32,
    read_len: u32,
    cs: Option<u32>,
) -> Result<Vec<u8>, String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    if read_len == 0 {
        return Err("readLen must be > 0".into());
    }
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let chip_select = cs.unwrap_or(0x80);
            let mut buf = vec![0u8; read_len as usize];
            let mut actual_len: u32 = read_len;
            let ok = (ffi.spi_read)(index, chip_select, 0, &mut actual_len, buf.as_mut_ptr());
            if to_bool(ok) {
                buf.truncate(actual_len as usize);
                Ok(buf)
            } else {
                Err("SPI read failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// SPI full-duplex transfer (WriteRead — MOSI write, MISO read in same buffer).
/// Matches CH347Demo CH347SpiStream(Cmd=0xC2): directly calls CH347SPI_WriteRead.
/// SPI must be configured first via ch347_spi_init (called once, like CH347InitSpi).
#[command]
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

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
pub fn spi_transfer_core(
    state: &Ch347State,
    index: u32,
    tx_data: Vec<u8>,
    cs: Option<u32>,
) -> Result<Vec<u8>, String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let chip_select = cs.unwrap_or(0x80);
            let len = tx_data.len() as u32;
            let mut buf = tx_data;
            let ok = (ffi.spi_write_read)(index, chip_select, len, buf.as_mut_ptr());
            if to_bool(ok) {
                Ok(buf)
            } else {
                Err("SPI transfer failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// SPI 4-wire stream transfer (high-efficiency full-duplex).
/// SPI must be configured first via ch347_spi_init (called once, like CH347InitSpi).
#[command]
pub fn ch347_spi_stream4(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    tx_data: Vec<u8>,
    cs: Option<u32>,
    mode: Option<u8>,
    speed_mhz: Option<u32>,
    data_bits: Option<u8>,
) -> Result<Vec<u8>, String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let chip_select = cs.unwrap_or(0x80);
            let len = tx_data.len() as u32;
            let mut buf = tx_data;
            let ok = (ffi.spi_stream4)(index, chip_select, len, buf.as_mut_ptr());
            if to_bool(ok) {
                Ok(buf)
            } else {
                Err("SPI stream4 failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

#[cfg(test)]
mod device_name_tests {
    use super::device_instance_id_from_path;

    #[test]
    fn converts_ch347_interface_path_to_device_instance_id() {
        let path = r"\\?\usb#vid_1a86&pid_55de&mi_04#7&330a6598&0&0004#{12345678-1234-1234-1234-123456789abc}";
        assert_eq!(
            device_instance_id_from_path(path).as_deref(),
            Some(r"usb\vid_1a86&pid_55de&mi_04\7&330a6598&0&0004")
        );
    }

    #[test]
    fn rejects_non_interface_path() {
        assert_eq!(device_instance_id_from_path("CH347F"), None);
    }
}

#[cfg(all(test, target_pointer_width = "64"))]
mod runtime_tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn bundled_x64_runtime_loads_all_required_exports() {
        let state = Ch347State::new();
        assert!(
            state.is_available(),
            "{}",
            state.dll_error().unwrap_or("CH347 runtime unavailable")
        );

        let expected = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("ch347")
            .join("CH347DLLA64.dll")
            .canonicalize()
            .expect("bundled CH347DLLA64.dll should exist");
        let actual = state
            .dll_path()
            .expect("runtime path should be recorded")
            .canonicalize()
            .expect("selected CH347 runtime path should exist");
        assert_eq!(
            actual, expected,
            "development must prefer the bundled runtime"
        );

        let ffi = unsafe { Ch347Ffi::load() };
        assert!(
            ffi.is_some(),
            "bundled runtime must expose every required CH347 symbol"
        );
    }
}

/// GPIO get — read GPIO0-GPIO7 directions and levels.
#[command]
pub fn ch347_gpio_get(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
) -> Result<serde_json::Value, String> {
    let (direction, data) = gpio_get_core(&state, index)?;
    Ok(serde_json::json!({
        "direction": direction,
        "data": data,
    }))
}

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
pub fn gpio_get_core(state: &Ch347State, index: u32) -> Result<(u8, u8), String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let mut direction = 0u8;
            let mut data = 0u8;
            let ok = (ffi.gpio_get)(index, &mut direction, &mut data);
            if to_bool(ok) {
                Ok((direction, data))
            } else {
                Err("GPIO get failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}

/// GPIO set — control GPIO0-GPIO7 pins (DCX, RESET, backlight etc.)
#[command]
pub fn ch347_gpio_set(
    state: State<'_, Arc<Ch347State>>,
    index: u32,
    enable: u8,
    dir_out: u8,
    data_out: u8,
) -> Result<(), String> {
    gpio_set_core(&state, index, enable, dir_out, data_out)
}

/// 与传输无关的核心实现（Tauri 命令与 HTTP 服务共用）。
pub fn gpio_set_core(
    state: &Ch347State,
    index: u32,
    enable: u8,
    dir_out: u8,
    data_out: u8,
) -> Result<(), String> {
    if !state.is_available() {
        return Err("CH347DLL not available".into());
    }
    let _operation_guard = state.lock_operations();
    unsafe {
        if let Some(ffi) = Ch347Ffi::load() {
            let ok = (ffi.gpio_set)(index, enable, dir_out, data_out);
            if to_bool(ok) {
                Ok(())
            } else {
                Err("GPIO set failed".into())
            }
        } else {
            Err("CH347DLL load failed".into())
        }
    }
}
