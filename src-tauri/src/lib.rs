mod native_audio;
mod project_fs;

use serde::Serialize;

#[derive(Serialize)]
pub struct PlatformInfo {
    os: &'static str,
    arch: &'static str,
    version: &'static str,
}

#[tauri::command]
fn platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(native_audio::NativeAudioHost::new())
        .invoke_handler(tauri::generate_handler![
            platform_info,
            project_fs::read_project_package,
            project_fs::write_project_package,
            project_fs::import_audio_into_package,
            project_fs::write_audio_into_package,
            project_fs::write_session_file,
            project_fs::read_audio_file,
            project_fs::read_settings,
            project_fs::write_settings,
            native_audio::list_audio_devices,
            native_audio::native_audio_status,
            native_audio::start_native_output_stream,
            native_audio::stop_native_output_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
