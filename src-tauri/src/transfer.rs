//! Copy/move as a *watchable* operation: the frontend asks what a transfer
//! would involve (`plan_transfer`), decides what to do about name collisions,
//! then starts it (`start_transfer`) and follows along through progress events
//! until it finishes or is cancelled (`cancel_transfer`).
//!
//! The simpler `fs::copy_entries` / `fs::move_entries` still exist for small,
//! instant operations; this module is what the paste and drag-and-drop paths
//! use, because those can just as easily be handed a 40 GB folder — and doing
//! that synchronously froze the window with no way out.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

/// Copy buffer. Also the granularity at which a single large file can notice
/// that it has been cancelled, so it can't be much larger than this.
const CHUNK: usize = 1024 * 1024;

/// What a transfer is about to do, so the frontend can size the progress bar
/// and ask about collisions *before* anything is touched.
#[derive(Serialize)]
pub struct TransferPlan {
    /// Total number of files involved, counting folder contents recursively.
    pub files: u64,
    pub bytes: u64,
    /// Top-level names that already exist in the destination.
    pub conflicts: Vec<String>,
}

#[derive(Clone, Serialize)]
struct Progress {
    id: String,
    done: u64,
    total: u64,
    #[serde(rename = "bytesDone")]
    bytes_done: u64,
    #[serde(rename = "bytesTotal")]
    bytes_total: u64,
    /// Name of the file being worked on, for the "…をコピー中" line.
    current: String,
}

#[derive(Clone, Serialize)]
struct Done {
    id: String,
    ok: u32,
    skipped: u32,
    cancelled: bool,
    /// One message per entry that failed; the transfer carries on past them.
    errors: Vec<String>,
}

/// Cancellation flags for transfers currently running, keyed by the id the
/// frontend generated for each.
fn cancels() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static CANCELS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    CANCELS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Takes the registry lock, recovering from a previous panic rather than
/// giving up: a poisoned lock here would silently make every later transfer
/// impossible to cancel.
fn with_cancels<T>(f: impl FnOnce(&mut HashMap<String, Arc<AtomicBool>>) -> T) -> T {
    let mut guard = cancels().lock().unwrap_or_else(|e| e.into_inner());
    f(&mut guard)
}

/// Recursively total up the files and bytes under `p` (a file counts as one).
fn measure(p: &Path) -> (u64, u64) {
    let md = match std::fs::symlink_metadata(p) {
        Ok(m) => m,
        Err(_) => return (0, 0),
    };
    if is_reparse(&md) {
        // Not descended into during the copy either — see `copy_any`.
        return (1, 0);
    }
    if md.is_file() {
        return (1, md.len());
    }
    if !md.is_dir() {
        return (0, 0);
    }
    let mut files = 0;
    let mut bytes = 0;
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() {
            let (f, b) = measure(&e.path());
            files += f;
            bytes += b;
        }
    }
    (files, bytes)
}

/// Whether this entry is a symlink or junction. Following one while copying
/// would duplicate whatever it points at — possibly outside the tree being
/// copied — so they are skipped rather than traversed.
fn is_reparse(md: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        return md.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(windows))]
    {
        md.file_type().is_symlink()
    }
}

/// Inspect a pending transfer without performing it.
///
/// `async` so Tauri runs it off the main thread: measuring a large tree walks
/// every file, and doing that inline would freeze the window in exactly the
/// situation this module exists to keep responsive.
#[tauri::command]
pub async fn plan_transfer(paths: Vec<String>, dest_dir: String) -> Result<TransferPlan, String> {
    let dest = PathBuf::from(&dest_dir);
    let mut files = 0;
    let mut bytes = 0;
    let mut conflicts = Vec::new();
    for p in &paths {
        let src = PathBuf::from(p);
        check_not_inside(&src, &dest)?;
        let (f, b) = measure(&src);
        files += f;
        bytes += b;
        if let Some(name) = src.file_name() {
            let target = dest.join(name);
            // A source that already *is* the destination entry isn't a
            // collision — that case is a no-op, handled when we run.
            if target.exists() && !crate::fs::same_entry(&src, &target) {
                conflicts.push(name.to_string_lossy().to_string());
            }
        }
    }
    Ok(TransferPlan { files, bytes, conflicts })
}

/// Rejects copying or moving a folder into itself or into its own subtree.
///
/// Without this the copy walks into the directory it is creating and recurses
/// until the path length or the disk gives out.
pub(crate) fn check_not_inside(src: &Path, dest: &Path) -> Result<(), String> {
    let (s, d) = match (src.canonicalize(), dest.canonicalize()) {
        (Ok(s), Ok(d)) => (s, d),
        // A destination that doesn't exist yet can't be inside anything.
        _ => return Ok(()),
    };
    if d == s || d.starts_with(&s) {
        return Err(format!(
            "「{}」を自分自身の中へは移動・コピーできません",
            src.file_name().unwrap_or_default().to_string_lossy()
        ));
    }
    Ok(())
}

