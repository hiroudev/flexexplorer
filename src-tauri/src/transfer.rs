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
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

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

/// Recursively total up the files and bytes under `p` (a file counts as one).
fn measure(p: &Path) -> (u64, u64) {
    let md = match std::fs::symlink_metadata(p) {
        Ok(m) => m,
        Err(_) => return (0, 0),
    };
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

/// Inspect a pending transfer without performing it.
#[tauri::command]
pub fn plan_transfer(paths: Vec<String>, dest_dir: String) -> Result<TransferPlan, String> {
    let dest = PathBuf::from(&dest_dir);
    let mut files = 0;
    let mut bytes = 0;
    let mut conflicts = Vec::new();
    for p in &paths {
        let src = PathBuf::from(p);
        let (f, b) = measure(&src);
        files += f;
        bytes += b;
        if let Some(name) = src.file_name() {
            let target = dest.join(name);
            // A source that already *is* the destination entry isn't a
            // collision — that case is a no-op, handled when we run.
            if target.exists() && !same_path(&src, &target) {
                conflicts.push(name.to_string_lossy().to_string());
            }
        }
    }
    Ok(TransferPlan { files, bytes, conflicts })
}

fn same_path(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

/// Abandon a running transfer. Whatever has already been written stays put —
/// the same as cancelling a copy in Explorer.
#[tauri::command]
pub fn cancel_transfer(id: String) {
    if let Some(flag) = cancels().lock().ok().and_then(|m| m.get(&id).cloned()) {
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
}

/// Copy one file, counting it towards the progress totals.
fn copy_file(ctx: &mut Ctx, src: &Path, dst: &Path) -> std::io::Result<()> {
    let n = std::fs::copy(src, dst)?;
    ctx.done += 1;
    ctx.bytes_done += n;
    ctx.tick(&src.file_name().unwrap_or_default().to_string_lossy(), false);
    Ok(())
}

/// Copy a file or a whole folder, stopping early if cancellation is requested.
fn copy_any(ctx: &mut Ctx, src: &Path, dst: &Path) -> std::io::Result<()> {
    if ctx.cancelled() {
        return Ok(());
    }
    let md = std::fs::symlink_metadata(src)?;
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
        copy_file(ctx, src, dst)
    }
}

fn remove_any(p: &Path) -> std::io::Result<()> {
    let md = std::fs::symlink_metadata(p)?;
    if md.is_dir() {
        std::fs::remove_dir_all(p)
    } else {
        std::fs::remove_file(p)
    }
}

/// Start a transfer. Returns immediately; watch `transfer-progress` and
/// `transfer-done` (both carry `id`) to follow it.
///
/// `mode` is "copy" or "move". `conflict` decides what happens to a top-level
/// entry whose name already exists in the destination: "overwrite", "keepboth"
/// (the `名前 (2)` behaviour) or "skip".
#[tauri::command]
pub fn start_transfer(
    app: AppHandle,
    id: String,
    paths: Vec<String>,
    dest_dir: String,
    mode: String,
    conflict: String,
) {
    let cancel = Arc::new(AtomicBool::new(false));
    if let Ok(mut m) = cancels().lock() {
        m.insert(id.clone(), cancel.clone());
    }

    std::thread::spawn(move || {
        let dest = PathBuf::from(&dest_dir);
        let moving = mode == "move";
        let (total, bytes_total) = paths.iter().fold((0, 0), |(f, b), p| {
            let (mf, mb) = measure(Path::new(p));
            (f + mf, b + mb)
        });

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

        let mut ok = 0u32;
        let mut skipped = 0u32;
        let mut errors: Vec<String> = Vec::new();

        for p in &paths {
            if ctx.cancelled() {
                break;
            }
            let src = PathBuf::from(p);
            let name = match src.file_name() {
                Some(n) => n.to_os_string(),
                None => {
                    errors.push(format!("{p}: 名前を取得できません"));
                    continue;
                }
            };
            let desired = dest.join(&name);

            // Landing where it already is: nothing to do (moving), or make a
            // copy alongside (copying) — matching the paste behaviour.
            if same_path(&src, &desired) {
                if moving {
                    skipped += 1;
                    continue;
                }
            }

            let target = if desired.exists() && !same_path(&src, &desired) {
                match conflict.as_str() {
                    "skip" => {
                        // Its contents still counted towards `total`, so credit
                        // them now or the bar would never reach the end.
                        let (f, b) = measure(&src);
                        ctx.done += f;
                        ctx.bytes_done += b;
                        ctx.tick(&name.to_string_lossy(), true);
                        skipped += 1;
                        continue;
                    }
                    "overwrite" => {
                        if let Err(e) = remove_any(&desired) {
                            errors.push(format!("{}: {e}", name.to_string_lossy()));
                            continue;
                        }
                        desired
                    }
                    // "keepboth" and anything unexpected fall back to the
                    // non-destructive option.
                    _ => crate::fs::unique_target(&desired),
                }
            } else {
                crate::fs::unique_target(&desired)
            };

            let result = if moving {
                // Same volume: one rename does the whole subtree instantly, so
                // there's no per-file progress to report for it.
                match std::fs::rename(&src, &target) {
                    Ok(()) => {
                        let (f, b) = measure(&target);
                        ctx.done += f;
                        ctx.bytes_done += b;
                        ctx.tick(&name.to_string_lossy(), true);
                        Ok(())
                    }
                    Err(_) => copy_any(&mut ctx, &src, &target).and_then(|()| {
                        if ctx.cancelled() {
                            Ok(())
                        } else {
                            remove_any(&src)
                        }
                    }),
                }
            } else {
                copy_any(&mut ctx, &src, &target)
            };

            match result {
                Ok(()) => ok += 1,
                Err(e) => errors.push(format!("{}: {e}", name.to_string_lossy())),
            }
        }

        let cancelled = ctx.cancelled();
        if let Ok(mut m) = cancels().lock() {
            m.remove(&id);
        }
        let _ = app.emit(
            "transfer-done",
            Done { id, ok, skipped, cancelled, errors },
        );
    });
}
