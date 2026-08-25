//! Reading and writing `.dawproj` project packages.
//!
//! The on-disk layout is identical to the macOS 1.0 build so a project saved by
//! either version opens in the other:
//!
//! ```text
//! MySong.dawproj/
//!   project.json
//!   Audio Files/
//!   Plugin States/
//! ```

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

const PROJECT_FILE: &str = "project.json";
const AUDIO_DIR: &str = "Audio Files";
const PLUGIN_DIR: &str = "Plugin States";
const PACKAGE_EXT: &str = "dawproj";
const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPackage {
    /// Raw contents of `project.json`, parsed by the frontend.
    pub project_json: String,
    /// Absolute path of the package directory.
    pub package_path: String,
}

/// Force the `.dawproj` extension, so "Save As" with a bare name still produces
/// a package rather than a plain directory.
fn normalize_package_path(path: &str) -> PathBuf {
    let p = PathBuf::from(path);
    match p.extension() {
        Some(ext) if ext.eq_ignore_ascii_case(PACKAGE_EXT) => p,
        _ => p.with_extension(PACKAGE_EXT),
    }
}

fn to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[tauri::command]
pub fn read_project_package(path: String) -> Result<ProjectPackage, String> {
    let candidate = PathBuf::from(&path);

    // Accept either the package directory or a bare project.json.
    let (package_path, project_file) = if candidate.is_dir() {
        (candidate.clone(), candidate.join(PROJECT_FILE))
    } else {
        let parent = candidate
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        (parent, candidate.clone())
    };

    if !project_file.is_file() {
        return Err(format!("No project file at {}", to_string(&project_file)));
    }

    let project_json =
        fs::read_to_string(&project_file).map_err(|e| format!("Failed to read project: {e}"))?;

    Ok(ProjectPackage {
        project_json,
        package_path: to_string(&package_path),
    })
}

#[tauri::command]
pub fn write_project_package(path: String, project_json: String) -> Result<String, String> {
    let package_path = normalize_package_path(&path);

    fs::create_dir_all(package_path.join(AUDIO_DIR))
        .map_err(|e| format!("Failed to create audio folder: {e}"))?;
    fs::create_dir_all(package_path.join(PLUGIN_DIR))
        .map_err(|e| format!("Failed to create plugin folder: {e}"))?;

    fs::write(package_path.join(PROJECT_FILE), project_json)
        .map_err(|e| format!("Failed to write project: {e}"))?;

    Ok(to_string(&package_path))
}

/// Copy an external audio file into the package, named by its file id so the
/// manifest stays stable even if the original is renamed or moved.
#[tauri::command]
pub fn import_audio_into_package(
    package_path: String,
    source_path: String,
    file_id: String,
) -> Result<String, String> {
    let source = PathBuf::from(&source_path);
    let extension = source
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_else(|| "wav".to_string());

    let audio_dir = PathBuf::from(&package_path).join(AUDIO_DIR);
    fs::create_dir_all(&audio_dir).map_err(|e| format!("Failed to create audio folder: {e}"))?;

    let file_name = format!("{file_id}.{extension}");
    fs::copy(&source, audio_dir.join(&file_name))
        .map_err(|e| format!("Failed to copy audio file: {e}"))?;

    Ok(format!("{AUDIO_DIR}/{file_name}"))
}

/// Write raw bytes (a recording or AI-generated clip) into the package.
#[tauri::command]
pub fn write_audio_into_package(
    package_path: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let audio_dir = PathBuf::from(&package_path).join(AUDIO_DIR);
    fs::create_dir_all(&audio_dir).map_err(|e| format!("Failed to create audio folder: {e}"))?;

    fs::write(audio_dir.join(&file_name), bytes)
        .map_err(|e| format!("Failed to write audio file: {e}"))?;

    Ok(format!("{AUDIO_DIR}/{file_name}"))
}

fn sanitize_relative(path: &str) -> Result<PathBuf, String> {
    let normalized = path.replace('\\', "/");
    let candidate = PathBuf::from(&normalized);
    if candidate.is_absolute()
        || candidate
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err(format!("Invalid relative path: {path}"));
    }
    Ok(candidate)
}

