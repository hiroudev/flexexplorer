//! Named layout/workspace files stored under %APPDATA%\FlexExplorer\workspaces.
//! The frontend serializes its view state to JSON; these commands persist it
//! to individual files so several layouts can be saved and switched between.
//!
//! One workspace is one `<name>.json` there, and nothing else refers to it:
//! a file copied in from another PC shows up in the list as it is. Such a
//! file is checked by the frontend (`inspectWorkspace` in bundle.ts) before
//! anything is opened from it.

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
    crate::fs::safe_stem(name, "workspace")
}

/// Largest workspace file read: one copied in from elsewhere is read when
/// the list is shown, before anyone chooses to open it.
const MAX_WS_BYTES: u64 = 4 * 1024 * 1024;

/// The file for `name`: one already in the folder under exactly that name
/// (a file copied in by hand may have a name `safe_name` would shorten, and
/// shortening it would reach another workspace's file), else the file a new
/// workspace of that name gets.
fn ws_file(name: &str) -> Result<PathBuf, String> {
    let dir = ws_dir()?;
    let exact = dir.join(format!("{name}.json"));
    if crate::fs::plain_stem(name) && exact.is_file() {
        return Ok(exact);
    }
    Ok(dir.join(format!("{}.json", safe_name(name))))
}

/// The folder, for the workspace screen to show and open in Explorer.
#[tauri::command]
pub fn workspace_dir() -> Result<String, String> {
    Ok(ws_dir()?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_workspace(name: String, content: String, exclusive: Option<bool>) -> Result<(), String> {
    let f = ws_file(&name)?;
    // An import adding a workspace must not replace one saved meanwhile by
    // another window. Commands run one at a time, so check-then-write holds.
    if exclusive == Some(true) && f.exists() {
        return Err(format!("EXISTS: ワークスペース「{name}」は既にあります"));
    }
    // Saving over an existing workspace used to truncate it first, so a full
    // disk or a crash mid-write lost the layout that was already there.
    crate::fs::write_replacing(&f, content.as_bytes(), valid)
}

fn valid(s: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(s).is_ok()
}

#[tauri::command]
pub fn list_workspaces() -> Result<Vec<String>, String> {
    let dir = ws_dir()?;
    let mut out = Vec::new();
    for e in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let p = e.path();
        // `.JSON` too: a file copied in by hand keeps whatever case it had.
        if p.is_file() && p.extension().and_then(|x| x.to_str()).is_some_and(|x| x.eq_ignore_ascii_case("json")) {
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
    let f = ws_file(&name)?;
    if std::fs::metadata(&f).is_ok_and(|m| m.len() > MAX_WS_BYTES) {
        return Err(format!("ファイルが大きすぎます（{} MB まで）", MAX_WS_BYTES / 1024 / 1024));
    }
    crate::fs::read_saved(&f, valid)?
        .ok_or_else(|| format!("ワークスペース「{name}」が見つかりません"))
}

#[tauri::command]
pub fn delete_workspace(name: String) -> Result<(), String> {
    let f = ws_file(&name)?;
    // Already gone is fine: undoing an import deletes what it added, and
    // another window may have deleted it first.
    match std::fs::remove_file(&f) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
        _ => {}
    }
    // Otherwise `load_workspace` would bring a deleted workspace back from it.
    let _ = std::fs::remove_file(f.with_extension("json.bak"));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::safe_name;

    // The same cases as `cleanWorkspaceName` in src/utils/bundle.test.mjs.
    #[test]
    fn names_are_one_plain_file() {
        assert_eq!(safe_name("仕事"), "仕事");
        assert_eq!(safe_name("a/b:c"), "abc");
        assert_eq!(safe_name("CON"), "_CON");
        assert_eq!(safe_name("nul.txt"), "_nul.txt");
        assert_eq!(safe_name("com1"), "_com1");
        assert_eq!(safe_name("CONOUT$"), "_CONOUT$");
        assert_eq!(safe_name("CONSOLE"), "CONSOLE");
        assert_eq!(safe_name("x. . "), "x");
        assert_eq!(safe_name(&"あ".repeat(300)), "あ".repeat(120));
        assert_eq!(safe_name("..."), "workspace");
        // A listed name that `safe_name` would change is still addressed as is.
        assert!(crate::fs::plain_stem("report."));
        assert!(crate::fs::plain_stem(&"x".repeat(200)));
        assert!(!crate::fs::plain_stem("CON"));
        assert!(!crate::fs::plain_stem("..\\x"));
        assert!(!crate::fs::plain_stem(".."));
        // The device check sees the name after cutting and trimming.
        assert_eq!(safe_name(&format!("CON{}x", " ".repeat(117))), "_CON");
        // ASCII case only, and U+FEFF is kept, as in TypeScript.
        assert_eq!(safe_name("CON\u{131}N$"), "CON\u{131}N$");
        assert_eq!(safe_name("\u{feff}a\u{3000}"), "\u{feff}a");
        // What the list returns opens the same file again.
        for n in ["CON", "a. ", &"x".repeat(200), &format!("CON{}x", " ".repeat(117)), &format!("aux{}", "y".repeat(130))] {
            assert_eq!(safe_name(&safe_name(n)), safe_name(n));
        }
    }
}
