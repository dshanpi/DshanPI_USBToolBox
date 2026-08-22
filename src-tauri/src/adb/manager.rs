use adb_client::server::{ADBServer, DeviceShort};
use adb_client::{ADBDeviceExt, ADBListItemType, RebootType};
use log::{debug, error, warn};
use std::net::{Ipv4Addr, SocketAddrV4};
use std::sync::Mutex;
use std::time::Duration;

use super::types::{
    AdbDevice, AdbDirectoryListing, AdbFileInfo, AdbServerStatus, AdbVersion as AppAdbVersion,
};

const S_IFDIR: u32 = 0o040000;
const SERVER_CHECK_TIMEOUT_SECS: u64 = 5;

pub struct AdbManager {
    server_addr: SocketAddrV4,
    selected_device: Mutex<Option<String>>,
}

impl Clone for AdbManager {
    fn clone(&self) -> Self {
        Self {
            server_addr: self.server_addr,
            selected_device: Mutex::new(None),
        }
    }
}

impl Default for AdbManager {
    fn default() -> Self {
        Self::new(5037)
    }
}

impl AdbManager {
    pub fn new(port: u16) -> Self {
        debug!("Creating AdbManager with port: {}", port);
        let addr = SocketAddrV4::new(Ipv4Addr::new(127, 0, 0, 1), port);
        Self {
            server_addr: addr,
            selected_device: Mutex::new(None),
        }
    }

    pub fn get_server(&self) -> ADBServer {
        ADBServer::new(self.server_addr)
    }

    pub fn get_server_addr(&self) -> SocketAddrV4 {
        self.server_addr
    }

    pub fn check_server_status_with_addr(addr: SocketAddrV4) -> AdbServerStatus {
        debug!("Checking server status at: {}", addr);
        let timeout = Duration::from_secs(SERVER_CHECK_TIMEOUT_SECS);

        let (tx, rx) = std::sync::mpsc::channel();

        std::thread::spawn(move || {
            let mut server = ADBServer::new(addr);
            let result = match server.version() {
                Ok(version) => {
                    debug!(
                        "ADB server version: {}.{}.{}",
                        version.major, version.minor, version.revision
                    );
                    Some(AdbServerStatus {
                        running: true,
                        version: Some(AppAdbVersion {
                            version: format!(
                                "{}.{}.{}",
                                version.major, version.minor, version.revision
                            ),
                            major: version.major,
                            minor: version.minor,
                            patch: version.revision,
                        }),
                        port: addr.port(),
                    })
                }
                Err(e) => {
                    warn!("Failed to get ADB server version: {}", e);
                    None
                }
            };
            let _ = tx.send(result);
        });

        match rx.recv_timeout(timeout) {
            Ok(Some(status)) => {
                debug!("Server status check completed: running={}", status.running);
                status
            }
            Ok(None) | Err(_) => {
                warn!("Server status check failed or timed out");
                AdbServerStatus {
                    running: false,
                    version: None,
                    port: addr.port(),
                }
            }
        }
    }

    pub fn list_devices(&self) -> Result<Vec<AdbDevice>, String> {
        debug!("Listing ADB devices");
        let mut server = self.get_server();

        match server.devices() {
            Ok(devices) => {
                let adb_devices: Vec<AdbDevice> = devices
                    .into_iter()
                    .map(|d| self.device_short_to_adb_device(d))
                    .collect();
                debug!("Found {} devices", adb_devices.len());
                Ok(adb_devices)
            }
            Err(e) => {
                error!("Failed to list devices: {}", e);
                Err(format!("Failed to list devices: {}", e))
            }
        }
    }

    fn device_short_to_adb_device(&self, device: DeviceShort) -> AdbDevice {
        debug!(
            "Converting device: serial={}, state={}",
            device.identifier, device.state
        );
        AdbDevice {
            serial: device.identifier,
            state: device.state.to_string(),
            model: None,
            product: None,
            device: None,
            transport_id: None,
        }
    }

    pub fn select_device(&self, serial: String) {
        debug!("Selecting device: {}", serial);
        let mut selected = self.selected_device.lock().unwrap();
        *selected = Some(serial);
    }

    pub fn get_selected_device(&self) -> Option<String> {
        let selected = self.selected_device.lock().unwrap();
        selected.clone()
    }

