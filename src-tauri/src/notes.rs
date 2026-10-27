//! Per-folder private sticky notes ("付箋メモ").
//!
//! Notes live in a single JSON map at %APPDATA%\FlexExplorer\notes.json keyed by
//! the folder path, rather than as a file inside the folder itself: the folder
//! may be read-only, shared with other people, or synced to a cloud drive, and
//! these memos are meant to be visible only to the person using this machine.
//!
//! Keys arrive already normalized from the frontend (`noteKey()` in
//! `src/fs/bridge.ts`) so lookup and storage can never disagree about case or
//! trailing separators.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct FolderNote {
    /// Memo body (plain text).
    #[serde(default)]
    pub text: String,
    /// Panel height in pixels, as the user last dragged it.
    #[serde(default = "def_h")]
    pub h: u32,
    /// Collapsed to a single title strip.
    #[serde(default)]
    pub collapsed: bool,
    /// Last edit time, "YYYY/MM/DD HH:mm".
    #[serde(default)]
    pub updated: String,
}

fn def_h() -> u32 {
    140
}

type NoteMap = BTreeMap<String, FolderNote>;

fn notes_file() -> Result<PathBuf, String> {
    let base = if cfg!(windows) {
        std::env::var("APPDATA").map_err(|e| e.to_string())?
    } else {
        std::env::var("HOME").map_err(|e| e.to_string())?
    };
    let dir = PathBuf::from(base).join("FlexExplorer");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("notes.json"))
}

fn read_all() -> Result<NoteMap, String> {
    let f = notes_file()?;
    // Only a missing file means "no notes". One that is locked or unreadable
    // used to count as empty too, and the next edit then saved a map holding
    // just that one note over all the others.
    match crate::fs::read_saved(&f, valid)? {
        Some(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        None => Ok(NoteMap::new()),
    }
}

fn write_all(map: &NoteMap) -> Result<(), String> {
    let f = notes_file()?;
    let json = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    crate::fs::write_replacing(&f, json.as_bytes(), valid)
}

fn valid(s: &str) -> bool {
    serde_json::from_str::<NoteMap>(s).is_ok()
}

/// Whole note map, loaded once at startup.
#[tauri::command]
pub fn notes_load() -> Result<NoteMap, String> {
    read_all()
}

/// Insert or replace the note for `key`.
#[tauri::command]
pub fn notes_set(key: String, note: FolderNote) -> Result<(), String> {
    let mut map = read_all()?;
    map.insert(key, note);
    write_all(&map)
}

/// Remove the note for `key` (no-op when it doesn't exist).
#[tauri::command]
pub fn notes_delete(key: String) -> Result<(), String> {
    let mut map = read_all()?;
    if map.remove(&key).is_some() {
        write_all(&map)?;
    }
    Ok(())
}
