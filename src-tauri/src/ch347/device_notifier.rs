//! USB 设备插拔通知 -- 事件驱动设备扫描，替代每 1.5s 轮询 ch347_list_devices。
//!
//! CH347DLL 没有"设备变化通知"API，但 Windows 在 USB 设备插拔时会发 WM_DEVICECHANGE。
//! 这里在专用线程建一个 message-only 窗口，用 RegisterDeviceNotification 注册监听
//! GUID_DEVINTERFACE_USB_DEVICE（所有 USB 设备接口变化），收到插/拔事件就 emit
//! "ch347-device-changed" 给前端；前端监听后再调 ch347_list_devices 扫描。
//! 平时完全不调 ch347_list_devices，只在插拔时扫一次。

#[cfg(windows)]
pub use windows_impl::*;

#[cfg(not(windows))]
pub use stub::*;

#[cfg(not(windows))]
mod stub {
    use tauri::AppHandle;
    /// 非 Windows 平台的空实现（CH347DLL 本就只支持 Windows）。
    pub fn start(_app: AppHandle) {}
    pub fn emit_change() {}
}

#[cfg(windows)]
mod windows_impl {
    use std::sync::OnceLock;
    use tauri::{AppHandle, Emitter};
    use windows::core::{w, PCWSTR};
    use windows::Win32::Devices::Usb::GUID_DEVINTERFACE_USB_DEVICE;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
        RegisterDeviceNotificationW, TranslateMessage, DBT_DEVICEARRIVAL, DBT_DEVICEREMOVECOMPLETE,
        DBT_DEVTYP_DEVICEINTERFACE, DEVICE_NOTIFY_WINDOW_HANDLE, DEV_BROADCAST_DEVICEINTERFACE_W,
        HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_DEVICECHANGE, WNDCLASSW,
    };

    /// 全局 AppHandle，供窗口过程 emit 事件用（窗口过程是静态回调，无法捕获环境）。
    static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

    /// 通知前端重新枚举 CH347。除了 Windows 的 WM_DEVICECHANGE，CH347DLL 的
    /// CH347SetDeviceNotify 回调也复用这个入口，避免两套事件链路行为不一致。
    pub fn emit_change() {
        if let Some(app) = APP_HANDLE.get() {
            let _ = app.emit("ch347-device-changed", ());
        }
    }

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_DEVICECHANGE {
            let event = wparam.0 as u32;
            if event == DBT_DEVICEARRIVAL || event == DBT_DEVICEREMOVECOMPLETE {
                // 任意 USB 设备插拔都通知前端去扫一次（ch347_list_devices 会过滤出 CH347）
                emit_change();
            }
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    /// 启动 USB 设备插拔监听线程。重复调用安全（OnceLock 只 set 一次，线程可多次启动但
    /// RegisterClassW 同名类第二次会失败 -> 线程早退，无副作用）。
    pub fn start(app: AppHandle) {
        let _ = APP_HANDLE.set(app);
        std::thread::spawn(|| unsafe {
            let hinst = match GetModuleHandleW(PCWSTR::null()) {
                Ok(h) => h,
                Err(_) => return,
            };
            let wc = WNDCLASSW {
                lpfnWndProc: Some(wnd_proc),
                hInstance: hinst.into(),
                lpszClassName: w!("CH347DevNotifier"),
                ..Default::default()
            };
            if RegisterClassW(&wc) == 0 {
                return;
            }
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                w!("CH347DevNotifier"),
                w!("CH347DevNotifier"),
                WINDOW_STYLE::default(),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                None,
                None,
            );
            let Ok(hwnd) = hwnd else { return };
            // 注册监听所有 USB 设备接口变化（GUID_DEVINTERFACE_USB_DEVICE）
            let filter = DEV_BROADCAST_DEVICEINTERFACE_W {
                dbcc_size: std::mem::size_of::<DEV_BROADCAST_DEVICEINTERFACE_W>() as u32,
                dbcc_devicetype: DBT_DEVTYP_DEVICEINTERFACE.0,
                dbcc_reserved: 0,
                dbcc_classguid: GUID_DEVINTERFACE_USB_DEVICE,
                dbcc_name: [0; 1],
            };
            let _ = RegisterDeviceNotificationW(
                hwnd.into(),
                &filter as *const _ as *const std::ffi::c_void,
                DEVICE_NOTIFY_WINDOW_HANDLE,
            );
            // 消息循环（阻塞在线程里，直到窗口被销毁）
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    }
}
