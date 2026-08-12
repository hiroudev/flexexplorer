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
}
