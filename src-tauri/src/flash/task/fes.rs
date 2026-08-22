use super::*;

pub(super) async fn download_erase_flag<R: Runtime>(
    app_handle: &AppHandle<R>,
    active: &ActiveTask,
    reporter: &mut ProgressReporter<R>,
    handle: u32,
    options: &FlashOptions,
) -> Result<(), AppError> {
    reporter.start("erase_flag");
    emit_log(app_handle, active.id, LEVEL_INFO, "Sending erase flag");

    let mut erase = vec![0u8; 16];
    erase[..4].copy_from_slice(&erase_flag_value(&options.mode).to_le_bytes());
    efex_fes_down(handle, erase, 0, FES_ERASE_TAG)
        .await
        .map_err(AppError::from)?;
    reporter.update(60.0, Some("Verifying erase flag"));

    for _ in 0..MAX_VERIFY_RETRIES {
        check_cancelled(active)?;
        let response = efex_fes_verify_status(handle, FES_ERASE_TAG)
            .await
            .map_err(AppError::from)?;
        if response.flag == EFEX_CRC32_VALID_FLAG && response.media_crc == 0 {
            reporter.complete();
            return Ok(());
        }
    }

    Err(AppError {
        code: -1,
        name: "EraseFlagVerifyFailed".to_string(),
        message: "Failed to verify erase flag".to_string(),
    })
}

pub(super) async fn maybe_switch_ubifs_interface<R: Runtime>(
    app_handle: &AppHandle<R>,
    active: &ActiveTask,
    handle: u32,
    storage_type: i32,
    image_path: &str,
    plan: &[PartitionPlanItem],
) -> Result<(), AppError> {
    if matches!(storage_type, STORAGE_SDCARD | STORAGE_SD1) {
        emit_log(
            app_handle,
            active.id,
            LEVEL_INFO,
            "Skipping UBIFS check for SD storage",
        );
        return Ok(());
    }

    for item in plan {
        if should_skip_ubifs_partition(&item.partition.name) {
            continue;
        }

        emit_log(
            app_handle,
            active.id,
            LEVEL_INFO,
            &format!(
                "Checking partition \"{}\" for UBIFS...",
                item.partition.name
            ),
        );

        let magic = match &item.source {
            PartitionSource::Firmware {
                filename, subtype, ..
            } => read_magic_from_firmware(image_path, filename, subtype)?,
            PartitionSource::ExternalFile { path } => read_magic_from_external_file(path)?,
        };

        if magic == Some(UBIFS_NODE_MAGIC) {
            emit_log(
                app_handle,
                active.id,
                LEVEL_INFO,
                &format!("UBIFS partition detected: {}", item.partition.name),
            );
            efex_fes_down(handle, vec![0; 4096], 0, FES_EXT4_UBIFS_TAG)
                .await
                .map_err(AppError::from)?;
            emit_log(app_handle, active.id, LEVEL_INFO, "UBIFS interface enabled");
            return Ok(());
        }
    }

    emit_log(
        app_handle,
        active.id,
        LEVEL_INFO,
        "No UBIFS partition detected",
    );
    Ok(())
}

pub(super) async fn download_mbr<R: Runtime>(
    app_handle: &AppHandle<R>,
    active: &ActiveTask,
    reporter: &mut ProgressReporter<R>,
    handle: u32,
    mbr_data: &[u8],
) -> Result<(), AppError> {
    reporter.start("mbr");
    reporter.set_indeterminate(true);
    emit_log(
        app_handle,
        active.id,
        LEVEL_INFO,
        "Waiting for flash erase...",
    );

    efex_fes_down(handle, mbr_data.to_vec(), 0, FES_MBR_TAG)
        .await
        .map_err(AppError::from)?;

    emit_log(
        app_handle,
        active.id,
        LEVEL_INFO,
        &format!("MBR transfer completed, {} bytes sent", mbr_data.len()),
    );

    for attempt in 0..MAX_VERIFY_RETRIES {
        check_cancelled(active)?;
        emit_log(
            app_handle,
            active.id,
            LEVEL_INFO,
            &format!("Verifying MBR download, attempt {}...", attempt + 1),
        );
        let response = efex_fes_verify_status(handle, FES_MBR_TAG)
            .await
            .map_err(AppError::from)?;
        if response.flag == EFEX_CRC32_VALID_FLAG && response.media_crc == 0 {
            reporter.set_indeterminate(false);
            reporter.complete();
            return Ok(());
        }
    }

    reporter.set_indeterminate(false);
    Err(AppError {
        code: -1,
        name: "MbrVerifyFailed".to_string(),
        message: "Failed to verify downloaded MBR".to_string(),
    })
}