    pub fn clear_selected_device(&self) {
        debug!("Clearing selected device");
        let mut selected = self.selected_device.lock().unwrap();
        *selected = None;
    }

    pub fn shell_command(&self, serial: Option<&str>, command: &str) -> Result<String, String> {
        debug!(
            "Executing shell command: serial={:?}, cmd={}",
            serial, command
        );
        let mut server = self.get_server();

        let mut device = if let Some(s) = serial {
            server.get_device_by_name(s).map_err(|e| {
                error!("Device not found: {}", e);
                format!("Device not found: {}", e)
            })?
        } else {
            let selected = self.get_selected_device();
            if let Some(s) = selected {
                server.get_device_by_name(&s).map_err(|e| {
                    error!("Device not found: {}", e);
                    format!("Device not found: {}", e)
                })?
            } else {
                server.get_device().map_err(|e| {
                    error!("No device available: {}", e);
                    format!("No device available: {}", e)
                })?
            }
        };

        let mut buf: Vec<u8> = Vec::new();

        device
            .shell_command(&command, Some(&mut buf), None)
            .map_err(|e| {
                error!("Shell command failed: {}", e);
                format!("Shell command failed: {}", e)
            })?;

        let output = String::from_utf8_lossy(&buf);
        debug!("Shell command output length: {} bytes", output.len());
        Ok(output.to_string())
    }

    pub fn list_directory(
        &self,
        serial: Option<&str>,
        path: &str,
    ) -> Result<AdbDirectoryListing, String> {
        debug!("Listing directory: serial={:?}, path={}", serial, path);
        let mut server = self.get_server();

        let mut device = if let Some(s) = serial {
            server.get_device_by_name(s).map_err(|e| {
                error!("Device not found: {}", e);
                format!("Device not found: {}", e)
            })?
        } else {
            let selected = self.get_selected_device();
            if let Some(s) = selected {
                server.get_device_by_name(&s).map_err(|e| {
                    error!("Device not found: {}", e);
                    format!("Device not found: {}", e)
                })?
            } else {
                server.get_device().map_err(|e| {
                    error!("No device available: {}", e);
                    format!("No device available: {}", e)
                })?
            }
        };

        let items = device.list(path).map_err(|e| {
            error!("Failed to list directory: {}", e);
            format!("Failed to list directory: {}", e)
        })?;

        let file_items: Vec<AdbFileInfo> = items
            .into_iter()
            .filter(|item| {
                let name = match item {
                    ADBListItemType::Fifo(i) => &i.name,
                    ADBListItemType::CharacterDevice(i) => &i.name,
                    ADBListItemType::Directory(i) => &i.name,
                    ADBListItemType::BlockDevice(i) => &i.name,
                    ADBListItemType::File(i) => &i.name,
                    ADBListItemType::Symlink(i) => &i.name,
                    ADBListItemType::Socket(i) => &i.name,
                    ADBListItemType::Other(i) => &i.name,
                };
                name != "." && name != ".."
            })
            .map(|item| self.list_item_type_to_file_info(&item, path))
            .collect();

        debug!("Found {} items in directory", file_items.len());

        Ok(AdbDirectoryListing {
            path: path.to_string(),
            items: file_items,
        })
    }

    fn list_item_type_to_file_info(
        &self,
        item_type: &ADBListItemType,
        base_path: &str,
    ) -> AdbFileInfo {
        let (name, size, time, permissions, is_directory) = match item_type {
            ADBListItemType::Fifo(item) => {
                (&item.name, item.size, item.time, item.permissions, false)
            }
            ADBListItemType::CharacterDevice(item) => {
                (&item.name, item.size, item.time, item.permissions, false)
            }
            ADBListItemType::Directory(item) => {
                (&item.name, item.size, item.time, item.permissions, true)
            }
            ADBListItemType::BlockDevice(item) => {
                (&item.name, item.size, item.time, item.permissions, false)
            }
            ADBListItemType::File(item) => {
                (&item.name, item.size, item.time, item.permissions, false)
            }
            ADBListItemType::Symlink(item) => {
                (&item.name, item.size, item.time, item.permissions, false)
            }
            ADBListItemType::Socket(item) => {
                (&item.name, item.size, item.time, item.permissions, false)
            }
            ADBListItemType::Other(item) => {
                (&item.name, item.size, item.time, item.permissions, false)
            }
        };

        let full_path = if base_path.ends_with('/') {
            format!("{}{}", base_path, name)
        } else if base_path.is_empty() {
            format!("/{}", name)
        } else {
            format!("{}/{}", base_path, name)
        };

        AdbFileInfo {
            name: name.clone(),
            path: full_path,
            size: size as u64,
            is_directory,
            modified_time: Some(time as u64),
            permissions: Some(format!("{:o}", permissions)),
        }
    }

