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
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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
    /// Symlinks and junctions that were left out (see `is_link`).
    links: u32,
    cancelled: bool,
    /// One message per entry that failed; the transfer carries on past them.
    errors: Vec<String>,
    /// What became of each top-level entry, in the order given, so the
    /// frontend can show the whole outcome rather than the first error alone.
    items: Vec<Item>,
    /// Where the links that were left out are (at most `LINK_LIST_MAX`).
    #[serde(rename = "linkPaths")]
    link_paths: Vec<String>,
}

#[derive(Clone, Serialize)]
struct Item {
    name: String,
    /// "ok", "skipped", "failed", "partial" (cancelled half-way, or links left
    /// behind by a move) or "notrun" (cancelled before it was reached).
    result: &'static str,
    detail: String,
}

const LINK_LIST_MAX: usize = 200;

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
    if is_link(&md) {
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
///
/// Only *name-surrogate* reparse points count (what `FileType::is_symlink`
/// reports on Windows). Testing the raw reparse attribute instead also caught
/// OneDrive's Files On-Demand placeholders, which carry cloud reparse tags:
/// every such file was silently left out of a copy.
fn is_link(md: &std::fs::Metadata) -> bool {
    md.file_type().is_symlink()
}

/// Refuses to write through a link that already sits at `dst`. Copying into a
/// destination junction writes wherever it points — possibly back into the
/// source being moved, which the move then deletes.
fn refuse_link_at(dst: &Path) -> std::io::Result<()> {
    match std::fs::symlink_metadata(dst) {
        Ok(m) if is_link(&m) => Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!(
                "移動先の「{}」はリンク（ジャンクション）のため中止しました",
                dst.file_name().unwrap_or_default().to_string_lossy()
            ),
        )),
        _ => Ok(()),
    }
}

/// Inspect a pending transfer without performing it.
///
/// `async` so Tauri runs it off the main thread: measuring a large tree walks
/// every file, and doing that inline would freeze the window in exactly the
/// situation this module exists to keep responsive.
#[tauri::command]
pub async fn plan_transfer(paths: Vec<String>, dest_dir: String) -> Result<TransferPlan, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| e.to_string())?
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
    /// Links left out so far (see `is_link`).
    links: u64,
    link_paths: Vec<String>,
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

    /// Records a link that is being left out.
    fn skip_link(&mut self, p: &Path) {
        self.links += 1;
        if self.link_paths.len() < LINK_LIST_MAX {
            self.link_paths.push(p.to_string_lossy().to_string());
        }
        self.credit(1, 0, &p.file_name().unwrap_or_default().to_string_lossy());
    }
}

/// A scratch path next to `dst` that no other copy can pick. Beside it, rather
/// than in %TEMP%, so the final step is a rename on the same volume; short and
/// fixed-length, so a long destination name can't push it past 255 characters.
/// The process id and counter keep two transfers (another window, say) apart,
/// and the copy itself refuses to start if the name is somehow taken.
fn temp_beside(dst: &Path) -> PathBuf {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let dir = dst.parent().unwrap_or_else(|| Path::new("."));
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    dir.join(format!("~flx{:x}-{n:x}.tmp", std::process::id()))
}

/// Copies one file to `dst`, reporting progress and stopping if cancelled.
/// Returns whether the file was copied (false: cancelled).
///
/// The bytes go to a temporary file beside `dst`, which only becomes `dst`
/// once the whole copy has landed. Writing into `dst` directly would truncate
/// it on the first byte, so a cancelled or failed overwrite would destroy the
/// file it was meant to replace. With `replace` the finished copy replaces an
/// existing `dst`; without it, it refuses to — a name that was free when the
/// transfer chose it ("両方残す", or no collision at all) may have been taken
/// since, and must not be overwritten.
fn copy_file(ctx: &mut Ctx, src: &Path, dst: &Path, replace: bool) -> std::io::Result<bool> {
    // The scratch name is claimed by the copy itself, which refuses a name
    // that already exists (ERROR_FILE_EXISTS). Only a file this call created
    // is ever cleaned up below: a taken name — a leftover from a crash, or a
    // file that just happens to be called that — is skipped, never deleted.
    let mut tries = 0;
    let (tmp, copied) = loop {
        let tmp = temp_beside(dst);
        match copy_bytes(ctx, src, &tmp) {
            Err(e) if e.raw_os_error() == Some(80) => {
                tries += 1;
                if tries >= 16 {
                    return Err(e);
                }
            }
            r => break (tmp, r),
        }
    };
    let result = match copied {
        Ok(true) if replace => std::fs::rename(&tmp, dst).map(|_| true),
        Ok(true) => crate::fs::move_no_replace(&tmp, dst).map(|_| true),
        other => other,
    };
    if !matches!(result, Ok(true)) {
        let _ = std::fs::remove_file(&tmp);
    }
    if matches!(result, Ok(true)) {
        ctx.done += 1;
        ctx.tick(&src.file_name().unwrap_or_default().to_string_lossy(), false);
    }
    result
}

