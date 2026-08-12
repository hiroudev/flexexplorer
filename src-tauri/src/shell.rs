//! Native Windows shell verbs/dialogs so the app's context menu can reuse
//! Explorer's real behaviour (Properties dialog, "Open with", shortcut, …).

/// Invoke a shell verb on a path (e.g. "properties", "openas").
#[tauri::command]
pub fn shell_verb(path: String, verb: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        win::shell_verb(&path, &verb)
    }
    #[cfg(not(windows))]
    {
        let _ = (path, verb);
        Err("shell verbs are only available on Windows".into())
    }
}

/// Creates a plain `.txt` "shortcut" next to `target`: a one-line text file
/// named `<name>へのショートカット.txt` containing `target`'s absolute path.
/// This exists as a fallback for items a real `.lnk` shortcut can't
/// reliably point at (e.g. some cloud-sync-provider folders don't resolve
/// correctly through a normal Windows shortcut) — it's not a functional
/// shortcut (double-clicking it won't navigate anywhere), just the path
/// recorded as text so it can be copied/pasted into the address bar.
#[tauri::command]
pub fn create_path_shortcut_text(target: String) -> Result<String, String> {
    let tpath = std::path::Path::new(&target);
    let dir = tpath.parent().ok_or("親フォルダを取得できません")?;
    let name = tpath
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "item".into());
    let file = crate::fs::unique_target(&dir.join(format!("{name}へのショートカット.txt")));
    std::fs::write(&file, &target).map_err(|e| e.to_string())?;
    Ok(file.to_string_lossy().to_string())
}

/// Duplicate a file into the same folder as
/// `<stem>_<YYYYMMDD>_<NN><ext>`, where `NN` is the smallest 2-digit
/// counter (01, 02, …) that doesn't collide with an existing file — reusing
/// this on the same day just keeps incrementing instead of overwriting the
/// previous dated copy. Folders are rejected: a recursive folder copy is a
/// different, heavier operation than this "quick dated snapshot" is for.
/// (Mirrors FlexFind's `duplicate_as_dated_copy` command.)
#[tauri::command]
pub fn duplicate_as_dated_copy(path: String) -> Result<String, String> {
    let src = std::path::Path::new(&path);
    if !src.is_file() {
        return Err("フォルダは複製できません".into());
    }
    let dir = src.parent().ok_or("親フォルダを取得できません")?;
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = src.extension().and_then(|s| s.to_str());
    let date = chrono::Local::now().format("%Y%m%d").to_string();

    for n in 1..=99u32 {
        let candidate_name = match ext {
            Some(e) => format!("{stem}_{date}_{n:02}.{e}"),
            None => format!("{stem}_{date}_{n:02}"),
        };
        let candidate = dir.join(&candidate_name);
        if !candidate.exists() {
            std::fs::copy(src, &candidate).map_err(|e| e.to_string())?;
            return Ok(candidate.to_string_lossy().to_string());
        }
    }
    Err("同名候補が上限(99件/日)に達しました".into())
}

/// Create a `.lnk` shortcut to `target` in its own folder. Returns the path.
#[tauri::command]
pub fn create_shortcut(target: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        win::create_shortcut(&target)
    }
    #[cfg(not(windows))]
    {
        let _ = target;
        Err("shortcuts are only available on Windows".into())
    }
}

/// Reveal a path in Explorer with it selected.
#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{path}"))
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("unsupported".into())
    }
}

/// Open a terminal at `dir` (Windows Terminal, falling back to cmd).
#[tauri::command]
pub fn open_in_terminal(dir: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        if std::process::Command::new("wt.exe").args(["-d", &dir]).spawn().is_err() {
            std::process::Command::new("cmd")
                .args(["/C", "start", "cmd", "/K", "cd", "/D", &dir])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = dir;
        Err("unsupported".into())
    }
}

/// Pops up the *real* OS shell context menu for `path` at screen position
/// `(x, y)` and invokes whichever item the user picks — the same menu
/// Explorer itself shows, which means it includes every registered shell
/// extension (Box, OneDrive, 7-Zip, "Send to", antivirus scan entries,
/// etc.), not just what FlexExplorer's own menu implements. We don't (and
/// can't reasonably) reimplement every third-party shell extension
/// ourselves; this delegates straight to the OS via `IContextMenu`
/// (`QueryContextMenu` builds the menu, `InvokeCommand` runs the choice).
#[tauri::command]
pub fn show_shell_context_menu(window: tauri::WebviewWindow, path: String, x: i32, y: i32) -> Result<(), String> {
    #[cfg(windows)]
    {
        win::show_shell_context_menu(&window, &path, x, y)
    }
    #[cfg(not(windows))]
    {
        let _ = (window, path, x, y);
        Err("shell context menu is only available on Windows".into())
    }
}

/// Open a path in VS Code (resolves the `code` shim via cmd).
#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "code", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("unsupported".into())
    }
}