    pub fn push_file(
        &self,
        serial: Option<&str>,
        local_path: &str,
        remote_path: &str,
    ) -> Result<(), String> {
        debug!(
            "Pushing file: serial={:?}, local={}, remote={}",
            serial, local_path, remote_path
        );
        let mut server = self.get_server();

        let mut device = if let Some(s) = serial {
            server.get_device_by_name(s).map_err(|e| {
                error!("Device not found: {}", e);
                format!("Device not found: {}", e)
            })?
        } else {
            let selected = self.get_selected_device();
            if let Some(s) = selected {
                server.get_device_by_name(&s).map_err(|e| {
                    error!("Device not found: {}", e);
                    format!("Device not found: {}", e)
                })?
            } else {
                server.get_device().map_err(|e| {
                    error!("No device available: {}", e);
                    format!("No device available: {}", e)
                })?
            }
        };

        let mut file = std::fs::File::open(local_path).map_err(|e| {
            error!("Cannot open local file: {}", e);
            format!("Cannot open local file: {}", e)
        })?;

        device.push(&mut file, remote_path).map_err(|e| {
            error!("Push failed: {}", e);
            format!("Push failed: {}", e)
        })?;

        debug!("Push completed successfully");
        Ok(())
    }

    pub fn pull_file(
        &self,
        serial: Option<&str>,
        remote_path: &str,
        local_path: &str,
    ) -> Result<(), String> {
        debug!(
            "Pulling file: serial={:?}, remote={}, local={}",
            serial, remote_path, local_path
        );
        let mut server = self.get_server();

        let mut device = if let Some(s) = serial {
            server.get_device_by_name(s).map_err(|e| {
                error!("Device not found: {}", e);
                format!("Device not found: {}", e)
            })?
        } else {
            let selected = self.get_selected_device();
            if let Some(s) = selected {
                server.get_device_by_name(&s).map_err(|e| {
                    error!("Device not found: {}", e);
                    format!("Device not found: {}", e)
                })?
            } else {
                server.get_device().map_err(|e| {
                    error!("No device available: {}", e);
                    format!("No device available: {}", e)
                })?
            }
        };

        let mut file = std::fs::File::create(local_path).map_err(|e| {
            error!("Cannot create local file: {}", e);
            format!("Cannot create local file: {}", e)
        })?;

        device.pull(&remote_path, &mut file).map_err(|e| {
            error!("Pull failed: {}", e);
            format!("Pull failed: {}", e)
        })?;

        debug!("Pull completed successfully");
        Ok(())
    }

    pub fn pull_folder(
        &self,
        serial: Option<&str>,
        remote_path: &str,
        local_path: &str,
    ) -> Result<(), String> {
        debug!(
            "Pulling folder: serial={:?}, remote={}, local={}",
            serial, remote_path, local_path
        );

        std::fs::create_dir_all(local_path).map_err(|e| {
            error!("Cannot create local directory: {}", e);
            format!("Cannot create local directory: {}", e)
        })?;

        let listing = self.list_directory(serial, remote_path)?;

        for item in &listing.items {
            let local_item_path = if local_path.ends_with(std::path::MAIN_SEPARATOR) {
                format!("{}{}", local_path, item.name)
            } else {
                format!("{}{}{}", local_path, std::path::MAIN_SEPARATOR, item.name)
            };

            if item.is_directory {
                debug!("Recursively pulling subdirectory: {}", item.path);
                self.pull_folder(serial, &item.path, &local_item_path)?;
            } else {
                debug!("Pulling file: {}", item.path);
                self.pull_file(serial, &item.path, &local_item_path)?;
            }
        }

        debug!("Pull folder completed successfully");
        Ok(())
    }