/// Abandon a running transfer. Whatever has already been written stays put —
/// the same as cancelling a copy in Explorer.
#[tauri::command]
pub fn cancel_transfer(id: String) {
    if let Some(flag) = with_cancels(|m| m.get(&id).cloned()) {
        flag.store(true, Ordering::SeqCst);
    }
}

struct Ctx {
    app: AppHandle,
    id: String,
    cancel: Arc<AtomicBool>,
    done: u64,
    total: u64,
    bytes_done: u64,
    bytes_total: u64,
    /// Progress is emitted at most ~20×/second; a per-file event on a folder of
    /// thousands of small files would flood the webview and slow the copy down.
    last_emit: std::time::Instant,
}

impl Ctx {
    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    fn tick(&mut self, current: &str, force: bool) {
        if !force && self.last_emit.elapsed().as_millis() < 50 {
            return;
        }
        self.last_emit = std::time::Instant::now();
        let _ = self.app.emit(
            "transfer-progress",
            Progress {
                id: self.id.clone(),
                done: self.done,
                total: self.total,
                bytes_done: self.bytes_done,
                bytes_total: self.bytes_total,
                current: current.to_string(),
            },
        );
    }

    /// Credits an entry that was skipped or failed, so the bar still reaches
    /// the end: its contents were counted into `total` up front.
    fn credit(&mut self, files: u64, bytes: u64, current: &str) {
        self.done += files;
        self.bytes_done += bytes;
        self.tick(current, true);
    }
}

/// Copies one file in chunks, so a large file can still be cancelled part-way
/// and reports progress as it goes. Overwrites `dst` if it exists.
fn copy_file(ctx: &mut Ctx, src: &Path, dst: &Path) -> std::io::Result<()> {
    let name = src.file_name().unwrap_or_default().to_string_lossy().to_string();
    let mut r = std::fs::File::open(src)?;
    let mut w = std::fs::File::create(dst)?;
    let mut buf = vec![0u8; CHUNK];
    loop {
        if ctx.cancelled() {
            return Ok(());
        }
        let n = r.read(&mut buf)?;
        if n == 0 {
            break;
        }
        w.write_all(&buf[..n])?;
        ctx.bytes_done += n as u64;
        ctx.tick(&name, false);
    }
    ctx.done += 1;
    ctx.tick(&name, false);
    Ok(())
}

/// Copies a file or a whole folder, stopping early if cancellation is
/// requested. Existing files at the destination are overwritten; existing
/// folders are merged into, which is what "上書き" has to mean for a folder —
/// deleting the destination folder first would take unrelated files with it.
fn copy_any(ctx: &mut Ctx, src: &Path, dst: &Path) -> std::io::Result<()> {
    if ctx.cancelled() {
        return Ok(());
    }
    let md = std::fs::symlink_metadata(src)?;
    if is_reparse(&md) {
        // Copying through a junction would pull in whatever it points at.
        ctx.credit(1, 0, &src.file_name().unwrap_or_default().to_string_lossy());
        return Ok(());
    }
    if md.is_dir() {
        std::fs::create_dir_all(dst)?;
        for e in std::fs::read_dir(src)? {
            if ctx.cancelled() {
                return Ok(());
            }
            let e = e?;
            copy_any(ctx, &e.path(), &dst.join(e.file_name()))?;
        }
        Ok(())
    } else {
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent)?;
        }
        copy_file(ctx, src, dst)
    }
}

fn remove_any(p: &Path) -> std::io::Result<()> {
    let md = std::fs::symlink_metadata(p)?;
    if md.is_dir() && !is_reparse(&md) {
        std::fs::remove_dir_all(p)
    } else {
        std::fs::remove_file(p)
    }
}

/// Emits `transfer-done` when it goes out of scope, however that happens.
///
/// The frontend refuses to start another transfer while one is in flight, so a
/// thread that died without reporting would leave the app unable to copy
/// anything until restarted.
struct DoneGuard {
    app: AppHandle,
    id: String,
    ok: u32,
    skipped: u32,
    cancelled: bool,
    errors: Vec<String>,
}

impl Drop for DoneGuard {
    fn drop(&mut self) {
        with_cancels(|m| m.remove(&self.id));
        let _ = self.app.emit(
            "transfer-done",
            Done {
                id: self.id.clone(),
                ok: self.ok,
                skipped: self.skipped,
                cancelled: self.cancelled,
                errors: std::mem::take(&mut self.errors),
            },
        );
    }
}