pub(super) async fn download_partitions<R: Runtime>(
    app_handle: &AppHandle<R>,
    active: &ActiveTask,
    reporter: &mut ProgressReporter<R>,
    session: &FlashSession,
    plan: &[PartitionPlanItem],
) -> Result<(), AppError> {
    reporter.start("partitions");

    if plan.is_empty() {
        reporter.complete();
        emit_log(
            app_handle,
            active.id,
            LEVEL_WARN,
            "No partitions selected for download",
        );
        return Ok(());
    }

    let total_bytes: u64 = plan.iter().map(partition_source_size).sum();
    let mut completed_bytes = 0u64;

    for item in plan {
        check_cancelled(active)?;

        reporter.set_current_partition(Some(item.partition.name.clone()));
        reporter.set_partition_progress(Some(0.0), Some(completed_bytes), Some(total_bytes));
        reporter.emit();
        let download_progress =
            reporter.download_context_for_transfer(completed_bytes, Some(total_bytes));

        let result = match &item.source {
            PartitionSource::Firmware { offset, length, .. } => {
                let info = PartitionDownloadInfo {
                    partition: item.partition.clone(),
                    data_offset: *offset,
                    data_length: *length,
                    need_verify: session.options.verify_download,
                    external_file_path: None,
                };

                download_from_image_impl(
                    app_handle,
                    active.id,
                    &download_progress,
                    session.device_id.unwrap(),
                    &info,
                    &session.image_path,
                    || {
                        if active.cancel.load(Ordering::SeqCst) {
                            Err(crate::efex::error::EfexError {
                                code: -1000,
                                name: "Cancelled".to_string(),
                                message: "Flash operation cancelled".to_string(),
                            })
                        } else {
                            Ok(())
                        }
                    },
                )
                .await
                .map_err(AppError::from)?
            }
            PartitionSource::ExternalFile { path } => {
                let info = ExternalFileDownloadInfo {
                    partition: item.partition.clone(),
                    file_path: path.clone(),
                    need_verify: session.options.verify_download,
                };

                download_from_file_impl(
                    app_handle,
                    active.id,
                    &download_progress,
                    session.device_id.unwrap(),
                    &info,
                    || {
                        if active.cancel.load(Ordering::SeqCst) {
                            Err(crate::efex::error::EfexError {
                                code: -1000,
                                name: "Cancelled".to_string(),
                                message: "Flash operation cancelled".to_string(),
                            })
                        } else {
                            Ok(())
                        }
                    },
                )
                .await
                .map_err(AppError::from)?
            }
        };

        if !result.success {
            return Err(AppError {
                code: -1,
                name: "PartitionDownloadFailed".to_string(),
                message: format!("Partition download failed: {}", result.partition_name),
            });
        }

        completed_bytes = completed_bytes.saturating_add(partition_source_size(item));
        reporter.mark_completed_partition(&item.partition.name);
        reporter.set_partition_progress(Some(100.0), Some(completed_bytes), Some(total_bytes));
        reporter.update(
            if total_bytes == 0 {
                100.0
            } else {
                (completed_bytes as f64 / total_bytes as f64) * 100.0
            },
            Some("Downloading partitions"),
        );
    }

    reporter.set_current_partition(None);
    reporter.set_partition_progress(None, Some(total_bytes), Some(total_bytes));
    reporter.complete();
    Ok(())
}

fn boot1_entry(secure_type: u32, storage_type: i32) -> Option<(&'static str, &'static str)> {
    match secure_type {
        BOOT_MODE_NORMAL => Some(("12345678", "UBOOT_0000000000")),
        BOOT_MODE_TOC => Some(("12345678", "TOC1_00000000000")),
        BOOT_MODE_PKG if storage_type == STORAGE_SPINOR => Some(("12345678", "BOOTPKG-NOR00000")),
        BOOT_MODE_PKG => Some(("12345678", "BOOTPKG-00000000")),
        _ => None,
    }
}