/// The byte copy itself. On Windows this is `CopyFileExW`, so alternate data
/// streams (including Zone.Identifier, the "downloaded from the internet"
/// mark), attributes and timestamps come along — a chunked read/write copy
/// dropped all of them, and a move across drives then deleted the originals.
#[cfg(windows)]
fn copy_bytes(ctx: &mut Ctx, src: &Path, tmp: &Path) -> std::io::Result<bool> {
    use std::ffi::c_void;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Storage::FileSystem::{
        CopyFileExW, COPYPROGRESSROUTINE_PROGRESS, COPY_FILE_FAIL_IF_EXISTS,
        LPPROGRESS_ROUTINE_CALLBACK_REASON, PROGRESS_CANCEL, PROGRESS_CONTINUE,
    };

    struct State<'a> {
        ctx: &'a mut Ctx,
        name: String,
        /// The callback reports a running total for this file; the bar wants
        /// what was added since the last call.
        last: u64,
    }

    unsafe extern "system" fn on_progress(
        _total: i64,
        _transferred: i64,
        _stream_size: i64,
        stream_transferred: i64,
        stream: u32,
        _reason: LPPROGRESS_ROUTINE_CALLBACK_REASON,
        _src: HANDLE,
        _dst: HANDLE,
        data: *const c_void,
    ) -> COPYPROGRESSROUTINE_PROGRESS {
        let st = &mut *(data as *mut State);
        // The main stream only (stream 1). The bar's total was measured from
        // file sizes, so counting alternate streams on top pushed it past 100%.
        if stream == 1 {
            let now = stream_transferred.max(0) as u64;
            st.ctx.bytes_done += now.saturating_sub(st.last);
            st.last = now;
            st.ctx.tick(&st.name, false);
        }
        if st.ctx.cancelled() { PROGRESS_CANCEL } else { PROGRESS_CONTINUE }
    }

    let mut st = State { ctx, name: src.file_name().unwrap_or_default().to_string_lossy().to_string(), last: 0 };
    let (ws, wt) = (crate::fs::wide_path(src), crate::fs::wide_path(tmp));
    let r = unsafe {
        CopyFileExW(
            PCWSTR(ws.as_ptr()),
            PCWSTR(wt.as_ptr()),
            Some(Some(on_progress)),
            Some(&mut st as *mut State as *const c_void),
            None,
            COPY_FILE_FAIL_IF_EXISTS,
        )
    };
    match r {
        Ok(()) => Ok(true),
        // PROGRESS_CANCEL ends the copy with ERROR_REQUEST_ABORTED and the
        // half-written file already removed.
        Err(_) if st.ctx.cancelled() => Ok(false),
        Err(e) => Err(std::io::Error::from_raw_os_error((e.code().0 as u32 & 0xFFFF) as i32)),
    }
}

#[cfg(not(windows))]
fn copy_bytes(ctx: &mut Ctx, src: &Path, tmp: &Path) -> std::io::Result<bool> {
    if ctx.cancelled() {
        return Ok(false);
    }
    ctx.bytes_done += std::fs::copy(src, tmp)?;
    Ok(true)
}

/// Copies a file or a whole folder, stopping early if cancellation is
/// requested. With `replace`, existing files at the destination are replaced
/// and existing folders merged into, which is what "上書き" has to mean for a
/// folder — deleting the destination folder first would take unrelated files
/// with it. Links are left out and counted in `ctx.links`.
fn copy_any(ctx: &mut Ctx, src: &Path, dst: &Path, replace: bool) -> std::io::Result<()> {
    if ctx.cancelled() {
        return Ok(());
    }
    let md = std::fs::symlink_metadata(src)?;
    if is_link(&md) {
        // Copying through a junction would pull in whatever it points at.
        ctx.skip_link(src);
        return Ok(());
    }
    refuse_link_at(dst)?;
    if md.is_dir() {
        std::fs::create_dir_all(dst)?;
        for e in std::fs::read_dir(src)? {
            if ctx.cancelled() {
                return Ok(());
            }
            let e = e?;
            copy_any(ctx, &e.path(), &dst.join(e.file_name()), replace)?;
        }
    } else {
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent)?;
        }
        copy_file(ctx, src, dst, replace)?;
    }
    Ok(())
}

