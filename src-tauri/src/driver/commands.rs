use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverStatus {
    pub supported: bool,
    pub installed: bool,
    pub serial_driver_installed: bool,
    pub interface_driver_installed: bool,
    pub friendly_name_helper_installed: bool,
    pub published_names: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverOperationResult {
    pub success: bool,
    pub cancelled: bool,
    pub restart_required: bool,
    pub warnings: Vec<String>,
    pub status: DriverStatus,
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScriptOperationResult {
    success: bool,
    exit_code: i32,
    restart_required: bool,
    stage: String,
    error: String,
    #[serde(default)]
    warnings: Vec<String>,
    #[serde(default)]
    log: Vec<String>,
}

#[tauri::command]
pub async fn driver_get_status() -> Result<DriverStatus, String> {
    tauri::async_runtime::spawn_blocking(get_status)
        .await
        .map_err(|error| format!("Driver status task failed: {error}"))?
}

#[tauri::command]
pub async fn driver_install(app: AppHandle) -> Result<DriverOperationResult, String> {
    run_operation(app, DriverAction::Install).await
}

#[tauri::command]
pub async fn driver_uninstall(app: AppHandle) -> Result<DriverOperationResult, String> {
    run_operation(app, DriverAction::Uninstall).await
}

#[derive(Clone, Copy)]
enum DriverAction {
    Install,
    Uninstall,
}

impl DriverAction {
    fn as_str(self) -> &'static str {
        match self {
            Self::Install => "Install",
            Self::Uninstall => "Uninstall",
        }
    }
}

async fn run_operation(
    app: AppHandle,
    action: DriverAction,
) -> Result<DriverOperationResult, String> {
    #[cfg(windows)]
    {
        let driver_root = resolve_driver_root(&app)?;
        let result =
            tauri::async_runtime::spawn_blocking(move || run_elevated(&driver_root, action))
                .await
                .map_err(|error| format!("Driver operation task failed: {error}"))??;

        if !result.cancelled {
            // PnP installation/removal and FriendlyName updates may finish after
            // the last WM_DEVICECHANGE burst was debounced by the frontend. Force
            // a fresh CH347 enumeration now, then once more after Windows has had
            // time to publish the final device properties.
            if let Err(error) = app.emit("ch347-device-changed", ()) {
                log::warn!("Failed to request CH347 refresh after driver operation: {error}");
            }
            let delayed_app = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(1_200)).await;
                if let Err(error) = delayed_app.emit("ch347-device-changed", ()) {
                    log::warn!("Failed to request delayed CH347 refresh: {error}");
                }
            });
        }

        Ok(result)
    }

    #[cfg(not(windows))]
    {
        let _ = (app, action);
        Err("DshanPI drivers are only supported on Windows".into())
    }
}

