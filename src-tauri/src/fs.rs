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
/// Runs `f` on Tauri's blocking pool. Commands that aren't `async` run on the
/// main thread, so a slow network folder, a deep search or a large workbook
/// froze the whole window until it finished.
pub(crate) async fn off_main<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<DirEntryDto>, String> {
    off_main(move || list_dir_blocking(path)).await?
}

fn list_dir_blocking(path: String) -> Result<Vec<DirEntryDto>, String> {
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
pub async fn list_drives() -> Result<Vec<DriveDto>, String> {
    // Querying a disconnected network drive can stall for seconds.
    off_main(list_drives_blocking).await
}

fn list_drives_blocking() -> Vec<DriveDto> {
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

/// Resolves a launch/relaunch argument to a folder to show: a directory as-is,
/// a file to its containing folder, anything else ignored. Shared by both a
/// cold start's argv (`launch_path`) and a warm relaunch caught by the
/// single-instance plugin (see `lib.rs`).
pub fn resolve_launch_target(raw: &str) -> Option<String> {
    let p = Path::new(raw);
    if p.is_dir() {
        Some(raw.to_string())
    } else if p.is_file() {
        p.parent().map(|d| d.to_string_lossy().to_string())
    } else {
        None
    }
}

/// Folder to show for an arbitrary path: a directory as-is, a file's parent,
/// `None` if it doesn't exist. Lets the frontend turn a pasted
/// a pasted UNC path into "open that folder, select that file".
#[tauri::command]
pub async fn resolve_target(path: String) -> Result<Option<String>, String> {
    off_main(move || resolve_launch_target(&path)).await
}

/// A folder to show on startup instead of the usual session restore, passed
/// as this process's first command-line argument — e.g. a launcher (BlueWind's
/// "フォルダを開くファイラー"設定) or FlexFind's "FlexExplorerで表示"
/// invoking `FlexExplorer.exe "<path>"`. A file argument resolves to its
/// containing folder; anything else is ignored.
#[tauri::command]
pub fn launch_path() -> Option<String> {
    let raw = std::env::args().nth(1)?;
    resolve_launch_target(&raw)
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
        // Straight to the shell's default verb. Going through `cmd /C start`
        // let cmd parse the path: `&`, `^` and `%` in a file name split it
        // into further commands (a file called `a&calc` launched calc, and
        // `Q&A.txt` didn't open at all).
        crate::shell::shell_verb(path, String::new())?;
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

/// One candidate for the "swap this path segment, keep the rest" navigation
/// (see `sibling_folders`).
#[derive(Serialize)]
pub struct SiblingDto {
    pub name: String,
    /// How many segments of the requested tail exist under this sibling.
    pub depth: usize,
    /// Whether the whole tail exists — i.e. the same structure is present.
    #[serde(rename = "hasTail")]
    pub has_tail: bool,
}

/// Folders sitting alongside a path segment, each reporting how much of
/// `tail` it also contains.
///
/// This backs switching `…/10:2026/10:基本設計/hoge` to
/// `…/20:2027/10:基本設計/hoge`: `parent` is the folder holding the segment
/// being swapped, and `tail` is everything below it that should be carried
/// over. Probing is a plain `is_dir` walk per sibling, so a few dozen
/// siblings cost almost nothing.
#[tauri::command]
pub async fn sibling_folders(parent: String, tail: Vec<String>) -> Result<Vec<SiblingDto>, String> {
    off_main(move || sibling_folders_blocking(parent, tail)).await?
}

fn sibling_folders_blocking(parent: String, tail: Vec<String>) -> Result<Vec<SiblingDto>, String> {
    let dir = PathBuf::from(&parent);
    let read = std::fs::read_dir(&dir).map_err(|e| format!("{parent}: {e}"))?;

    let mut out: Vec<SiblingDto> = Vec::new();
    for entry in read.flatten() {
        let p = entry.path();
        if !entry.metadata().map(|m| m.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let mut probe = p.clone();
        let mut depth = 0;
        for seg in &tail {
            probe.push(seg);
            if probe.is_dir() {
                depth += 1;
            } else {
                break;
            }
        }
        out.push(SiblingDto {
            has_tail: depth == tail.len(),
            depth,
            name,
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

/// Extract a text preview of a spreadsheet's first sheet (xlsx/xls/ods/csv).
#[tauri::command]
pub async fn read_xlsx_preview(path: String, max_rows: usize, max_cols: usize) -> Result<String, String> {
    off_main(move || read_xlsx_preview_blocking(path, max_rows, max_cols)).await?
}

fn read_xlsx_preview_blocking(path: String, max_rows: usize, max_cols: usize) -> Result<String, String> {
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
        // Tab-separated, not " | " — the inspector shows raw cell values, and a
        // pipe reads as a table rule that isn't in the sheet.
        let line: Vec<String> = row.iter().take(cols).map(cell_text).collect();
        out.push_str(line.join("	").trim_end());
        out.push('\n');
    }
    Ok(out)
}

/// Read the first `max_bytes` bytes of a text file as UTF-8 (lossy) for preview.
#[tauri::command]
pub async fn read_text_preview(path: String, max_bytes: usize) -> Result<String, String> {
    off_main(move || read_text_preview_blocking(path, max_bytes)).await?
}

fn read_text_preview_blocking(path: String, max_bytes: usize) -> Result<String, String> {
    use std::io::Read;
    let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let cap = max_bytes.min(256 * 1024);
    let mut buf = vec![0u8; cap];
    let n = f.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    Ok(String::from_utf8_lossy(&buf).to_string())
}

/// `p` as a NUL-terminated UTF-16 string for a Win32 call, switched to the
/// `\\?\` form when it is too long for the classic 260-character limit.
/// `std::fs` does this on its own; direct `MoveFileExW` / `CopyFileExW`
/// calls don't, so without it a deep path could be listed but not renamed.
#[cfg(windows)]
pub(crate) fn wide_path(p: &Path) -> Vec<u16> {
    let s = p.to_string_lossy();
    // The limit counts UTF-16 units, not bytes (a Japanese name is 3 bytes a
    // character in UTF-8).
    let long = if s.encode_utf16().count() < 240 || s.starts_with(r"\\?\") {
        s.to_string()
    } else if let Some(rest) = s.strip_prefix(r"\\") {
        format!(r"\\?\UNC\{}", rest.replace('/', r"\"))
    } else if s.as_bytes().get(1) == Some(&b':') {
        format!(r"\\?\{}", s.replace('/', r"\"))
    } else {
        s.to_string()
    };
    long.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Moves `from` to `to` on the same volume, failing — atomically, with no
/// gap between checking and moving — if `to` already exists. (`std::fs::rename`
/// replaces an existing file on Windows.) A case-only rename (a.txt → A.txt)
/// is the same entry and still succeeds. Fails across volumes too, which the
/// transfer engine relies on to fall back to copying.
pub(crate) fn move_no_replace(from: &Path, to: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::Storage::FileSystem::{MoveFileExW, MOVE_FILE_FLAGS};
        let (wf, wt) = (wide_path(from), wide_path(to));
        unsafe { MoveFileExW(PCWSTR(wf.as_ptr()), PCWSTR(wt.as_ptr()), MOVE_FILE_FLAGS(0)) }
            .map_err(|e| std::io::Error::from_raw_os_error((e.code().0 as u32 & 0xFFFF) as i32))
    }
    #[cfg(not(windows))]
    {
        if to.exists() && !same_entry(from, to) {
            return Err(std::io::ErrorKind::AlreadyExists.into());
        }
        std::fs::rename(from, to)
    }
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}

/// Saves one of the app's own files (notes, workspaces) so that it is never
/// left half-written: the new content goes to a scratch file beside it, is
/// flushed to disk, and only then replaces the old file. The version being
/// replaced is kept as `<name>.bak` for `read_saved` to fall back to — but
/// only when `valid` accepts it: copying a damaged file over a good backup
/// would leave nothing to recover from if the rename then failed.
///
/// One writer at a time is assumed: the app is single-instance, and these
/// commands are synchronous, so they run one after another on the main thread.
pub(crate) fn write_replacing(path: &Path, data: &[u8], valid: impl Fn(&str) -> bool) -> Result<(), String> {
    use std::io::Write;
    let keep_old = matches!(read_one(path, &valid)?, Saved::Good(_));
    let tmp = with_suffix(path, ".tmp");
    let r = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?;
        drop(f);
        if keep_old {
            std::fs::copy(path, with_suffix(path, ".bak"))?;
        }
        std::fs::rename(&tmp, path)
    })();
    if r.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    r.map_err(|e| format!("{} に保存できません: {e}", path.display()))
}

/// One saved file: usable, there but damaged, or not there at all.
enum Saved {
    Good(String),
    Damaged,
    Missing,
}

fn read_one(path: &Path, valid: &impl Fn(&str) -> bool) -> Result<Saved, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(match String::from_utf8(bytes) {
            // Bad UTF-8 is damage as well: a write cut off mid-character.
            Ok(s) if valid(&s) => Saved::Good(s),
            _ => Saved::Damaged,
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Saved::Missing),
        Err(e) => Err(format!("{} を読めません: {e}", path.display())),
    }
}

/// Reads a file saved by `write_replacing`; `Ok(None)` only when neither it
/// nor its backup exists. A damaged file falls back to the backup. Anything
/// that exists but can't be read or used is an error, never "empty": the
/// caller would write its next change over everything that was in it.
pub(crate) fn read_saved(path: &Path, valid: impl Fn(&str) -> bool) -> Result<Option<String>, String> {
    let main = match read_one(path, &valid)? {
        Saved::Good(s) => return Ok(Some(s)),
        other => other,
    };
    match (main, read_one(&with_suffix(path, ".bak"), &valid)?) {
        (_, Saved::Good(s)) => Ok(Some(s)),
        (Saved::Missing, Saved::Missing) => Ok(None),
        _ => Err(format!("{} が壊れていて、使えるバックアップもありません", path.display())),
    }
}

/// Why `name` can't be a file name on Windows, if it can't.
fn bad_name(name: &str) -> Option<&'static str> {
    if name.is_empty() || name == "." || name == ".." {
        return Some("名前が空です");
    }
    if name.chars().any(|c| "\\/:*?\"<>|".contains(c) || (c as u32) < 32) {
        return Some("ファイル名に使えない文字が含まれています");
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Some("名前の末尾にピリオドや空白は使えません");
    }
    None
}

/// Rename a single entry within its folder. Returns the new absolute path.
#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<String, String> {
    let (f, t) = (Path::new(&from), Path::new(&to));
    let name = t.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    // A rename never leaves its folder. A generated name containing `\` or
    // `..` (a bulk-rename prefix of `..\archive\`, say) would otherwise move
    // the entry somewhere else entirely.
    if t.parent() != f.parent() || t.file_name().is_none() {
        return Err("名前に「\\」や「..」は使えません".into());
    }
    if let Some(why) = bad_name(&name) {
        return Err(why.into());
    }
    move_no_replace(f, t).map_err(|e| match e.raw_os_error() {
        // ERROR_ALREADY_EXISTS (183) / ERROR_FILE_EXISTS (80)
        Some(183) | Some(80) => format!("「{name}」は既に存在します"),
        _ if e.kind() == std::io::ErrorKind::AlreadyExists => format!("「{name}」は既に存在します"),
        _ => e.to_string(),
    })?;
    Ok(to)
}

// ---- copy / move / delete / create ----

/// Whether two paths denote the same existing entry — compared canonically so
/// differing case, trailing separators, or `.`/`..` segments don't fool it.
pub(crate) fn same_entry(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

/// Pick a non-colliding target path by inserting " (2)", " (3)", … before the
/// extension when the desired path already exists.
///
/// `None` when every candidate is taken. Callers must not fall back to the
/// desired path in that case: writing there would overwrite the very file the
/// caller asked to keep.
pub(crate) fn unique_target(desired: &Path) -> Option<PathBuf> {
    if !desired.exists() {
        return Some(desired.to_path_buf());
    }
    let parent = desired.parent().unwrap_or_else(|| Path::new("."));
    // A folder called "10:2026.基本設計" has no extension, whatever
    // `Path::extension` says — only split one off when the entry is a file.
    let is_file = desired.is_file();
    let stem = if is_file { desired.file_stem() } else { desired.file_name() }
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = if is_file {
        desired.extension().map(|s| s.to_string_lossy().to_string())
    } else {
        None
    };
    for i in 2..10_000 {
        let fname = match &ext {
            Some(e) => format!("{stem} ({i}).{e}"),
            None => format!("{stem} ({i})"),
        };
        let cand = parent.join(fname);
        if !cand.exists() {
            return Some(cand);
        }
    }
    None
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
        let desired = dest.join(name);
        // Moving an entry into the folder it already lives in is a no-op, not a
        // reason to make a "(2)" duplicate — that only applies to a real name
        // collision with a *different* entry (see `unique_target`).
        if same_entry(&src, &desired) {
            continue;
        }
        crate::transfer::check_not_inside(&src, &dest)?;
        let target = unique_target(&desired)
            .ok_or_else(|| format!("{}: 名前を変えて保存できません", desired.to_string_lossy()))?;
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
        let desired = dest.join(name);
        // Moving an entry into the folder it already lives in is a no-op, not a
        // reason to make a "(2)" duplicate — that only applies to a real name
        // collision with a *different* entry (see `unique_target`).
        if same_entry(&src, &desired) {
            continue;
        }
        crate::transfer::check_not_inside(&src, &dest)?;
        let target = unique_target(&desired)
            .ok_or_else(|| format!("{}: 名前を変えて保存できません", desired.to_string_lossy()))?;
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
pub async fn delete_entries(paths: Vec<String>, permanent: bool) -> Result<u32, String> {
    // On a fresh thread of its own, not straight on the shared blocking pool:
    // `trash` initialises COM (single-threaded apartment) per thread and
    // panics if that thread was already set up differently — and release
    // builds abort on panic.
    off_main(move || {
        std::thread::spawn(move || delete_entries_blocking(paths, permanent))
            .join()
            .unwrap_or_else(|_| Err("削除中に予期しないエラーが発生しました".into()))
    })
    .await?
}

fn delete_entries_blocking(paths: Vec<String>, permanent: bool) -> Result<u32, String> {
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
    let target = unique_target(&PathBuf::from(&dir).join(&name))
        .ok_or("同じ名前のファイルが多すぎます")?;
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
        let target = unique_target(&dir_path.join("新しいフォルダー"))
            .ok_or("同じ名前のフォルダーが多すぎます")?;
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
    let target = unique_target(&dir_path.join(format!("{base_name}.{kind}")))
        .ok_or("同じ名前のファイルが多すぎます")?;

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
pub async fn search_dir(root: String, query: String, max: usize) -> Result<Vec<SearchHit>, String> {
    off_main(move || search_dir_blocking(root, query, max)).await
}

fn search_dir_blocking(root: String, query: String, max: usize) -> Vec<SearchHit> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_files_fall_back_to_the_backup() {
        let dir = std::env::temp_dir().join(format!("flx-save-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("notes.json");
        let ok = |s: &str| s.starts_with('{') && s.ends_with('}');

        assert_eq!(read_saved(&f, ok).unwrap(), None);
        write_replacing(&f, b"{1}", ok).unwrap();
        write_replacing(&f, b"{2}", ok).unwrap();
        assert_eq!(read_saved(&f, ok).unwrap().as_deref(), Some("{2}"));
        assert_eq!(std::fs::read_to_string(dir.join("notes.json.bak")).unwrap(), "{1}");
        assert!(!dir.join("notes.json.tmp").exists());

        // Cut short: the previous version comes back instead.
        std::fs::write(&f, "{2").unwrap();
        std::fs::write(dir.join("notes.json.bak"), "x").unwrap();
        assert!(read_saved(&f, ok).is_err());
        std::fs::write(dir.join("notes.json.bak"), "{1}").unwrap();
        assert_eq!(read_saved(&f, ok).unwrap().as_deref(), Some("{1}"));
        // Cut off mid-character is damage too, not a read error.
        std::fs::write(&f, b"{\xe3\x81").unwrap();
        assert_eq!(read_saved(&f, ok).unwrap().as_deref(), Some("{1}"));
        // Saving over a damaged file leaves the good backup alone.
        write_replacing(&f, b"{3}", ok).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("notes.json.bak")).unwrap(), "{1}");
        // No main file and a damaged backup is an error, not "no data yet".
        std::fs::remove_file(&f).unwrap();
        std::fs::write(dir.join("notes.json.bak"), "x").unwrap();
        assert!(read_saved(&f, ok).is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
