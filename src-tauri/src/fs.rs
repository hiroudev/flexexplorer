//! Filesystem commands exposed to the FlexExplorer frontend.
//!
//! The DTOs here mirror the `FileEntry` shape used by the React/Zustand store
//! (`src/types.ts`) so the frontend bridge can map them with minimal glue.

use chrono::{DateTime, Local};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// One entry inside a directory listing.
#[derive(Serialize)]
pub struct DirEntryDto {
    pub name: String,
    pub folder: bool,
    /// Lowercased extension without the dot (empty for folders / no ext).
    pub ext: String,
    /// Size in bytes (0 for folders).
    pub size: u64,
    /// Modified time formatted as "YYYY/MM/DD HH:mm".
    pub m: String,
    /// Created time formatted as "YYYY/MM/DD HH:mm".
    pub c: String,
    /// Whether the OS marks the entry hidden (dotfile or hidden attribute).
    pub hidden: bool,
}

/// A logical drive / volume root.
#[derive(Serialize)]
pub struct DriveDto {
    /// Display letter, e.g. "C:".
    pub letter: String,
    /// Absolute root path, e.g. "C:\\".
    pub path: String,
    /// Volume label (may be empty).
    pub name: String,
    /// Total capacity in bytes.
    pub total: u64,
    /// Free space in bytes.
    pub free: u64,
}

/// A global-search hit.
#[derive(Serialize)]
pub struct SearchHit {
    pub name: String,
    /// Absolute path to the entry.
    pub abs: String,
    pub folder: bool,
    pub ext: String,
    pub size: u64,
    pub m: String,
}

fn fmt_time(t: std::io::Result<SystemTime>) -> String {
    match t {
        Ok(st) => {
            let dt: DateTime<Local> = st.into();
            dt.format("%Y/%m/%d %H:%M").to_string()
        }
        Err(_) => String::new(),
    }
}

fn is_hidden(path: &Path, name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
        if let Ok(md) = std::fs::metadata(path) {
            let a = md.file_attributes();
            return a & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM) != 0;
        }
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
    false
}

/// List the contents of a directory.
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntryDto>, String> {
    let dir = PathBuf::from(&path);
    let read = std::fs::read_dir(&dir).map_err(|e| format!("{path}: {e}"))?;

    let mut out: Vec<DirEntryDto> = Vec::new();
    for entry in read.flatten() {
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let md = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let folder = md.is_dir();
        let ext = if folder {
            String::new()
        } else {
            p.extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        };
        out.push(DirEntryDto {
            hidden: is_hidden(&p, &name),
            name,
            folder,
            ext,
            size: if folder { 0 } else { md.len() },
            m: fmt_time(md.modified()),
            c: fmt_time(md.created()),
        });
    }

    // Folders first, then case-insensitive name order.
    out.sort_by(|a, b| match (a.folder, b.folder) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}

/// Enumerate mounted drives / volumes with capacity info.
#[tauri::command]
pub fn list_drives() -> Vec<DriveDto> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    let mut out: Vec<DriveDto> = disks
        .list()
        .iter()
        .map(|d| {
            let mount = d.mount_point().to_string_lossy().to_string();
            let letter = mount.trim_end_matches(['\\', '/']).to_string();
            DriveDto {
                letter: if letter.is_empty() { mount.clone() } else { letter },
                path: mount,
                name: d.name().to_string_lossy().to_string(),
                total: d.total_space(),
                free: d.available_space(),
            }
        })
        .collect();
    out.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    out.dedup_by(|a, b| a.path.eq_ignore_ascii_case(&b.path));
    out
}

/// Return the user's home directory as an absolute path string.
#[tauri::command]
pub fn home_dir() -> String {
    dirs_home().unwrap_or_default()
}

/// A folder to show on startup instead of the usual session restore, passed
/// as this process's first command-line argument — e.g. a launcher (BlueWind's
/// "フォルダを開くファイラー" setting) or FlexFind's "FlexExplorerで表示"
/// invoking `FlexExplorer.exe "<path>"`. A file argument resolves to its
/// containing folder; anything else is ignored.
#[tauri::command]
pub fn launch_path() -> Option<String> {
    let raw = std::env::args().nth(1)?;
    let p = Path::new(&raw);
    if p.is_dir() {
        Some(raw)
    } else if p.is_file() {
        p.parent().map(|d| d.to_string_lossy().to_string())
    } else {
        None
    }
}