#[cfg(windows)]
fn run_elevated(
    driver_root: &std::path::Path,
    action: DriverAction,
) -> Result<DriverOperationResult, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const ERROR_CANCELLED: i32 = 1223;

    let script_path = driver_root.join("Install-DshanPI-USBToolBox.ps1");
    if !script_path.is_file() {
        return Err(format!(
            "Bundled driver installer is missing: {}",
            script_path.display()
        ));
    }

    let result_path = operation_result_path(action);
    let powershell = std::env::var_os("SystemRoot")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows"))
        .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
    let escaped_script = script_path.to_string_lossy().replace('\'', "''");
    let escaped_result = result_path.to_string_lossy().replace('\'', "''");
    let escaped_powershell = powershell.to_string_lossy().replace('\'', "''");
    let elevated_command = format!(
        r#"$ErrorActionPreference = 'Stop'; try {{ $script = '{escaped_script}'; $result = '{escaped_result}'; $powershell = '{escaped_powershell}'; $arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $script + '" -Action {action} -ResultPath "' + $result + '" -Quiet'; $process = Start-Process -FilePath $powershell -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $process.ExitCode }} catch {{ if ($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.HResult -eq -2147023673) {{ exit 1223 }}; Write-Error $_.Exception.Message; exit 1 }}"#,
        action = action.as_str()
    );

    let output = Command::new(&powershell)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &elevated_command,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Unable to start the driver installer: {error}"))?;

    let exit_code = output.status.code().unwrap_or(1);
    let script_result = read_script_result(&result_path);
    let _ = std::fs::remove_file(&result_path);
    if exit_code == ERROR_CANCELLED {
        return Ok(DriverOperationResult {
            success: false,
            cancelled: true,
            restart_required: false,
            warnings: Vec::new(),
            status: get_status()?,
        });
    }

    let restart_required = matches!(exit_code, 1641 | 3010)
        || script_result
            .as_ref()
            .is_some_and(|result| result.restart_required);
    let status = get_status()?;
    let desired_state_reached = match action {
        DriverAction::Install => status.installed,
        DriverAction::Uninstall => {
            !status.serial_driver_installed && !status.interface_driver_installed
        }
    };
    let warnings = script_result
        .as_ref()
        .map(|result| result.warnings.clone())
        .unwrap_or_default();

    // The driver packages are the authoritative result. An optional helper or
    // task may fail after PnPUtil has already reached the requested state.
    if desired_state_reached {
        return Ok(DriverOperationResult {
            success: true,
            cancelled: false,
            restart_required,
            warnings,
            status,
        });
    }

    if exit_code != 0 && !restart_required {
        let stderr = decode_console_output(&output.stderr);
        let detail = script_result
            .as_ref()
            .map(format_script_error)
            .filter(|message| !message.is_empty())
            .unwrap_or_else(|| stderr.trim().to_string());
        return Err(if detail.is_empty() {
            format!(
                "Driver {} failed with exit code {exit_code}",
                action.as_str()
            )
        } else {
            format!(
                "Driver {} failed with exit code {exit_code}: {detail}",
                action.as_str()
            )
        });
    }

    Err(match action {
        DriverAction::Install => {
            "The installer completed, but one or more driver packages were not detected".into()
        }
        DriverAction::Uninstall => {
            "The uninstaller completed, but one or more driver packages are still installed".into()
        }
    })
}

#[cfg(windows)]
fn operation_result_path(action: DriverAction) -> std::path::PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    std::env::temp_dir().join(format!(
        "usbtoolbox-driver-{}-{}-{nonce}.json",
        action.as_str().to_ascii_lowercase(),
        std::process::id()
    ))
}

#[cfg(windows)]
fn read_script_result(path: &std::path::Path) -> Option<ScriptOperationResult> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()
}

#[cfg(windows)]
fn format_script_error(result: &ScriptOperationResult) -> String {
    let mut detail = if result.error.trim().is_empty() {
        format!(
            "stage '{}' failed with exit code {}",
            result.stage, result.exit_code
        )
    } else {
        format!("stage '{}': {}", result.stage, result.error.trim())
    };
    if !result.log.is_empty() {
        detail.push_str(" — ");
        detail.push_str(&result.log.join(" | "));
    }
    if result.success {
        String::new()
    } else {
        detail
    }
}

#[cfg(windows)]
fn resolve_driver_root(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let script_name = "Install-DshanPI-USBToolBox.ps1";

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("drivers").join("dshanpi");
        if bundled.join(script_name).is_file() {
            return Ok(bundled);
        }
    }

    // Tauri development builds may not stage resources next to the executable.
    // Search ancestors of the executable and working directory for the source package.
    let mut roots = Vec::new();
    if let Ok(executable) = std::env::current_exe() {
        roots.extend(executable.ancestors().map(std::path::Path::to_path_buf));
    }
    if let Ok(current_dir) = std::env::current_dir() {
        roots.extend(current_dir.ancestors().map(std::path::Path::to_path_buf));
    }
    for root in roots {
        for candidate in [
            root.join("ReferenceCode")
                .join("DshanPI_USBToolboxDriver-fixed"),
            root.join("drivers").join("dshanpi"),
        ] {
            if candidate.join(script_name).is_file() {
                return Ok(candidate);
            }
        }
    }

    Err("The DshanPI driver package could not be located".into())
}

