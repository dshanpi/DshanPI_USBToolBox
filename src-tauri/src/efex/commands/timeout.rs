use super::service;

#[tauri::command]
pub fn efex_set_fel_timeout(timeout_secs: u64) {
    service::set_fel_timeout(timeout_secs);
}

#[tauri::command]
pub fn efex_set_fes_timeout(timeout_secs: u64) {
    service::set_fes_timeout(timeout_secs);
}
