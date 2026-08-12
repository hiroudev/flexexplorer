//! Named layout/workspace files stored under %APPDATA%\FlexExplorer\workspaces.
//! The frontend serializes its view state to JSON; these commands persist it
//! to individual files so several layouts can be saved and switched between.

use std::path::PathBuf;

fn ws_dir() -> Result<PathBuf, String> {
    let base = if cfg!(windows) {
        std::env::var("APPDATA").map_err(|e| e.to_string())?
    } else {
        std::env::var("HOME").map_err(|e| e.to_string())?
    };
    let dir = PathBuf::from(base).join("FlexExplorer").join("workspaces");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn safe_name(name: &str) -> String {
    let cleaned: String = name.chars().filter(|c| !"\\/:*?\"<>|".contains(*c)).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() { "workspace".to_string() } else { trimmed.to_string() }
}

#[tauri::command]
pub fn save_workspace(name: String, content: String) -> Result<(), String> {
    let f = ws_dir()?.join(format!("{}.json", safe_name(&name)));
    std::fs::write(f, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_workspaces() -> Result<Vec<String>, String> {
    let dir = ws_dir()?;
    let mut out = Vec::new();
    for e in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) == Some("json") {
            if let Some(stem) = p.file_stem().and_then(|x| x.to_str()) {
                out.push(stem.to_string());
            }
        }
    }
    out.sort_by_key(|s| s.to_lowercase());
    Ok(out)
}

#[tauri::command]
pub fn load_workspace(name: String) -> Result<String, String> {
    let f = ws_dir()?.join(format!("{}.json", safe_name(&name)));
    std::fs::read_to_string(f).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_workspace(name: String) -> Result<(), String> {
    let f = ws_dir()?.join(format!("{}.json", safe_name(&name)));
    std::fs::remove_file(f).map_err(|e| e.to_string())
}
