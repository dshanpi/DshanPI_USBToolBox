use crate::packer::tools::{merge_emmc_ufs_firmware, merge_spinor_firmware};
use crate::packer::types::{
    EmmcUfsMergeConfig, EmmcUfsMergeResult, SpinorMergeConfig, SpinorMergeResult,
};
use tauri::{command, AppHandle, Runtime};

#[command]
pub fn spinor_merge_firmware(config: SpinorMergeConfig) -> Result<SpinorMergeResult, String> {
    merge_spinor_firmware(config)
}

#[command]
pub async fn emmc_ufs_merge_firmware<R: Runtime>(
    app_handle: AppHandle<R>,
    config: EmmcUfsMergeConfig,
) -> Result<EmmcUfsMergeResult, String> {
    let handle = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || merge_emmc_ufs_firmware(&handle, config))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}
