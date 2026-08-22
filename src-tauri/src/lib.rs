mod adb;
mod ai;
mod app_error;
mod auth;
mod ch347;
mod disasm;
mod diskpart;
mod driver;
mod dtb;
mod efex;
mod file;
mod firmware;
mod flash;
mod hotplug;
mod httpd;
mod packer;
mod proxy;
mod serial;
mod task_bar;
mod tcp;
mod usb;

use adb::commands::AdbState;
use std::sync::Arc;
use tauri_plugin_log::{Target, TargetKind};

#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        window.open_devtools();
        Ok(())
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = window;
        Err("Developer tools are disabled in release builds".into())
    }
}

#[tauri::command]
fn open_python_api_docs(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    const LABEL: &str = "python-api-docs";
    if let Some(window) = app.get_webview_window(LABEL) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        LABEL,
        tauri::WebviewUrl::App("python-api-docs.html".into()),
    )
    .title("USBToolBox Python API")
    .inner_size(1100.0, 760.0)
    .resizable(true)
    .minimizable(true)
    .maximizable(true)
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Warn
                })
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AdbState(Default::default()))
        .manage(flash::mass::MassProductionState::new())
        // CH347 / 串口设备状态用 Arc 托管，使 Tauri 命令与内嵌 HTTP 服务共享同一设备单例
        .manage(Arc::new(ch347::Ch347State::new()))
        .manage(Arc::new(serial::SerialState::new()))
        .manage(tcp::TcpState::new())
        .manage(httpd::state::PytestServerState::new())
        .manage(httpd::runner::PytestRunnerState::new())
        .manage(ai::state::AiState::new())
        .manage(std::sync::Arc::new(auth::state::AuthState::new()))
        .manage(task_bar::TaskbarIndicatorState::new())
        .setup(|app| {
            task_bar::setup_taskbar_listeners(app.handle());
            // 启动 USB 设备插拔监听（事件驱动设备扫描，替代前端轮询）
            ch347::device_notifier::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_devtools,
            open_python_api_docs,
            driver::commands::driver_get_status,
            driver::commands::driver_install,
            driver::commands::driver_uninstall,
            adb::commands::adb_check_server,
            adb::commands::adb_list_devices,
            adb::commands::adb_select_device,
            adb::commands::adb_get_selected_device,
            adb::commands::adb_clear_selected_device,
            adb::commands::adb_shell_command,
            adb::commands::adb_list_directory,
            adb::commands::adb_push_file,
            adb::commands::adb_pull_file,
            adb::commands::adb_pull_folder,
            adb::commands::adb_delete_file,
            adb::commands::adb_make_directory,
            adb::commands::adb_rename,
            adb::commands::adb_stat,
            adb::commands::adb_reboot,
            adb::commands::adb_root,
            efex::commands::efex_scan_devices,
            efex::commands::efex_close_device,
            efex::commands::efex_get_device_mode,
            efex::commands::efex_get_device_mode_str,
            efex::commands::efex_set_usb_backend,
            efex::commands::efex_get_usb_backend,
            efex::commands::efex_fel_read,
            efex::commands::efex_fel_write,
            efex::commands::efex_fel_exec,
            efex::commands::efex_fel_init_dram,
            efex::commands::efex_fel_init_dram_with_params,
            efex::commands::efex_fes_query_storage,
            efex::commands::efex_fes_query_secure,
            efex::commands::efex_fes_probe_flash_size,
            efex::commands::efex_fes_flash_set_onoff,
            efex::commands::efex_fes_get_chipid,
            efex::commands::efex_fes_down,
            efex::commands::efex_fes_up,
            efex::commands::efex_fes_verify_value,
            efex::commands::efex_fes_verify_status,
            efex::commands::efex_fes_verify_uboot_blk,
            efex::commands::efex_fes_tool_mode,
            efex::commands::efex_payloads_init,
            efex::commands::efex_payloads_readl,
            efex::commands::efex_payloads_writel,
            efex::commands::efex_set_fel_timeout,
            efex::commands::efex_set_fes_timeout,
            disasm::commands::disassemble,
            disasm::commands::get_supported_archs,
            hotplug::commands::hotplug_start,
            serial::commands::serial_list_ports,
            serial::commands::serial_open,
            serial::commands::serial_close,
            serial::commands::serial_write,
            serial::commands::serial_is_open,
            ch347::commands::ch347_runtime_info,
            ch347::commands::ch347_list_devices,
            ch347::commands::ch347_open,
            ch347::commands::ch347_close,
            ch347::commands::ch347_reopen,
            ch347::commands::ch347_i2c_transfer,
            ch347::commands::ch347_i2c_scan,
            ch347::commands::ch347_spi_init,
            ch347::commands::ch347_spi_get_config,
            ch347::commands::ch347_spi_set_frequency,
            ch347::commands::ch347_spi_set_data_bits,
            ch347::commands::ch347_spi_change_cs,
            ch347::commands::ch347_spi_set_chip_select,
            ch347::commands::ch347_gpio_get,
            ch347::commands::ch347_gpio_set,
            ch347::commands::ch347_spi_write,
            ch347::commands::ch347_spi_fill,
            ch347::commands::ch347_spi_write_buffer,
            ch347::commands::ch347_spi_read,
            ch347::commands::ch347_spi_transfer,
            ch347::commands::ch347_spi_stream4,
            httpd::commands::pytest_server_start,
            httpd::commands::pytest_server_stop,
            httpd::commands::pytest_server_status,
            httpd::runner::pytest_runtime_info,
            httpd::runner::pytest_run_script,
            httpd::runner::pytest_stop_script,
            httpd::runner::pytest_user_dir,
            httpd::runner::pytest_open_user_dir,
            httpd::runner::pytest_list_user_files,
            httpd::runner::pytest_read_user_file,
            httpd::runner::pytest_write_user_file,
            ai::commands::ai_chat,
            ai::commands::ai_chat_stop,
            ai::document::ai_read_document,
            auth::commands::auth_login_start,
            auth::commands::auth_get_user,
            auth::commands::auth_logout,
            auth::commands::auth_cancel_login,
            proxy::get_system_proxy,
            proxy::get_proxy_config,
            file::extract_file_chunked,
            file::extract_files_batch,
            file::get_file_size,
            firmware::commands::firmware_parse_image,
            firmware::commands::firmware_read_entry_by_filename,
            firmware::commands::firmware_read_entry_by_maintype_subtype,
            firmware::commands::firmware_read_entry_range_by_filename,
            firmware::commands::firmware_read_entry_range_by_maintype_subtype,
            firmware::commands::firmware_parse_partition_config,
            firmware::commands::firmware_serialize_partition_config,
            firmware::commands::firmware_parse_boot0,
            firmware::commands::firmware_serialize_boot0,
            firmware::commands::firmware_parse_dram_params,
            firmware::commands::firmware_serialize_dram_params,
            firmware::commands::firmware_parse_uboot,
            firmware::commands::firmware_get_uboot_work_mode,
            firmware::commands::firmware_get_uboot_storage_type,
            firmware::commands::firmware_set_uboot_work_mode,
            firmware::commands::firmware_set_uboot_storage_type,
            firmware::commands::firmware_parse_sys_config,
            firmware::commands::firmware_parse_sunxi_mbr,
            firmware::commands::firmware_is_valid_sunxi_mbr,
            firmware::commands::firmware_sunxi_mbr_to_info,
            firmware::commands::firmware_mbr_create_empty,
            firmware::commands::firmware_mbr_add_partition,
            firmware::commands::firmware_mbr_add_partition_raw,
            firmware::commands::firmware_mbr_update_partition,
            firmware::commands::firmware_mbr_remove_partition,
            firmware::commands::firmware_mbr_move_partition,
            firmware::commands::firmware_mbr_clear_partitions,
            firmware::commands::firmware_mbr_set_copy,
            firmware::commands::firmware_mbr_set_version,
            firmware::commands::firmware_mbr_set_index,
            firmware::commands::firmware_mbr_update_stamp,
            firmware::commands::firmware_mbr_serialize,
            firmware::commands::firmware_mbr_serialize_with_copies,
            firmware::commands::firmware_parse_boot_package,
            firmware::commands::firmware_is_valid_boot_package,
            firmware::commands::firmware_get_boot_package_item_data,
            firmware::commands::firmware_get_boot_package_item_data_by_index,
            firmware::commands::firmware_get_item_type_name,
            flash::commands::flash_start,
            flash::commands::flash_cancel,
            flash::commands::flash_confirm,
            flash::mass::commands::mass_start,
            flash::mass::commands::mass_stop,
            flash::mass::commands::mass_get_status,
            diskpart::gpt::commands::parse_gpt_from_file,
            diskpart::gpt::commands::parse_gpt_from_data,
            diskpart::mbr::commands::parse_mbr_from_file,
            diskpart::mbr::commands::parse_mbr_from_data,
            dtb::commands::fdt_parse_from_file,
            dtb::commands::fdt_parse_from_data,
            dtb::commands::fdt_get_node,
            dtb::commands::fdt_get_property,
            dtb::commands::fdt_list_node_children,
            dtb::commands::fdt_find_compatible,
            dtb::commands::fdt_generate_dts,
            packer::commands::spinor_merge_firmware,
            packer::commands::emmc_ufs_merge_firmware,
            tcp::commands::tcp_connect,
            tcp::commands::tcp_send,
            tcp::commands::tcp_start_read,
            tcp::commands::tcp_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