fn boot0_entry(secure_type: u32, storage_type: i32) -> Option<(&'static str, &'static str)> {
    if matches!(secure_type, BOOT_MODE_NORMAL | BOOT_MODE_PKG) {
        return match storage_type {
            STORAGE_NAND | STORAGE_SPINAND => Some(("BOOT    ", "BOOT0_0000000000")),
            STORAGE_SDCARD | STORAGE_EMMC | STORAGE_EMMC3 | STORAGE_EMMC0 => {
                Some(("12345678", "1234567890BOOT_0"))
            }
            STORAGE_SPINOR => Some(("12345678", "1234567890BNOR_0")),
            STORAGE_UFS => Some(("12345678", "1234567890BUFS_0")),
            _ => None,
        };
    }

    match storage_type {
        STORAGE_SDCARD | STORAGE_SD1 => Some(("12345678", "TOC0_SDCARD00000")),
        STORAGE_NAND | STORAGE_SPINAND => Some(("12345678", "TOC0_NAND0000000")),
        STORAGE_SPINOR => Some(("12345678", "TOC0_SPINOR00000")),
        STORAGE_UFS => Some(("12345678", "TOC0_UFS00000000")),
        _ => Some(("12345678", "TOC0_00000000000")),
    }
}

pub(super) async fn download_boot_components<R: Runtime>(
    app_handle: &AppHandle<R>,
    active: &ActiveTask,
    reporter: &mut ProgressReporter<R>,
    handle: u32,
    image_path: &str,
    secure_type: u32,
    storage_type: i32,
) -> Result<(), AppError> {
    reporter.start("boot");
    emit_log(
        app_handle,
        active.id,
        LEVEL_INFO,
        "Downloading boot components",
    );
    let progress = reporter.download_context();

    let boot1 = boot1_entry(secure_type, storage_type).ok_or_else(|| AppError {
        code: -1,
        name: "Boot1Unsupported".to_string(),
        message: format!("Unsupported boot1 mode: secure={secure_type}, storage={storage_type}"),
    })?;
    let boot1_data = read_named_entry(image_path, boot1)?;
    let boot0 = boot0_entry(secure_type, storage_type)
        .or_else(|| boot0_entry(secure_type, STORAGE_AUTO))
        .ok_or_else(|| AppError {
            code: -1,
            name: "Boot0Unsupported".to_string(),
            message: format!(
                "Unsupported boot0 mode: secure={secure_type}, storage={storage_type}"
            ),
        })?;
    let boot0_data = read_named_entry(image_path, boot0)?;
    let boot1_len = boot1_data.len() as u64;
    let boot0_len = boot0_data.len() as u64;
    let total_bytes = boot1_len + boot0_len;

    transfer_fes_bytes(
        &progress,
        FesTransfer {
            handle,
            addr: 0,
            data: boot1_data,
            data_type: crate::efex::types::FesDataType::Boot1,
            item_name: "boot1",
            progress_range: TransferProgressRange {
                written_base: 0,
                total_bytes,
                stage_start_percent: 0.0,
                stage_end_percent: 100.0,
            },
            timeout_secs: calculate_transfer_timeout_secs(boot1_len as usize, 30),
        },
    )
    .await?;
    transfer_fes_bytes(
        &progress,
        FesTransfer {
            handle,
            addr: 0,
            data: boot0_data,
            data_type: crate::efex::types::FesDataType::Boot0,
            item_name: "boot0",
            progress_range: TransferProgressRange {
                written_base: boot1_len,
                total_bytes,
                stage_start_percent: 0.0,
                stage_end_percent: 100.0,
            },
            timeout_secs: calculate_transfer_timeout_secs(boot0_len as usize, 30),
        },
    )
    .await?;

    reporter.complete();
    Ok(())
}

pub(super) async fn set_post_flash_action<R: Runtime>(
    app_handle: &AppHandle<R>,
    active: &ActiveTask,
    reporter: &mut ProgressReporter<R>,
    handle: u32,
    action: &super::PostFlashAction,
) -> Result<(), AppError> {
    reporter.start("set_mode");

    let next_mode = match action {
        super::PostFlashAction::Reboot => TOOL_MODE_REBOOT,
        super::PostFlashAction::Poweroff => TOOL_MODE_POWEROFF,
        super::PostFlashAction::None => TOOL_MODE_NORMAL,
    };

    if next_mode == TOOL_MODE_NORMAL {
        reporter.complete();
        return Ok(());
    }

    emit_log(
        app_handle,
        active.id,
        LEVEL_INFO,
        &format!("Setting post-flash action: {:?}", action),
    );
    efex_fes_tool_mode(handle, TOOL_MODE_REBOOT, next_mode)
        .await
        .map_err(AppError::from)?;
    reporter.complete();
    Ok(())
}
