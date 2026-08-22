// USBToolBox is a GUI application. Keep the Windows subsystem in debug builds
// too, otherwise launching a locally built executable opens a console window.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    usbtoolbox_app_lib::run()
}