/// Moves a file or folder one entry at a time: rename where the volume allows
/// it, otherwise copy and then delete *that* file. Deleting the whole source
/// tree only at the very end lost any file edited after it had been copied,
/// and a failure or cancel half-way through is now always consistent — each
/// file is either still at the source or already at the destination.
///
/// Links stay at the source (counted in `ctx.links`), and so does any folder
/// that still holds something afterwards.
fn move_tree(ctx: &mut Ctx, src: &Path, dst: &Path, replace: bool) -> std::io::Result<()> {
    if ctx.cancelled() {
        return Ok(());
    }
    let md = std::fs::symlink_metadata(src)?;
    let name = src.file_name().unwrap_or_default().to_string_lossy().to_string();
    if is_link(&md) {
        ctx.skip_link(src);
        return Ok(());
    }
    refuse_link_at(dst)?;

    if md.is_dir() {
        // A whole subtree that has nowhere to merge into moves in one step.
        if !dst.exists() && crate::fs::move_no_replace(src, dst).is_ok() {
            let (f, b) = measure(dst);
            ctx.credit(f, b, &name);
            return Ok(());
        }
        std::fs::create_dir_all(dst)?;
        for e in std::fs::read_dir(src)? {
            if ctx.cancelled() {
                return Ok(());
            }
            let e = e?;
            move_tree(ctx, &e.path(), &dst.join(e.file_name()), replace)?;
        }
        if !ctx.cancelled() {
            // Fails, leaving the folder in place, when a link or anything that
            // couldn't be moved is still inside — which is the point.
            let _ = std::fs::remove_dir(src);
        }
        return Ok(());
    }

    let renamed = if replace { std::fs::rename(src, dst) } else { crate::fs::move_no_replace(src, dst) };
    if renamed.is_ok() {
        ctx.credit(1, md.len(), &name);
        return Ok(());
    }
    if !copy_file(ctx, src, dst, replace)? {
        return Ok(()); // cancelled: the source is untouched
    }
    // Edited while it was being copied: the copy is already stale, so the
    // source has to stay.
    let after = std::fs::symlink_metadata(src)?;
    if after.len() != md.len() || after.modified().ok() != md.modified().ok() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("「{name}」がコピー中に更新されたため、移動元に残しました"),
        ));
    }
    let mut perms = after.permissions();
    if perms.readonly() {
        // Windows refuses to delete a read-only file.
        perms.set_readonly(false);
        let _ = std::fs::set_permissions(src, perms);
    }
    std::fs::remove_file(src)
}

/// Emits `transfer-done` when it goes out of scope.
///
/// The frontend refuses to start another transfer while one is in flight, so
/// a thread that returned early without reporting would leave the app unable
/// to copy anything until restarted. (Release builds abort on panic, so this
/// covers early returns, not panics.)
struct DoneGuard {
    app: AppHandle,
    id: String,
    ok: u32,
    skipped: u32,
    links: u32,
    cancelled: bool,
    errors: Vec<String>,
    items: Vec<Item>,
    link_paths: Vec<String>,
}

impl DoneGuard {
    fn record(&mut self, name: &str, result: &'static str, detail: String) {
        match result {
            "ok" => self.ok += 1,
            "skipped" => self.skipped += 1,
            "failed" | "partial" => self.errors.push(format!("{name}: {detail}")),
            _ => {}
        }
        self.items.push(Item { name: name.to_string(), result, detail });
    }
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
                links: self.links,
                cancelled: self.cancelled,
                errors: std::mem::take(&mut self.errors),
                items: std::mem::take(&mut self.items),
                link_paths: std::mem::take(&mut self.link_paths),
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
    let cancel = Arc::new(AtomicBool::new(false));
    with_cancels(|m| m.insert(id.clone(), cancel.clone()));

