//! Settings/workspace export files (オプション > バックアップ).
//!
//! Exports go to the user's Downloads folder and are then shown in Explorer,
//! so there is no save dialog (that would need tauri-plugin-dialog) and the
//! file is never somewhere the user can't find. Before an import replaces
//! anything, the current state is written to %APPDATA%\FlexExplorer\backups.

use std::path::PathBuf;

/// The only kinds of file these commands write. A plain `.json` is one
/// workspace, ready to drop into another PC's workspaces folder.
const EXTS: [&str; 3] = [".flexexplorer.json", ".flextheme.json", ".json"];
/// Automatic pre-import backups kept; older ones are removed.
const KEEP_BACKUPS: usize = 5;

fn valid(s: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(s).is_ok()
}

/// A name the frontend built ("FlexExplorer_設定_20261029-1000"), cut down to
/// what can safely be one file name.
fn clean_stem(stem: &str) -> String {
    crate::fs::safe_stem(stem, "FlexExplorer")
}

#[cfg(windows)]
fn downloads_dir() -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Downloads, SHGetKnownFolderPath, KF_FLAG_DEFAULT};
    // The Downloads folder can be moved (to D:\ or OneDrive), so its real
    // location comes from the shell rather than %USERPROFILE%\Downloads.
    unsafe {
        let p = SHGetKnownFolderPath(&FOLDERID_Downloads, KF_FLAG_DEFAULT, None).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as _));
        s.map(PathBuf::from)
    }
}

#[cfg(not(windows))]
fn downloads_dir() -> Option<PathBuf> {
    None
}

fn downloads() -> Result<PathBuf, String> {
    let dir = downloads_dir()
        .or_else(|| std::env::var("USERPROFILE").ok().map(|h| PathBuf::from(h).join("Downloads")))
        .ok_or("「ダウンロード」フォルダが見つかりません")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{} を作れません: {e}", dir.display()))?;
    Ok(dir)
}

/// Writes `content` to `<Downloads>\<stem><ext>` (or `<stem> (2)<ext>` …,
/// never over an existing file) and returns the path written.
#[tauri::command]
pub fn export_file(stem: String, ext: String, content: String) -> Result<String, String> {
    if !EXTS.contains(&ext.as_str()) {
        return Err(format!("書き出せない種類です: {ext}"));
    }
    if !valid(&content) {
        return Err("書き出す中身が JSON ではありません".into());
    }
    write_numbered(&downloads()?, &stem, &ext, &content)
}

/// Writes each `(stem, content)` as `<stem>.json` into a new folder
/// `<Downloads>\<folder>` (or `<folder> (2)` …) and returns the folder: every
/// workspace at once, each file ready to drop into another PC's workspaces
/// folder or to pick with 読み込む….
#[tauri::command]
pub fn export_folder(folder: String, files: Vec<(String, String)>) -> Result<String, String> {
    if let Some((stem, _)) = files.iter().find(|(_, c)| !valid(c)) {
        return Err(format!("「{stem}」の中身が JSON ではありません"));
    }
    let base = downloads()?;
    let folder = clean_stem(&folder);
    let mut dir = None;
    for n in 1..100 {
        let d = base.join(if n == 1 { folder.clone() } else { format!("{folder} ({n})") });
        // create_dir, not create_dir_all: a folder already there is never written into.
        match std::fs::create_dir(&d) {
            Ok(()) => { dir = Some(d); break }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("{} を作れません: {e}", d.display())),
        }
    }
    let dir = dir.ok_or("同じ名前のフォルダが多すぎて保存できません")?;
    for (stem, content) in &files {
        write_numbered(&dir, stem, ".json", content)?;
    }
    Ok(dir.to_string_lossy().to_string())
}

/// `<dir>\<stem><ext>`, or `<stem> (2)<ext>` … when that is taken.
fn write_numbered(dir: &std::path::Path, stem: &str, ext: &str, content: &str) -> Result<String, String> {
    let stem = clean_stem(stem);
    for n in 1..100 {
        let name = if n == 1 { format!("{stem}{ext}") } else { format!("{stem} ({n}){ext}") };
        let f = dir.join(name);
        // create_new, not exists() then write: a file that appears in
        // between (a second export, a browser download) is never replaced.
        match write_new(&f, content.as_bytes()) {
            Ok(()) => return Ok(f.to_string_lossy().to_string()),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("{} に保存できません: {e}", f.display())),
        }
    }
    Err("同じ名前のファイルが多すぎて保存できません".into())
}

fn write_new(f: &std::path::Path, data: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(f)?;
    let r = file.write_all(data).and_then(|_| file.sync_all());
    if r.is_err() {
        drop(file);
        let _ = std::fs::remove_file(f);
    }
    r
}

fn backups_dir() -> Result<PathBuf, String> {
    let base = if cfg!(windows) { std::env::var("APPDATA") } else { std::env::var("HOME") }.map_err(|e| e.to_string())?;
    let dir = PathBuf::from(base).join("FlexExplorer").join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Saves the state as it was just before an import, keeping the newest
/// `KEEP_BACKUPS`. Returns the path written.
#[tauri::command]
pub fn write_backup(content: String) -> Result<String, String> {
    let dir = backups_dir()?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S%3f");
    let f = dir.join(format!("before-import-{stamp}.flexexplorer.json"));
    crate::fs::write_replacing(&f, content.as_bytes(), valid)?;
    // Oldest first by when they were written, not by name: the local-time
    // stamp in the name goes backwards when the clock or the time zone does.
    // The one just written always stays; anything else in the folder is
    // left alone.
    let mut olds: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|e| {
            let n = e.file_name();
            let n = n.to_str().unwrap_or("");
            n.starts_with("before-import-") && n.ends_with(".flexexplorer.json")
        })
        .map(|e| (e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), e.path()))
        .filter(|(_, p)| p != &f)
        .collect();
    olds.sort();
    let extra = olds.len().saturating_sub(KEEP_BACKUPS - 1);
    for (_, p) in &olds[..extra] {
        let _ = std::fs::remove_file(p);
    }
    Ok(f.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::clean_stem;

    #[test]
    fn stems_are_one_plain_name() {
        assert_eq!(clean_stem("FlexExplorer_設定_20261029-1000"), "FlexExplorer_設定_20261029-1000");
        assert_eq!(clean_stem("..\\..\\a/b:c"), "....abc");
        assert_eq!(clean_stem("  x.  "), "x");
        assert_eq!(clean_stem("\u{0}"), "FlexExplorer");
        assert_eq!(clean_stem("PRN"), "_PRN");
        assert_eq!(clean_stem("aux.flexexplorer"), "_aux.flexexplorer");
    }
}
