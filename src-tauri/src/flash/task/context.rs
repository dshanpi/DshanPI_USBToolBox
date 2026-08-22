use super::*;

pub(super) fn to_app_error<E: ToString>(name: &str, error: E) -> AppError {
    AppError {
        code: -1,
        name: name.to_string(),
        message: error.to_string(),
    }
}

pub(super) fn storage_name(storage_type: i32) -> &'static str {
    match storage_type {
        STORAGE_NAND => "NAND",
        STORAGE_SDCARD => "SDCARD",
        STORAGE_EMMC => "eMMC",
        STORAGE_SPINOR => "SPI-NOR",
        STORAGE_EMMC3 => "eMMC3",
        STORAGE_SPINAND => "SPI-NAND",
        STORAGE_SD1 => "SD1",
        STORAGE_EMMC0 => "eMMC0",
        STORAGE_UFS => "UFS",
        _ => "UNKNOWN",
    }
}

pub(super) fn build_partition_subtype(filename: &str) -> String {
    let normalized = filename.to_uppercase().replace('.', "_");
    let mut subtype = format!("{normalized}{PARTITION_DOWNLOADFILE_SUFFIX}");
    subtype.truncate(16);
    subtype
}

pub(super) fn parse_image_context(image_path: &str) -> Result<ImageContext, AppError> {
    let parsed = parse_image(image_path).map_err(|error| to_app_error("ParseImage", error))?;
    if parsed.is_encrypted {
        return Err(AppError {
            code: -1,
            name: "EncryptedImage".to_string(),
            message: "Encrypted firmware images are not supported".to_string(),
        });
    }

    let info = parsed.image_info.ok_or_else(|| AppError {
        code: -1,
        name: "ImageInfoMissing".to_string(),
        message: "Firmware image header is missing".to_string(),
    })?;

    let mut files_by_name = HashMap::new();
    let mut files_by_type = HashMap::new();
    for file in &info.files {
        files_by_name.insert(file.filename.clone(), file.clone());
        files_by_type.insert((file.maintype.clone(), file.subtype.clone()), file.clone());
    }

    Ok(ImageContext {
        files_by_name,
        files_by_type,
    })
}

pub(super) fn get_file_info_by_name<'a>(
    image: &'a ImageContext,
    filename: &str,
) -> Option<&'a FileInfoDto> {
    image.files_by_name.get(filename)
}

pub(super) fn get_file_info_by_type<'a>(
    image: &'a ImageContext,
    maintype: &str,
    subtype: &str,
) -> Option<&'a FileInfoDto> {
    image
        .files_by_type
        .get(&(maintype.to_string(), subtype.to_string()))
}

pub(super) fn read_named_entry(image_path: &str, entry: (&str, &str)) -> Result<Vec<u8>, AppError> {
    read_entry_by_maintype_subtype(image_path, entry.0, entry.1)
        .map_err(|error| to_app_error("ReadEntry", error))?
        .ok_or_else(|| AppError {
            code: -1,
            name: "EntryNotFound".to_string(),
            message: format!(
                "Firmware entry not found: {}/{}",
                entry.0.trim(),
                entry.1.trim()
            ),
        })
}

pub(super) fn read_optional_entry(
    image_path: &str,
    entry: (&str, &str),
) -> Result<Option<Vec<u8>>, AppError> {
    read_entry_by_maintype_subtype(image_path, entry.0, entry.1)
        .map_err(|error| to_app_error("ReadEntry", error))
}

pub(super) fn read_partition_config_from_image(
    image_path: &str,
) -> Result<PartitionConfigDto, AppError> {
    let data = read_entry_by_filename(image_path, "sys_partition.bin")
        .map_err(|error| to_app_error("ReadEntry", error))?
        .or_else(|| {
            read_entry_by_filename(image_path, "sys_partition.fex")
                .ok()
                .flatten()
        })
        .or_else(|| {
            read_entry_by_maintype_subtype(
                image_path,
                IMAGE_ENTRY_SYS_PARTITION.0,
                IMAGE_ENTRY_SYS_PARTITION.1,
            )
            .ok()
            .flatten()
        })
        .ok_or_else(|| AppError {
            code: -1,
            name: "PartitionConfigMissing".to_string(),
            message: "Partition configuration not found in firmware image".to_string(),
        })?;

    parse_partition_config(&data).map_err(|error| to_app_error("ParsePartitionConfig", error))
}