    // Everything that touches the disk — even checking the destination —
    // happens on the thread: this command itself runs on the main thread,
    // and on a slow network share those checks alone froze the window.
    std::thread::spawn(move || {
        let mut guard = DoneGuard {
            app: app.clone(),
            id: id.clone(),
            ok: 0,
            skipped: 0,
            links: 0,
            cancelled: false,
            errors: Vec::new(),
            items: Vec::new(),
            link_paths: Vec::new(),
        };
        if !dest.is_dir() {
            for p in &paths {
                guard.record(p, "failed", format!("移動先が見つかりません: {dest_dir}"));
            }
            return;
        }
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
            links: 0,
            link_paths: Vec::new(),
            last_emit: std::time::Instant::now(),
        };
        ctx.tick("", true);

        for (i, p) in paths.iter().enumerate() {
            if ctx.cancelled() {
                // Said per entry, so "中止" doesn't read as "some of it failed".
                for rest in &paths[i..] {
                    let n = Path::new(rest).file_name().map_or(rest.clone(), |n| n.to_string_lossy().to_string());
                    guard.record(&n, "notrun", "中止したため実行していません".into());
                }
                break;
            }
            let (files, bytes) = sizes[i];
            let src = PathBuf::from(p);
            let name = match src.file_name() {
                Some(n) => n.to_os_string(),
                None => {
                    guard.record(p, "failed", "名前を取得できません".into());
                    ctx.credit(files, bytes, "");
                    continue;
                }
            };
            let label = name.to_string_lossy().to_string();
            if let Err(e) = check_not_inside(&src, &dest) {
                guard.record(&label, "failed", e);
                ctx.credit(files, bytes, &label);
                continue;
            }
            let desired = dest.join(&name);

            // Landing where it already is: nothing to do when moving; when
            // copying, this has to become a numbered duplicate.
            let onto_itself = crate::fs::same_entry(&src, &desired);
            if moving && onto_itself {
                guard.record(&label, "skipped", "移動先が今の場所と同じです".into());
                ctx.credit(files, bytes, &label);
                continue;
            }

            // `onto_itself` counts as a collision for a copy. Treating it as
            // "no collision" would send the copy to the source's own path, and
            // the first write would truncate the file being copied — Ctrl+C
            // then Ctrl+V in the same folder would empty it.
            let collides = onto_itself || desired.exists();
            let overwrite = collides && !onto_itself && conflict == "overwrite";
            if collides && conflict == "skip" {
                guard.record(&label, "skipped", "同じ名前があるためスキップしました".into());
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
                        guard.record(&label, "failed", "名前を変えて保存できません".into());
                        ctx.credit(files, bytes, &label);
                        continue;
                    }
                }
            } else {
                desired
            };

            let (done_before, bytes_before, links_before) = (ctx.done, ctx.bytes_done, ctx.links);
            let result = if moving {
                move_tree(&mut ctx, &src, &target, overwrite)
            } else {
                copy_any(&mut ctx, &src, &target, overwrite)
            };
            let left_links = ctx.links - links_before;

            // "両方残す" saves under another name. Said for every outcome: after
            // a failure or a cancel, that name is where the part already
            // written has to be looked for.
            let saved_as = target
                .file_name()
                .filter(|n| *n != name.as_os_str())
                .map_or(String::new(), |n| format!("「{}」として保存", n.to_string_lossy()));
            let with_name = |msg: String| if saved_as.is_empty() { msg } else { format!("{saved_as}・{msg}") };
            match result {
                // Copy/move return Ok when they stop for a cancel, so an entry
                // that was cut short must not be counted as done. An entry
                // with no files at all (empty folders) can't tell from the
                // count, so a cancel during it counts as cut short.
                Ok(()) if ctx.cancelled() && (files == 0 || ctx.done - done_before < files) => {
                    guard.record(&label, "partial", with_name("途中で中止しました".into()))
                }
                Ok(()) if moving && left_links > 0 => guard.record(
                    &label,
                    "partial",
                    with_name(format!("リンクを{left_links}件移動できないため、移動元に残しました")),
                ),
                Ok(()) => guard.record(&label, "ok", saved_as.clone()),
                Err(e) => {
                    guard.record(&label, "failed", with_name(e.to_string()));
                    // Credit whatever is left of this entry so the bar still
                    // finishes; part of it may already have been counted.
                    let (counted, counted_bytes) = (ctx.done - done_before, ctx.bytes_done - bytes_before);
                    ctx.credit(files.saturating_sub(counted), bytes.saturating_sub(counted_bytes), &label);
                }
            }
        }

        guard.links = ctx.links as u32;
        guard.link_paths = std::mem::take(&mut ctx.link_paths);
        guard.cancelled = ctx.cancelled();
        if guard.cancelled {
            ctx.tick("", true);
        }
        // guard drops here and emits transfer-done, whatever happened above.
    });

    Ok(())
}
