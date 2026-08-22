use std::{env, fs, path::PathBuf};

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        stage_libusb_runtime();
    }

    tauri_build::build()
}

fn stage_libusb_runtime() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"));
    let profile_dir = out_dir
        .ancestors()
        .nth(3)
        .expect("failed to locate the Cargo profile directory");
    let source = profile_dir.join("libusb-1.0.dll");

    if !source.is_file() {
        panic!(
            "libefex-sys did not produce the required runtime DLL at {}",
            source.display()
        );
    }

    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is not set"));
    let resource_dir = manifest_dir.join("target").join("tauri-resources");
    fs::create_dir_all(&resource_dir).expect("failed to create the Tauri resource directory");
    fs::copy(&source, resource_dir.join("libusb-1.0.dll"))
        .expect("failed to stage libusb-1.0.dll for Tauri bundling");
}