pub(super) fn mbr_bytes(session: &FlashSession) -> Result<Vec<u8>, AppError> {
    if let Some(data) = &session.options.mbr_data {
        return Ok(data.clone());
    }
    read_named_entry(&session.image_path, IMAGE_ENTRY_MBR)
}

pub(super) fn close_device_id(device_id: Option<u32>) {
    if let Some(device_id) = device_id {
        crate::efex::device::unregister_device(device_id);
    }
}

pub(super) fn worker_partition_from_mbr(
    partition: &crate::firmware::types::PartitionInfoDto,
) -> Result<PartitionInfo, AppError> {
    let address = partition
        .address
        .parse::<u64>()
        .map_err(|error| to_app_error("PartitionAddress", error))?;
    let length = partition
        .length
        .parse::<u64>()
        .map_err(|error| to_app_error("PartitionLength", error))?;

    Ok(PartitionInfo {
        name: partition.name.clone(),
        classname: partition.classname.clone(),
        address,
        length,
        user_type: partition.user_type,
        keydata: partition.keydata,
        readonly: partition.readonly,
    })
}

pub(super) async fn scan_for_mode(
    expected_mode: &str,
    preferred: Option<(u8, u8)>,
    device_path: Option<&str>,
) -> Result<Option<crate::efex::types::EfexDevice>, AppError> {
    // When a device_path is available, check only that specific device to avoid
    // opening USB handles to other devices that may be mid-flash.
    if let Some(path) = device_path {
        let path = path.to_owned();
        let expected = expected_mode.to_owned();
        return tokio::task::spawn_blocking(move || scan_single_device_for_mode(&path, &expected))
            .await
            .map_err(|e| AppError::internal(format!("Scan task failed: {e}")))?;
    }

    let devices = efex_scan_devices().await.map_err(AppError::from)?;
    let mut matches: Vec<crate::efex::types::EfexDevice> = devices
        .into_iter()
        .filter(|device| device.mode == expected_mode)
        .collect();

    if let Some(preferred) = preferred {
        if let Some(position) = matches
            .iter()
            .position(|candidate| (candidate.bus, candidate.port) == preferred)
        {
            return Ok(Some(matches.remove(position)));
        }
    }

    Ok(matches.into_iter().next())
}

/// Check a single device by its device_path for the expected mode.
/// This avoids scanning all USB devices, preventing interference with
/// other devices that may be actively flashing.
fn scan_single_device_for_mode(
    device_path: &str,
    expected_mode: &str,
) -> Result<Option<crate::efex::types::EfexDevice>, AppError> {
    use crate::efex::device;
    use crate::efex::types::DeviceMode;
    use crate::usb::DeviceAddress;

    let addr = DeviceAddress::parse(device_path);
    let (bus, port) = addr.bus_port();

    let mut ctx = match crate::usb::open_context(&addr) {
        Ok(ctx) => ctx,
        Err(_) => return Ok(None), // Device not ready yet
    };

    if ctx.usb_init().is_err() {
        return Ok(None);
    }
    if ctx.efex_init().is_err() {
        return Ok(None); // Device not ready yet
    }

    let mode: DeviceMode = ctx.get_device_mode().into();
    let mode_str = ctx.get_device_mode_str().to_string();
    let chip_version = unsafe { (*ctx.as_ptr()).resp.id };

    if mode.as_str() != expected_mode {
        return Ok(None);
    }

    let device_id = device::register_device(bus, port, Some(device_path.to_owned()));
    drop(ctx);

    Ok(Some(crate::efex::types::EfexDevice {
        device_id,
        chip_version,
        mode: mode.as_str().to_string(),
        mode_str,
        bus,
        port,
    }))
}

