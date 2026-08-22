mod fel;
mod fes;
mod payloads;
mod scan;
pub(crate) mod service;
mod session;
mod timeout;

#[allow(unused_imports)]
pub use fel::*;
#[allow(unused_imports)]
pub use fes::*;
#[allow(unused_imports)]
pub use payloads::*;
#[allow(unused_imports)]
pub use scan::*;
#[allow(unused_imports)]
pub use session::*;
#[allow(unused_imports)]
pub use timeout::*;

#[macro_export]
macro_rules! register_efex_commands {
    () => {
        $crate::efex::commands::efex_scan_devices,
        $crate::efex::commands::efex_close_device,
        $crate::efex::commands::efex_get_device_mode,
        $crate::efex::commands::efex_get_device_mode_str,
        $crate::efex::commands::efex_set_usb_backend,
        $crate::efex::commands::efex_get_usb_backend,
        $crate::efex::commands::efex_fel_read,
        $crate::efex::commands::efex_fel_write,
        $crate::efex::commands::efex_fel_exec,
        $crate::efex::commands::efex_fes_query_storage,
        $crate::efex::commands::efex_fes_query_secure,
        $crate::efex::commands::efex_fes_probe_flash_size,
        $crate::efex::commands::efex_fes_flash_set_onoff,
        $crate::efex::commands::efex_fes_get_chipid,
        $crate::efex::commands::efex_fes_down,
        $crate::efex::commands::efex_fes_up,
        $crate::efex::commands::efex_fes_verify_value,
        $crate::efex::commands::efex_fes_verify_status,
        $crate::efex::commands::efex_fes_verify_uboot_blk,
        $crate::efex::commands::efex_fes_tool_mode,
        $crate::efex::commands::efex_payloads_init,
        $crate::efex::commands::efex_payloads_readl,
        $crate::efex::commands::efex_payloads_writel,
        $crate::efex::commands::efex_set_fel_timeout,
        $crate::efex::commands::efex_set_fes_timeout
    };
}