/// Write one file inside a Pro Tools-style session folder (Audio Files, MIDI Files, …).
#[tauri::command]
pub fn write_session_file(folder: String, relative_path: String, bytes: Vec<u8>) -> Result<String, String> {
    let root = PathBuf::from(&folder);
    let relative = sanitize_relative(&relative_path)?;
    let dest = root.join(&relative);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create folder: {e}"))?;
    }
    fs::write(&dest, bytes).map_err(|e| format!("Failed to write {}: {e}", relative.display()))?;
    Ok(to_string(&dest))
}

#[tauri::command]
pub fn read_audio_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Failed to read {path}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("qamuz-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn adds_the_package_extension_when_missing() {
        assert_eq!(normalize_package_path("Song").extension().unwrap(), "dawproj");
        assert_eq!(
            normalize_package_path("Song.dawproj"),
            PathBuf::from("Song.dawproj")
        );
        // An existing extension is replaced, not appended twice.
        assert_eq!(
            normalize_package_path("Song.DAWPROJ"),
            PathBuf::from("Song.DAWPROJ")
        );
    }

    #[test]
    fn writes_then_reads_a_package() {
        let root = temp_dir("round-trip");
        let path = to_string(&root.join("Demo"));

        let written = write_project_package(path, "{\"version\":1}".into()).unwrap();
        assert!(PathBuf::from(&written).join(AUDIO_DIR).is_dir());
        assert!(PathBuf::from(&written).join(PLUGIN_DIR).is_dir());

        let package = read_project_package(written.clone()).unwrap();
        assert_eq!(package.project_json, "{\"version\":1}");
        assert_eq!(package.package_path, written);
    }

    #[test]
    fn reads_a_package_from_its_project_file() {
        let root = temp_dir("by-file");
        let written = write_project_package(to_string(&root.join("Demo")), "{}".into()).unwrap();

        let project_file = to_string(&PathBuf::from(&written).join(PROJECT_FILE));
        let package = read_project_package(project_file).unwrap();

        assert_eq!(package.package_path, written);
    }

    #[test]
    fn reports_a_missing_project_instead_of_panicking() {
        let root = temp_dir("missing");
        let error = read_project_package(to_string(&root)).unwrap_err();
        assert!(error.contains("No project file"));
    }

    #[test]
    fn imports_audio_under_its_file_id() {
        let root = temp_dir("audio");
        let package = write_project_package(to_string(&root.join("Demo")), "{}".into()).unwrap();

        let source = root.join("kick.wav");
        fs::write(&source, b"RIFF").unwrap();

        let relative =
            import_audio_into_package(package.clone(), to_string(&source), "ABC123".into()).unwrap();

        assert_eq!(relative, "Audio Files/ABC123.wav");
        assert_eq!(
            fs::read(PathBuf::from(&package).join(&relative)).unwrap(),
            b"RIFF"
        );
    }

    #[test]
    fn writes_raw_audio_bytes_into_a_package() {
        let root = temp_dir("bytes");
        let package = write_project_package(to_string(&root.join("Demo")), "{}".into()).unwrap();

        let relative =
            write_audio_into_package(package.clone(), "take.wav".into(), vec![1, 2, 3]).unwrap();

        assert_eq!(relative, "Audio Files/take.wav");
        assert_eq!(
            read_audio_file(to_string(&PathBuf::from(&package).join(&relative))).unwrap(),
            vec![1, 2, 3]
        );
    }

    #[test]
    fn writes_session_files_into_named_folders() {
        let root = temp_dir("session-pack");
        let folder = to_string(&root.join("Amor"));
        write_session_file(folder.clone(), "Audio Files/Bajo.wav".into(), vec![9, 8, 7]).unwrap();
        write_session_file(folder.clone(), "MIDI Files/Piano.mid".into(), vec![1]).unwrap();
        assert_eq!(
            fs::read(PathBuf::from(&folder).join("Audio Files").join("Bajo.wav")).unwrap(),
            vec![9, 8, 7]
        );
        assert!(write_session_file(folder, "../escape.wav".into(), vec![1]).is_err());
    }
}

#[tauri::command]
pub fn read_settings(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No config dir: {e}"))?;
    let file = dir.join(SETTINGS_FILE);

    if !file.is_file() {
        return Ok("{}".to_string());
    }

    fs::read_to_string(&file).map_err(|e| format!("Failed to read settings: {e}"))
}

#[tauri::command]
pub fn write_settings(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {e}"))?;

    fs::write(dir.join(SETTINGS_FILE), json).map_err(|e| format!("Failed to write settings: {e}"))
}