#[cfg(windows)]
mod win {
    use std::path::{Path, PathBuf};
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        IShellLinkW, ShellExecuteExW, ShellLink, SEE_MASK_INVOKEIDLIST, SHELLEXECUTEINFOW,
    };
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn shell_verb(path: &str, verb: &str) -> Result<(), String> {
        let wpath = wide(path);
        let wverb = wide(verb);
        let mut info = SHELLEXECUTEINFOW::default();
        info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        info.fMask = SEE_MASK_INVOKEIDLIST;
        info.lpVerb = PCWSTR(wverb.as_ptr());
        info.lpFile = PCWSTR(wpath.as_ptr());
        info.nShow = SW_SHOWNORMAL.0;
        unsafe { ShellExecuteExW(&mut info).map_err(|e| e.to_string()) }
    }

    fn unique_lnk(dir: &Path, stem: &str) -> PathBuf {
        let first = dir.join(format!("{stem} - ショートカット.lnk"));
        if !first.exists() {
            return first;
        }
        for i in 2..1000 {
            let c = dir.join(format!("{stem} - ショートカット ({i}).lnk"));
            if !c.exists() {
                return c;
            }
        }
        first
    }

    pub fn create_shortcut(target: &str) -> Result<String, String> {
        let tpath = PathBuf::from(target);
        let dir = tpath.parent().ok_or("invalid target")?.to_path_buf();
        let stem = tpath
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "shortcut".into());
        let lnk = unique_lnk(&dir, &stem);

        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let result = (|| -> Result<String, String> {
                let link: IShellLinkW =
                    CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
                let wtarget = wide(target);
                link.SetPath(PCWSTR(wtarget.as_ptr())).map_err(|e| e.to_string())?;
                let wdir = wide(&dir.to_string_lossy());
                let _ = link.SetWorkingDirectory(PCWSTR(wdir.as_ptr()));
                let persist: IPersistFile = link.cast().map_err(|e| e.to_string())?;
                let wlnk = wide(&lnk.to_string_lossy());
                persist.Save(PCWSTR(wlnk.as_ptr()), true).map_err(|e| e.to_string())?;
                Ok(lnk.to_string_lossy().to_string())
            })();
            CoUninitialize();
            result
        }
    }

    /// Shows the OS's own shell context menu for `path` — the exact menu
    /// Explorer would show, built by whatever shell-extension DLLs are
    /// registered on this machine (Box, OneDrive, 7-Zip, "Send to", …) —
    /// and runs whichever item the user picks.
    pub fn show_shell_context_menu(
        window: &tauri::WebviewWindow,
        path: &str,
        x: i32,
        y: i32,
    ) -> Result<(), String> {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::System::Com::IBindCtx;
        use windows::Win32::UI::Shell::{
            IContextMenu, IShellFolder, SHBindToParent, SHParseDisplayName,
            CMF_EXPLORE, CMF_NORMAL, CMINVOKECOMMANDINFO,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            CreatePopupMenu, DestroyMenu, SetForegroundWindow, TrackPopupMenuEx,
            HMENU, TPM_LEFTALIGN, TPM_RETURNCMD, TPM_RIGHTBUTTON,
        };

        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = HWND(hwnd.0);

        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

            let wpath = wide(path);
            let mut pidl = std::ptr::null_mut();
            let parse_result =
                SHParseDisplayName(PCWSTR(wpath.as_ptr()), None as Option<&IBindCtx>, &mut pidl, 0, None);

            let result = (|| -> Result<(), String> {
                parse_result.map_err(|e| e.to_string())?;
                if pidl.is_null() {
                    return Err("パスを解決できません".into());
                }

                let mut child_pidl = std::ptr::null_mut();
                let parent: IShellFolder =
                    SHBindToParent(pidl, Some(&mut child_pidl)).map_err(|e| e.to_string())?;

                let context_menu: IContextMenu = parent
                    .GetUIObjectOf(hwnd, &[child_pidl as *const _], None)
                    .map_err(|e| e.to_string())?;

                let menu: HMENU = CreatePopupMenu().map_err(|e| e.to_string())?;
                context_menu
                    .QueryContextMenu(menu, 0, 1, 0x7FFF, CMF_NORMAL | CMF_EXPLORE)
                    .ok()
                    .map_err(|e| e.to_string())?;

                let _ = SetForegroundWindow(hwnd);
                let cmd = TrackPopupMenuEx(
                    menu,
                    (TPM_RETURNCMD | TPM_LEFTALIGN | TPM_RIGHTBUTTON).0,
                    x,
                    y,
                    hwnd,
                    None,
                );

                if cmd.0 > 0 {
                    let mut info = CMINVOKECOMMANDINFO::default();
                    info.cbSize = std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32;
                    info.hwnd = hwnd;
                    info.lpVerb = windows::core::PCSTR((cmd.0 - 1) as *const u8);
                    info.nShow = windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL.0;
                    let _ = context_menu.InvokeCommand(&info);
                }

                let _ = DestroyMenu(menu);
                Ok(())
            })();

            // `pidl` was allocated by the shell task allocator (SHParseDisplayName);
            // it's our responsibility to free it, regardless of outcome. `child_pidl`
            // is NOT a separate allocation — SHBindToParent points it at a location
            // inside `pidl`'s own buffer, so it must not be freed on its own.
            if !pidl.is_null() {
                windows::Win32::System::Com::CoTaskMemFree(Some(pidl as *const _));
            }
            CoUninitialize();
            result
        }
    }
}