    pub fn delete_file(&self, serial: Option<&str>, path: &str) -> Result<String, String> {
        debug!("Deleting file: serial={:?}, path={}", serial, path);
        let escaped_path = path.replace("'", "'\\''");
        let cmd = if path.ends_with('/') {
            format!("rm -rf '{}'", escaped_path.trim_end_matches('/'))
        } else {
            format!("rm -rf '{}'", escaped_path)
        };
        let result = self.shell_command(serial, &cmd)?;
        debug!("Delete completed");
        Ok(result)
    }

    pub fn make_directory(&self, serial: Option<&str>, path: &str) -> Result<String, String> {
        debug!("Making directory: serial={:?}, path={}", serial, path);
        let escaped_path = path.replace("'", "'\\''");
        let cmd = format!("mkdir -p '{}'", escaped_path);
        self.shell_command(serial, &cmd)
    }

    pub fn rename(
        &self,
        serial: Option<&str>,
        old_path: &str,
        new_path: &str,
    ) -> Result<String, String> {
        debug!(
            "Renaming: serial={:?}, old={}, new={}",
            serial, old_path, new_path
        );
        let escaped_old = old_path.replace("'", "'\\''");
        let escaped_new = new_path.replace("'", "'\\''");
        let cmd = format!("mv '{}' '{}'", escaped_old, escaped_new);
        self.shell_command(serial, &cmd)
    }

    pub fn stat(&self, serial: Option<&str>, path: &str) -> Result<AdbFileInfo, String> {
        debug!("Stat: serial={:?}, path={}", serial, path);
        let mut server = self.get_server();

        let mut device = if let Some(s) = serial {
            server.get_device_by_name(s).map_err(|e| {
                error!("Device not found: {}", e);
                format!("Device not found: {}", e)
            })?
        } else {
            let selected = self.get_selected_device();
            if let Some(s) = selected {
                server.get_device_by_name(&s).map_err(|e| {
                    error!("Device not found: {}", e);
                    format!("Device not found: {}", e)
                })?
            } else {
                server.get_device().map_err(|e| {
                    error!("No device available: {}", e);
                    format!("No device available: {}", e)
                })?
            }
        };

        let stat_response = device.stat(path).map_err(|e| {
            error!("Stat failed: {}", e);
            format!("Stat failed: {}", e)
        })?;

        let name = path.rsplit('/').next().unwrap_or(path).to_string();
        let is_directory = (stat_response.file_perm & S_IFDIR) != 0;

        debug!(
            "Stat result: name={}, size={}, is_dir={}",
            name, stat_response.file_size, is_directory
        );

        Ok(AdbFileInfo {
            name,
            path: path.to_string(),
            size: stat_response.file_size as u64,
            is_directory,
            modified_time: Some(stat_response.mod_time as u64),
            permissions: Some(format!("{:o}", stat_response.file_perm)),
        })
    }

    pub fn reboot(&self, serial: Option<&str>, reboot_type: &str) -> Result<(), String> {
        debug!(
            "Rebooting device: serial={:?}, type={}",
            serial, reboot_type
        );
        let mut server = self.get_server();

        let mut device = if let Some(s) = serial {
            server.get_device_by_name(s).map_err(|e| {
                error!("Device not found: {}", e);
                format!("Device not found: {}", e)
            })?
        } else {
            let selected = self.get_selected_device();
            if let Some(s) = selected {
                server.get_device_by_name(&s).map_err(|e| {
                    error!("Device not found: {}", e);
                    format!("Device not found: {}", e)
                })?
            } else {
                server.get_device().map_err(|e| {
                    error!("No device available: {}", e);
                    format!("No device available: {}", e)
                })?
            }
        };

        let reboot_type = match reboot_type {
            "recovery" => RebootType::Recovery,
            "bootloader" => RebootType::Bootloader,
            "sideload" => RebootType::Sideload,
            "sideload-auto-reboot" => RebootType::SideloadAutoReboot,
            _ => RebootType::Recovery,
        };

        device.reboot(reboot_type).map_err(|e| {
            error!("Reboot failed: {}", e);
            format!("Reboot failed: {}", e)
        })?;

        debug!("Reboot command sent successfully");
        Ok(())
    }

    pub fn root(&self, serial: Option<&str>) -> Result<String, String> {
        debug!("Restarting adbd as root: serial={:?}", serial);
        self.shell_command(serial, "root")
    }
}