pub(super) async fn wait_for_mode<R: Runtime>(
    app_handle: &AppHandle<R>,
    active: &ActiveTask,
    reporter: &mut ProgressReporter<R>,
    expected_mode: &str,
    preferred: Option<(u8, u8)>,
    device_path: Option<&str>,
) -> Result<crate::efex::types::EfexDevice, AppError> {
    tokio::time::sleep(MODE_RECONNECT_DELAY).await;

    for attempt in 0..MAX_MODE_RETRIES {
        check_cancelled(active)?;
        match scan_for_mode(expected_mode, preferred, device_path).await {
            Ok(Some(device)) => return Ok(device),
            Ok(None) => {}
            Err(error) if is_transient_usb_error(&error) => {}
            Err(error) => return Err(error),
        }

        emit_log(
            app_handle,
            active.id,
            LEVEL_INFO,
            &format!(
                "Waiting for {expected_mode} device ({}/{})",
                attempt + 1,
                MAX_MODE_RETRIES
            ),
        );
        reporter.update(
            ((attempt + 1) as f64 / MAX_MODE_RETRIES as f64) * 100.0,
            None,
        );
        tokio::time::sleep(MODE_RETRY_INTERVAL).await;
    }

    Err(AppError {
        code: -1,
        name: "ReconnectFailed".to_string(),
        message: format!("Timed out waiting for {expected_mode} mode device"),
    })
}

fn is_transient_usb_error(error: &AppError) -> bool {
    matches!(
        error.code,
        -10 | // UsbInit
        -11 | // UsbDeviceNotFound
        -12 | // UsbOpen
        -13 | // UsbTransfer
        -14 | // UsbTimeout
        -21 | // InvalidResponse
        -22 | // UnexpectedStatus
        -30 | // InvalidState
        -31 | // InvalidDeviceMode
        -34 // DeviceNotReady
    )
}

pub(super) fn erase_flag_value(mode: &super::FlashMode) -> u32 {
    match mode {
        super::FlashMode::Bootloader => 0x0,
        super::FlashMode::Partition => 0x0,
        super::FlashMode::KeepData => 0x0,
        super::FlashMode::PartitionErase => 0x1,
        super::FlashMode::FullErase => 0x12,
        super::FlashMode::EraseOnly => 0x12,
    }
}

pub(super) fn should_skip_partition(
    mode: &super::FlashMode,
    selected: &Option<Vec<String>>,
    name: &str,
) -> bool {
    if matches!(mode, super::FlashMode::KeepData) {
        let lower = name.to_ascii_lowercase();
        if lower == "udisk" || lower == "private" || lower == "reserve" {
            return true;
        }
    }

    if matches!(mode, super::FlashMode::Partition) {
        if let Some(selected) = selected {
            return !selected.iter().any(|partition| partition == name);
        }
    }

    false
}

pub(super) fn should_skip_ubifs_partition(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    ["UDISK", "SYSRECOVERY", "PRIVATE"]
        .iter()
        .any(|prefix| upper.starts_with(prefix))
}

pub(super) fn read_magic_from_external_file(path: &str) -> Result<Option<u32>, AppError> {
    let mut file = File::open(path).map_err(|error| to_app_error("FileOpen", error))?;
    let mut header = [0u8; 4];
    let read = file
        .read(&mut header)
        .map_err(|error| to_app_error("FileRead", error))?;
    if read < 4 {
        return Ok(None);
    }
    Ok(Some(u32::from_le_bytes(header)))
}

