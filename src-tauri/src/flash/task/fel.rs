use super::*;

const DRAM_PROGRESS_TIMEOUT_SECS: u64 = 60;

fn format_dram_parameters(values: &[u32]) -> String {
    let lines = values
        .chunks(4)
        .map(|chunk| {
            chunk
                .iter()
                .map(|value| format!("0x{value:x}"))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .collect::<Vec<_>>()
        .join("\n  ");

    format!("DRAM parameters:\n  {lines}")
}

pub(super) async fn init_dram<R: Runtime>(
    app_handle: &AppHandle<R>,
    active: &ActiveTask,
    reporter: &mut ProgressReporter<R>,
    handle: u32,
    fes_data: &[u8],
) -> Result<(), AppError> {
    reporter.start("fel_init_dram");
    emit_log(app_handle, active.id, LEVEL_INFO, "Initializing DRAM");
    reporter.update(10.0, Some("Uploading FES payload"));

    let started = SystemTime::now();
    let mut init_future = std::pin::pin!(efex_fel_init_dram(handle, fes_data.to_vec()));
    let final_dram_state = loop {
        tokio::select! {
            result = &mut init_future => break result?,
            _ = tokio::time::sleep(Duration::from_secs(1)) => {
                check_cancelled(active)?;
                let elapsed = SystemTime::now()
                    .duration_since(started)
                    .unwrap_or_default();
                let percent = 10.0
                    + (elapsed.as_secs_f64() / DRAM_PROGRESS_TIMEOUT_SECS as f64) * 85.0;
                let wait_message = format!("Initializing DRAM... {}s", elapsed.as_secs());
                reporter.update(percent.min(95.0), Some(wait_message.as_str()));
            }
        }
    };

    if !final_dram_state.success {
        return Err(AppError {
            code: -1,
            name: "DramInitFailed".to_string(),
            message: "DRAM initialization failed".to_string(),
        });
    }

    reporter.complete();
    let dram_state = crate::firmware::types::DramParamInfoDto {
        dram_init_flag: final_dram_state.dram_init_flag,
        dram_update_flag: final_dram_state.dram_update_flag,
        dram_para: final_dram_state.dram_para.clone(),
    };
    emit_dram_info(
        app_handle,
        active.id,
        final_dram_state.ret_addr,
        &dram_state,
    );
    emit_log(
        app_handle,
        active.id,
        LEVEL_INFO,
        &format!(
            "DRAM init result: ret_addr=0x{:x}, init_flag={}, update_flag={}",
            final_dram_state.ret_addr,
            final_dram_state.dram_init_flag,
            final_dram_state.dram_update_flag
        ),
    );
    emit_log(
        app_handle,
        active.id,
        LEVEL_INFO,
        &format_dram_parameters(&dram_state.dram_para),
    );
    emit_log(app_handle, active.id, LEVEL_INFO, "DRAM initialized");
    Ok(())
}

pub(super) async fn download_uboot_bundle<R: Runtime>(
    app_handle: &AppHandle<R>,
    active: &ActiveTask,
    reporter: &mut ProgressReporter<R>,
    handle: u32,
    image_path: &str,
) -> Result<(), AppError> {
    reporter.start("fel_download_uboot");
    emit_log(
        app_handle,
        active.id,
        LEVEL_INFO,
        "Downloading U-Boot bundle",
    );

    let uboot = read_named_entry(image_path, IMAGE_ENTRY_UBOOT)?;
    let header = parse_uboot(&uboot).map_err(|error| to_app_error("ParseUboot", error))?;
    let patched_uboot = set_uboot_work_mode(&uboot, WORK_MODE_USB_PRODUCT)
        .map_err(|error| to_app_error("PatchUboot", error))?;
    let dtb = read_optional_entry(image_path, IMAGE_ENTRY_DTB)?;
    let sys_config_bin = read_named_entry(image_path, IMAGE_ENTRY_SYS_CONFIG_BIN)?;
    let board_config = read_optional_entry(image_path, IMAGE_ENTRY_BOARD_CONFIG)?;

    let total_bytes = patched_uboot.len() as u64
        + dtb.as_ref().map_or(0, |data| data.len() as u64)
        + sys_config_bin.len() as u64
        + board_config.as_ref().map_or(0, |data| data.len() as u64);
    let progress = reporter.download_context();

    let result: Result<(), AppError> = async {
        let mut written = transfer_fel_bytes(
            &progress,
            FelTransfer {
                handle,
                addr: header.uboot_head.run_addr,
                data: &patched_uboot,
                item_name: "U-Boot",
                progress_range: TransferProgressRange {
                    written_base: 0,
                    total_bytes,
                    stage_start_percent: 0.0,
                    stage_end_percent: 80.0,
                },
            },
        )
        .await?;

        let dtb_base = header.uboot_head.run_addr.wrapping_add(UBOOT_MAX_LEN);
        if let Some(dtb) = dtb {
            written += transfer_fel_bytes(
                &progress,
                FelTransfer {
                    handle,
                    addr: dtb_base,
                    data: &dtb,
                    item_name: "DTB",
                    progress_range: TransferProgressRange {
                        written_base: written,
                        total_bytes,
                        stage_start_percent: 0.0,
                        stage_end_percent: 80.0,
                    },
                },
            )
            .await?;
        }

        let sys_config_bin_base = dtb_base.wrapping_add(DTB_MAX_LEN);
        written += transfer_fel_bytes(
            &progress,
            FelTransfer {
                handle,
                addr: sys_config_bin_base,
                data: &sys_config_bin,
                item_name: "sys_config.bin",
                progress_range: TransferProgressRange {
                    written_base: written,
                    total_bytes,
                    stage_start_percent: 0.0,
                    stage_end_percent: 80.0,
                },
            },
        )
        .await?;

        if let Some(board_config) = board_config {
            let board_config_base = sys_config_bin_base.wrapping_add(SYS_CONFIG_BIN_MAX_LEN);
            transfer_fel_bytes(
                &progress,
                FelTransfer {
                    handle,
                    addr: board_config_base,
                    data: &board_config,
                    item_name: "board_config.bin",
                    progress_range: TransferProgressRange {
                        written_base: written,
                        total_bytes,
                        stage_start_percent: 0.0,
                        stage_end_percent: 80.0,
                    },
                },
            )
            .await?;
        }

        reporter.update(90.0, Some("Executing U-Boot"));
        efex_fel_exec(handle, header.uboot_head.run_addr)
            .await
            .map_err(AppError::from)?;
        Ok(())
    }
    .await;
    result?;

    reporter.complete();
    emit_log(
        app_handle,
        active.id,
        LEVEL_INFO,
        "U-Boot bundle downloaded",
    );
    Ok(())
}