/// Start a transfer. Returns as soon as the work is handed to a thread; watch
/// `transfer-progress` and `transfer-done` (both carry `id`) to follow it.
///
/// `mode` is "copy" or "move". `conflict` decides what happens to a top-level
/// entry whose name already exists in the destination: "overwrite" (replace
/// files, merge folders), "keepboth" (the `名前 (2)` behaviour) or "skip".
#[tauri::command]
pub fn start_transfer(
    app: AppHandle,
    id: String,
    paths: Vec<String>,
    dest_dir: String,
    mode: String,
    conflict: String,
) -> Result<(), String> {
    let dest = PathBuf::from(&dest_dir);
    if !dest.is_dir() {
        return Err(format!("移動先が見つかりません: {dest_dir}"));
    }
    // Checked before the thread starts so the error can be reported directly.
    for p in &paths {
        check_not_inside(Path::new(p), &dest)?;
    }

    let cancel = Arc::new(AtomicBool::new(false));
    with_cancels(|m| m.insert(id.clone(), cancel.clone()));

    std::thread::spawn(move || {
        let moving = mode == "move";
        // Measured once, and kept per path: crediting a skipped or failed entry
        // needs the same numbers, and re-walking a network folder is slow.
        let sizes: Vec<(u64, u64)> = paths.iter().map(|p| measure(Path::new(p))).collect();
        let total = sizes.iter().map(|(f, _)| f).sum();
        let bytes_total = sizes.iter().map(|(_, b)| b).sum();

        let mut ctx = Ctx {
            app: app.clone(),
            id: id.clone(),
            cancel: cancel.clone(),
            done: 0,
            total,
            bytes_done: 0,
            bytes_total,
            last_emit: std::time::Instant::now(),
        };
        ctx.tick("", true);

        let mut guard = DoneGuard {
            app: app.clone(),
            id,
            ok: 0,
            skipped: 0,
            cancelled: false,
            errors: Vec::new(),
        };

        for (i, p) in paths.iter().enumerate() {
            if ctx.cancelled() {
                break;
            }
            let (files, bytes) = sizes[i];
            let src = PathBuf::from(p);
            let name = match src.file_name() {
                Some(n) => n.to_os_string(),
                None => {
                    guard.errors.push(format!("{p}: 名前を取得できません"));
                    ctx.credit(files, bytes, "");
                    continue;
                }
            };
            let label = name.to_string_lossy().to_string();
            let desired = dest.join(&name);

            // Landing where it already is: nothing to do when moving; when
            // copying, fall through and make a numbered duplicate.
            if moving && crate::fs::same_entry(&src, &desired) {
                guard.skipped += 1;
                ctx.credit(files, bytes, &label);
                continue;
            }

            let collides = desired.exists() && !crate::fs::same_entry(&src, &desired);
            let overwrite = collides && conflict == "overwrite";
            if collides && conflict == "skip" {
                guard.skipped += 1;
                ctx.credit(files, bytes, &label);
                continue;
            }
            // "overwrite" writes straight over the existing entry: files are
            // replaced by the copy itself and folders are merged. Deleting the
            // destination first would leave a window where the old data is gone
            // and the new data isn't written yet — and for a folder it would
            // throw away everything the source doesn't happen to replace.
            let target = if overwrite {
                desired
            } else if collides {
                match crate::fs::unique_target(&desired) {
                    Some(t) => t,
                    None => {
                        guard.errors.push(format!("{label}: 名前を変えて保存できません"));
                        ctx.credit(files, bytes, &label);
                        continue;
                    }
                }
            } else {
                desired
            };

            let result = if moving {
                move_one(&mut ctx, &src, &target, overwrite)
            } else {
                copy_any(&mut ctx, &src, &target)
            };

            match result {
                Ok(()) => guard.ok += 1,
                Err(e) => {
                    guard.errors.push(format!("{label}: {e}"));
                    // Credit whatever is left of this entry so the bar still
                    // finishes; part of it may already have been counted.
                    ctx.tick(&label, true);
                }
            }
        }

        guard.cancelled = ctx.cancelled();
        if guard.cancelled {
            ctx.tick("", true);
        }
        // guard drops here and emits transfer-done, whatever happened above.
    });

    Ok(())
}

/// Moves one entry. Tries a plain rename first — on the same volume that moves
/// a whole subtree instantly — and falls back to copy + delete.
fn move_one(ctx: &mut Ctx, src: &Path, target: &Path, overwrite: bool) -> std::io::Result<()> {
    // A rename onto an existing entry fails on Windows, so an overwriting move
    // goes through the copy path, which replaces files and merges folders.
    if !overwrite || !target.exists() {
        if std::fs::rename(src, target).is_ok() {
            let (f, b) = measure(target);
            ctx.done += f;
            ctx.bytes_done += b;
            ctx.tick(&src.file_name().unwrap_or_default().to_string_lossy(), true);
            return Ok(());
        }
    }
    copy_any(ctx, src, target)?;
    // Cancelling mid-copy must not delete the source: half of it is now in two
    // places, and the copy is the half that's incomplete.
    if ctx.cancelled() {
        return Ok(());
    }
    remove_any(src)
}