#[cfg(windows)]
fn get_status() -> Result<DriverStatus, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let system_root = std::env::var_os("SystemRoot")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows"));
    let pnputil = system_root.join(r"System32\pnputil.exe");
    let output = Command::new(&pnputil)
        .arg("/enum-drivers")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Unable to query Windows driver packages: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "PnPUtil driver query failed with exit code {}",
            output.status.code().unwrap_or(1)
        ));
    }

    let packages = parse_driver_packages(&decode_console_output(&output.stdout));
    let serial_driver_installed = packages
        .iter()
        .any(|package| package.original_name.eq_ignore_ascii_case("ch343ser.inf"));
    let interface_driver_installed = packages
        .iter()
        .any(|package| package.original_name.eq_ignore_ascii_case("ch341wdm.inf"));
    let mut published_names = packages
        .into_iter()
        .map(|package| package.published_name)
        .collect::<Vec<_>>();
    published_names.sort();
    published_names.dedup();

    let helper_path = std::env::var_os("ProgramData")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from(r"C:\ProgramData"))
        .join("DshanPI")
        .join("USBToolBox")
        .join("Set-DshanPI-FriendlyNames.exe");

    Ok(DriverStatus {
        supported: true,
        installed: serial_driver_installed && interface_driver_installed,
        serial_driver_installed,
        interface_driver_installed,
        friendly_name_helper_installed: helper_path.is_file(),
        published_names,
    })
}

#[cfg(not(windows))]
fn get_status() -> Result<DriverStatus, String> {
    Ok(DriverStatus {
        supported: false,
        installed: false,
        serial_driver_installed: false,
        interface_driver_installed: false,
        friendly_name_helper_installed: false,
        published_names: Vec::new(),
    })
}

#[cfg(windows)]
#[derive(Debug)]
struct InstalledDriverPackage {
    published_name: String,
    original_name: String,
}

#[cfg(windows)]
fn parse_driver_packages(output: &str) -> Vec<InstalledDriverPackage> {
    let normalized = output.replace("\r\n", "\n");
    normalized
        .split("\n\n")
        .filter_map(|block| {
            let lower = block.to_ascii_lowercase();
            let original_name = if lower.contains("ch343ser.inf") {
                "ch343ser.inf"
            } else if lower.contains("ch341wdm.inf") {
                "ch341wdm.inf"
            } else {
                return None;
            };
            let published_name = block
                .split(|character: char| !character.is_ascii_alphanumeric() && character != '.')
                .find(|token| {
                    let token = token.to_ascii_lowercase();
                    token.starts_with("oem")
                        && token.ends_with(".inf")
                        && token[3..token.len() - 4]
                            .chars()
                            .all(|character| character.is_ascii_digit())
                })?
                .to_ascii_lowercase();
            Some(InstalledDriverPackage {
                published_name,
                original_name: original_name.into(),
            })
        })
        .collect()
}

#[cfg(windows)]
fn decode_console_output(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xff, 0xfe]) {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::parse_driver_packages;

    #[test]
    fn parses_only_the_two_dshanpi_driver_packages() {
        let output = "Published Name: oem12.inf\r\nOriginal Name: ch343ser.inf\r\n\r\nPublished Name: oem7.inf\r\nOriginal Name: unrelated.inf\r\n\r\nPublished Name: oem15.inf\r\nOriginal Name: CH341WDM.INF\r\n";
        let packages = parse_driver_packages(output);
        assert_eq!(packages.len(), 2);
        assert_eq!(packages[0].published_name, "oem12.inf");
        assert_eq!(packages[1].published_name, "oem15.inf");
    }
}