fn dirs_home() -> Option<String> {
    #[cfg(windows)]
    {
        std::env::var("USERPROFILE").ok()
    }
    #[cfg(not(windows))]
    {
        std::env::var("HOME").ok()
    }
}

/// Open a file or folder with the OS default handler.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        // `cmd /C start "" "<path>"` lets the shell resolve the default app.
        // cmd.exe is a console-subsystem process, so without CREATE_NO_WINDOW
        // it briefly flashes an empty console window on every open — even
        // though it exits immediately after launching the real target.
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Extract a text preview of a spreadsheet's first sheet (xlsx/xls/ods/csv).
#[tauri::command]
pub fn read_xlsx_preview(path: String, max_rows: usize, max_cols: usize) -> Result<String, String> {
    use calamine::{open_workbook_auto, Data, Reader};
    let mut wb = open_workbook_auto(&path).map_err(|e| e.to_string())?;
    let names = wb.sheet_names().to_vec();
    let sheet = names.first().ok_or("シートが見つかりません")?;
    let range = wb.worksheet_range(sheet).map_err(|e| e.to_string())?;

    fn cell_text(c: &Data) -> String {
        match c {
            Data::Empty => String::new(),
            Data::String(s) => s.clone(),
            Data::Float(f) => {
                if f.fract() == 0.0 { format!("{}", *f as i64) } else { format!("{f}") }
            }
            Data::Int(i) => i.to_string(),
            Data::Bool(b) => b.to_string(),
            other => other.to_string(),
        }
    }

    let rows = max_rows.clamp(1, 1000);
    let cols = max_cols.clamp(1, 60);
    let mut out = format!("[{}]  {} 行 × {} 列\n\n", sheet, range.height(), range.width());
    for (r, row) in range.rows().enumerate() {
        if r >= rows {
            out.push('…');
            break;
        }
        let line: Vec<String> = row.iter().take(cols).map(cell_text).collect();
        out.push_str(&line.join(" | "));
        out.push('\n');
    }
    Ok(out)
}

/// Read the first `max_bytes` bytes of a text file as UTF-8 (lossy) for preview.
#[tauri::command]
pub fn read_text_preview(path: String, max_bytes: usize) -> Result<String, String> {
    use std::io::Read;
    let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let cap = max_bytes.min(256 * 1024);
    let mut buf = vec![0u8; cap];
    let n = f.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    Ok(String::from_utf8_lossy(&buf).to_string())
}

/// Rename / move a single entry. Returns the new absolute path.
#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<String, String> {
    std::fs::rename(&from, &to).map_err(|e| e.to_string())?;
    Ok(to)
}

// ---- copy / move / delete / create ----

/// Pick a non-colliding target path by inserting " (2)", " (3)", … before the
/// extension when the desired path already exists.
pub(crate) fn unique_target(desired: &Path) -> PathBuf {
    if !desired.exists() {
        return desired.to_path_buf();
    }
    let parent = desired.parent().unwrap_or_else(|| Path::new("."));
    let stem = desired.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = desired.extension().map(|s| s.to_string_lossy().to_string());
    for i in 2..10_000 {
        let fname = match &ext {
            Some(e) => format!("{stem} ({i}).{e}"),
            None => format!("{stem} ({i})"),
        };
        let cand = parent.join(fname);
        if !cand.exists() {
            return cand;
        }
    }
    desired.to_path_buf()
}

fn copy_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if src.is_dir() {
        std::fs::create_dir_all(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        }
    } else {
        if let Some(p) = dst.parent() {
            std::fs::create_dir_all(p)?;
        }
        std::fs::copy(src, dst)?;
    }
    Ok(())
}

fn remove_recursive(p: &Path) -> std::io::Result<()> {
    if p.is_dir() {
        std::fs::remove_dir_all(p)
    } else {
        std::fs::remove_file(p)
    }
}

/// Copy entries into a destination directory. Returns the count copied.
#[tauri::command]
pub fn copy_entries(paths: Vec<String>, dest_dir: String) -> Result<u32, String> {
    let dest = PathBuf::from(&dest_dir);
    let mut n = 0;
    for p in &paths {
        let src = PathBuf::from(p);
        let name = src.file_name().ok_or_else(|| format!("invalid source: {p}"))?;
        let target = unique_target(&dest.join(name));
        copy_recursive(&src, &target).map_err(|e| e.to_string())?;
        n += 1;
    }
    Ok(n)
}

