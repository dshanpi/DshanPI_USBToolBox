use super::*;

pub(super) async fn run_flash_task<R: Runtime>(
    app_handle: AppHandle<R>,
    active: ActiveTask,
    mut session: FlashSession,
) -> Result<(), AppError> {
    let mut current_mode = String::new();
    let mut secure_type = 0u32;
    let mut storage_type = STORAGE_AUTO;

    let result = async {
        let temp_device_id = session
            .device_id
            .ok_or_else(|| AppError::from("Missing EFEX deviceId for flash session"))?;
        current_mode = ensure_device_mode(temp_device_id).await?;

        let image = parse_image_context(&session.image_path)?;
        let stages = pick_run_stages(
            &current_mode,
            matches!(session.options.mode, FlashMode::EraseOnly),
        );
        let mut reporter = ProgressReporter::new(app_handle.clone(), active.id, stages);

        reporter.start("load_image");
        reporter.update(100.0, Some("Firmware image loaded"));
        emit_log(&app_handle, active.id, LEVEL_INFO, "Firmware image loaded");

        check_cancelled(&active)?;

        reporter.start("open_device");
        reporter.complete();
        emit_log(
            &app_handle,
            active.id,
            LEVEL_INFO,
            &format!(
                "Bound deviceId={} at bus={}, port={}, mode={}",
                session.device_id.unwrap_or_default(),
                session.bus,
                session.port,
                current_mode
            ),
        );

        match current_mode.as_str() {
            "fel" => {
                reporter.start("fel_prepare");
                let fes = read_named_entry(&session.image_path, IMAGE_ENTRY_FES)?;
                reporter.complete();

                check_cancelled(&active)?;
                init_dram(
                    &app_handle,
                    &active,
                    &mut reporter,
                    session.device_id.unwrap(),
                    &fes,
                )
                .await?;

                check_cancelled(&active)?;
                download_uboot_bundle(
                    &app_handle,
                    &active,
                    &mut reporter,
                    session.device_id.unwrap(),
                    &session.image_path,
                )
                .await?;

                reporter.start("fel_reconnect");
                // Save device_path before unregistering so wait_for_mode can
                // target this specific device without scanning all USB devices.
                let reconnect_path = session
                    .device_id
                    .and_then(crate::efex::device::get_device_path);
                close_device_id(session.device_id.take());

                let device = wait_for_mode(
                    &app_handle,
                    &active,
                    &mut reporter,
                    "srv",
                    Some((session.bus, session.port)),
                    reconnect_path.as_deref(),
                )
                .await?;
                session.device_id = Some(device.device_id);
                session.bus = device.bus;
                session.port = device.port;
                current_mode = ensure_device_mode(session.device_id.unwrap()).await?;
                if current_mode != "srv" {
                    emit_popup(
                        &app_handle,
                        active.id,
                        "error",
                        "Reconnect failed",
                        "Device did not enter SRV mode after FEL preparation",
                    );
                    return Err(AppError {
                        code: -1,
                        name: "ReconnectFailed".to_string(),
                        message: "Device did not enter SRV mode".to_string(),
                    });
                }

                reporter.complete();
                reporter.start("fel_ready");
                reporter.complete();
            }
            "srv" => {}
            _ => {
                return Err(AppError {
                    code: -1,
                    name: "UnsupportedMode".to_string(),
                    message: format!("Unsupported device mode: {current_mode}"),
                });
            }
        }

        check_cancelled(&active)?;

        reporter.start("query_secure");
        secure_type = efex_fes_query_secure(session.device_id.unwrap())
            .await
            .map_err(AppError::from)?;
        reporter.complete();
        emit_log(
            &app_handle,
            active.id,
            LEVEL_INFO,
            &format!("Device secure type: {secure_type}"),
        );

        check_cancelled(&active)?;
        download_erase_flag(
            &app_handle,
            &active,
            &mut reporter,
            session.device_id.unwrap(),
            &session.options,
        )
        .await?;

        check_cancelled(&active)?;
        reporter.start("query_storage");
        storage_type = efex_fes_query_storage(session.device_id.unwrap())
            .await
            .map_err(AppError::from)? as i32;
        let flash_size = efex_fes_probe_flash_size(session.device_id.unwrap())
            .await
            .map_err(AppError::from)?;
        reporter.complete();
        emit_log(
            &app_handle,
            active.id,
            LEVEL_INFO,
            &format!(
                "Device storage: {}, flash size: {} sectors",
                storage_name(storage_type),
                flash_size
            ),
        );

        if let Some(sys_config) = read_optional_entry(&session.image_path, IMAGE_ENTRY_SYS_CONFIG)?
        {
            let parsed = parse_sys_config(&sys_config)
                .map_err(|error| to_app_error("ParseSysConfig", error))?;
            let firmware_storage = parsed.storage_type;
            emit_log(
                &app_handle,
                active.id,
                LEVEL_INFO,
                &format!("Firmware storage: {}", storage_name(firmware_storage)),
            );

            let mismatch = (firmware_storage == STORAGE_SPINOR && storage_type != STORAGE_SPINOR)
                || (firmware_storage != STORAGE_SPINOR && storage_type == STORAGE_SPINOR);
            if mismatch {
                let confirmed = wait_confirmation(
                    &app_handle,
                    &active,
                    "Storage mismatch",
                    &format!(
                        "Firmware targets {}, device reports {}. Continue flashing?",
                        storage_name(firmware_storage),
                        storage_name(storage_type)
                    ),
                    "storage_mismatch",
                )
                .await?;

                if !confirmed {
                    return Err(AppError {
                        code: -1000,
                        name: "Cancelled".to_string(),
                        message: "Flash cancelled by user after storage mismatch warning"
                            .to_string(),
                    });
                }
            }
        }

        let mbr_data = mbr_bytes(&session)?;
        let mbr = parse_sunxi_mbr(&mbr_data).map_err(|error| to_app_error("ParseMbr", error))?;
        let mbr_info = sunxi_mbr_to_info(&mbr);
        let plan =
            resolve_partition_plan(&image, &session.image_path, &mbr_info, &session.options)?;

        maybe_switch_ubifs_interface(
            &app_handle,
            &active,
            session.device_id.unwrap(),
            storage_type,
            &session.image_path,
            &plan,
        )
        .await?;

        check_cancelled(&active)?;
        download_mbr(
            &app_handle,
            &active,
            &mut reporter,
            session.device_id.unwrap(),
            &mbr_data,
        )
        .await?;

        if !matches!(session.options.mode, FlashMode::EraseOnly) {
            check_cancelled(&active)?;
            download_partitions(&app_handle, &active, &mut reporter, &session, &plan).await?;

            if should_download_boot_components(&session.options, &plan) {
                check_cancelled(&active)?;
                download_boot_components(
                    &app_handle,
                    &active,
                    &mut reporter,
                    session.device_id.unwrap(),
                    &session.image_path,
                    secure_type,
                    storage_type,
                )
                .await?;
            }
        }

        check_cancelled(&active)?;
        set_post_flash_action(
            &app_handle,
            &active,
            &mut reporter,
            session.device_id.unwrap(),
            &session.options.post_flash_action,
        )
        .await?;

        reporter.start("complete");
        reporter.complete();
        Ok(())
    }
    .await;

    close_device_id(session.device_id.take());
    result
}