pub(super) fn read_magic_from_firmware(
    image_path: &str,
    filename: &str,
    subtype: &str,
) -> Result<Option<u32>, AppError> {
    let data = read_entry_range_by_maintype_subtype(image_path, ITEM_ROOTFSFAT16, subtype, 0, 4)
        .map_err(|error| to_app_error("ReadEntry", error))?
        .or_else(|| {
            read_entry_range_by_filename(image_path, filename, 0, 4)
                .ok()
                .flatten()
        });

    Ok(data.and_then(|bytes| {
        if bytes.len() < 4 {
            None
        } else {
            Some(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
        }
    }))
}

pub(super) fn resolve_partition_plan(
    image: &ImageContext,
    image_path: &str,
    mbr_info: &MbrInfoDto,
    options: &FlashOptions,
) -> Result<Vec<PartitionPlanItem>, AppError> {
    let config = if let Some(partitions) = &options.partition_config {
        if partitions.is_empty() {
            read_partition_config_from_image(image_path)?
        } else {
            PartitionConfigDto {
                mbr_size: 0,
                partitions: partitions
                    .iter()
                    .map(|partition| crate::firmware::types::PartitionDto {
                        name: partition.name.clone(),
                        size: partition.size,
                        downloadfile: partition.downloadfile.clone(),
                        user_type: partition.user_type,
                        keydata: partition.keydata,
                        encrypt: partition.encrypt,
                        verify: partition.verify,
                        ro: partition.ro,
                    })
                    .collect(),
            }
        }
    } else {
        read_partition_config_from_image(image_path)?
    };

    let mut items = Vec::new();
    for partition in &mbr_info.partitions {
        if should_skip_partition(&options.mode, &options.partitions, &partition.name) {
            continue;
        }

        let Some(config_partition) = config
            .partitions
            .iter()
            .find(|item| item.name == partition.name)
        else {
            continue;
        };

        let worker_partition = worker_partition_from_mbr(partition)?;

        let source = if let Some(custom_path) = options
            .partition_config
            .as_ref()
            .and_then(|partitions| partitions.iter().find(|item| item.name == partition.name))
            .and_then(|item| item.custom_file_path.clone())
        {
            PartitionSource::ExternalFile { path: custom_path }
        } else if !config_partition.downloadfile.is_empty() {
            let subtype = build_partition_subtype(&config_partition.downloadfile);
            let file = get_file_info_by_type(image, ITEM_ROOTFSFAT16, &subtype)
                .or_else(|| get_file_info_by_type(image, "12345678", &subtype))
                .or_else(|| get_file_info_by_name(image, &config_partition.downloadfile))
                .ok_or_else(|| AppError {
                    code: -1,
                    name: "PartitionImageMissing".to_string(),
                    message: format!(
                        "Partition image not found: {} ({})",
                        partition.name, config_partition.downloadfile
                    ),
                })?;

            PartitionSource::Firmware {
                filename: config_partition.downloadfile.clone(),
                subtype,
                offset: file.offset as u64,
                length: file.original_length as u64,
            }
        } else {
            continue;
        };

        items.push(PartitionPlanItem {
            partition: worker_partition,
            source,
        });
    }

    Ok(items)
}

pub(super) fn partition_source_size(item: &PartitionPlanItem) -> u64 {
    match &item.source {
        PartitionSource::Firmware { length, .. } => *length,
        PartitionSource::ExternalFile { path } => std::fs::metadata(path)
            .map(|meta| meta.len())
            .unwrap_or(item.partition.length.saturating_mul(512)),
    }
}

pub(super) fn should_download_boot_components(
    options: &FlashOptions,
    plan: &[PartitionPlanItem],
) -> bool {
    let Some(config) = options.partition_config.as_ref() else {
        return true;
    };

    if config.len() != 1 || plan.len() != 1 {
        return true;
    }

    let partition = &config[0];
    let item = &plan[0];
    let is_generic_raw = partition.name.eq_ignore_ascii_case("raw")
        && item.partition.name.eq_ignore_ascii_case("raw")
        && partition.downloadfile.trim().is_empty()
        && partition
            .custom_file_path
            .as_deref()
            .is_some_and(|path| !path.trim().is_empty())
        && matches!(item.source, PartitionSource::ExternalFile { .. });

    !is_generic_raw
}

pub(super) async fn ensure_device_mode(device_id: u32) -> Result<String, AppError> {
    efex_get_device_mode(device_id)
        .await
        .map_err(AppError::from)
}