/// Move entries into a destination directory. Returns the count moved.
#[tauri::command]
pub fn move_entries(paths: Vec<String>, dest_dir: String) -> Result<u32, String> {
    let dest = PathBuf::from(&dest_dir);
    let mut n = 0;
    for p in &paths {
        let src = PathBuf::from(p);
        let name = src.file_name().ok_or_else(|| format!("invalid source: {p}"))?;
        let target = unique_target(&dest.join(name));
        // Fast path: same-volume rename. Fall back to copy + delete across volumes.
        if std::fs::rename(&src, &target).is_err() {
            copy_recursive(&src, &target).map_err(|e| e.to_string())?;
            remove_recursive(&src).map_err(|e| e.to_string())?;
        }
        n += 1;
    }
    Ok(n)
}

/// Delete entries. Sends to the OS recycle bin unless `permanent` is true.
#[tauri::command]
pub fn delete_entries(paths: Vec<String>, permanent: bool) -> Result<u32, String> {
    let mut n = 0;
    for p in &paths {
        if permanent {
            remove_recursive(&PathBuf::from(p)).map_err(|e| e.to_string())?;
        } else {
            trash::delete(p).map_err(|e| e.to_string())?;
        }
        n += 1;
    }
    Ok(n)
}

/// Create a new folder inside `dir`. Returns the created absolute path.
#[tauri::command]
pub fn create_folder(dir: String, name: String) -> Result<String, String> {
    let target = unique_target(&PathBuf::from(&dir).join(&name));
    std::fs::create_dir(&target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

/// Create a new item of a well-known kind inside `dir`, mirroring what
/// Explorer's own "New" submenu does for each type. `kind` is one of:
/// "folder", "txt", "xlsx", "docx", "pptx". Office formats are built from
/// the same registry-registered blank template Explorer itself uses (see
/// `shellnew`) — we never fabricate an empty Office file ourselves, since a
/// 0-byte .xlsx/.docx/.pptx isn't valid and the corresponding app would
/// just refuse to open it. Returns the created absolute path.
#[tauri::command]
pub fn create_new_item(dir: String, kind: String) -> Result<String, String> {
    let dir_path = PathBuf::from(&dir);

    if kind == "folder" {
        let target = unique_target(&dir_path.join("新しいフォルダー"));
        std::fs::create_dir(&target).map_err(|e| e.to_string())?;
        return Ok(target.to_string_lossy().to_string());
    }

    let base_name = match kind.as_str() {
        "txt" => "新しいテキスト ドキュメント",
        "xlsx" => "新しい Excel ワークシート",
        "docx" => "新しい Word 文書",
        "pptx" => "新しい PowerPoint プレゼンテーション",
        _ => "新しいファイル",
    };
    let target = unique_target(&dir_path.join(format!("{base_name}.{kind}")));

    if kind == "txt" {
        std::fs::write(&target, []).map_err(|e| e.to_string())?;
        return Ok(target.to_string_lossy().to_string());
    }

    match crate::shellnew::read_template(&kind) {
        Some(bytes) => {
            std::fs::write(&target, &bytes).map_err(|e| e.to_string())?;
            Ok(target.to_string_lossy().to_string())
        }
        None => Err(format!(
            "「.{kind}」の新規作成テンプレートが見つかりません(対応するアプリがインストールされていない可能性があります)"
        )),
    }
}

/// Recursively search `root` for entries whose name contains `query`
/// (case-insensitive). Capped at `max` hits.
#[tauri::command]
pub fn search_dir(root: String, query: String, max: usize) -> Vec<SearchHit> {
    use walkdir::WalkDir;
    let q = query.trim().to_lowercase();
    let mut out = Vec::new();
    if q.is_empty() {
        return out;
    }
    let cap = max.clamp(1, 5000);
    for entry in WalkDir::new(&root)
        .max_depth(10)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if out.len() >= cap {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().contains(&q) {
            continue;
        }
        let path = entry.path();
        let md = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let folder = md.is_dir();
        let ext = if folder {
            String::new()
        } else {
            path.extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        };
        out.push(SearchHit {
            name,
            abs: path.to_string_lossy().to_string(),
            folder,
            ext,
            size: if folder { 0 } else { md.len() },
            m: fmt_time(md.modified()),
        });
    }
    out
}
