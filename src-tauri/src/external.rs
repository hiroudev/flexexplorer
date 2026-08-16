//! Right-click integration with two external tools the user has installed
//! separately: TortoiseSVN (Subversion client) and WinMerge (diff/compare).
//! Neither ships with FlexExplorer — we only locate an existing install
//! (registry key it registers on setup, falling back to the conventional
//! Program Files path) and shell out to it with the selected path(s).

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct ExternalToolsStatus {
    #[serde(rename = "tortoiseSvn")]
    pub tortoise_svn: bool,
    pub winmerge: bool,
}

#[cfg(windows)]
mod win {
    use std::path::PathBuf;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Reads a REG_SZ value from HKLM as a String, or None if the key/value is absent.
    fn read_hklm_string(subkey: &str, name: &str) -> Option<String> {
        unsafe {
            let wsubkey = wide(subkey);
            let mut hkey = HKEY::default();
            if RegOpenKeyExW(HKEY_LOCAL_MACHINE, PCWSTR(wsubkey.as_ptr()), None, KEY_READ, &mut hkey)
                != ERROR_SUCCESS
            {
                return None;
            }
            let wname = wide(name);
            let mut len: u32 = 0;
            let sized = RegQueryValueExW(hkey, PCWSTR(wname.as_ptr()), None, None, None, Some(&mut len));
            let result = if sized == ERROR_SUCCESS && len > 0 {
                let mut buf = vec![0u8; len as usize];
                let mut len2 = len;
                if RegQueryValueExW(hkey, PCWSTR(wname.as_ptr()), None, None, Some(buf.as_mut_ptr()), Some(&mut len2))
                    == ERROR_SUCCESS
                {
                    let u16s: Vec<u16> = buf[..len2 as usize]
                        .chunks_exact(2)
                        .map(|c| u16::from_ne_bytes([c[0], c[1]]))
                        .collect();
                    Some(String::from_utf16_lossy(&u16s).trim_end_matches('\u{0}').to_string())
                } else {
                    None
                }
            } else {
                None
            };
            let _ = RegCloseKey(hkey);
            result
        }
    }

    /// TortoiseSVN's installer writes its own `bin\TortoiseProc.exe` path here.
    pub fn find_tortoise_proc() -> Option<PathBuf> {
        for key in ["SOFTWARE\\TortoiseSVN", "SOFTWARE\\WOW6432Node\\TortoiseSVN"] {
            if let Some(p) = read_hklm_string(key, "ProcPath") {
                let pb = PathBuf::from(p);
                if pb.is_file() {
                    return Some(pb);
                }
            }
        }
        for candidate in [
            r"C:\Program Files\TortoiseSVN\bin\TortoiseProc.exe",
            r"C:\Program Files (x86)\TortoiseSVN\bin\TortoiseProc.exe",
        ] {
            let pb = PathBuf::from(candidate);
            if pb.is_file() {
                return Some(pb);
            }
        }
        None
    }

    pub fn find_winmerge() -> Option<PathBuf> {
        for key in [
            "SOFTWARE\\Thingamahoochie\\WinMerge",
            "SOFTWARE\\WOW6432Node\\Thingamahoochie\\WinMerge",
        ] {
            if let Some(p) = read_hklm_string(key, "Executable") {
                let pb = PathBuf::from(p);
                if pb.is_file() {
                    return Some(pb);
                }
            }
        }
        for candidate in [
            r"C:\Program Files\WinMerge\WinMergeU.exe",
            r"C:\Program Files (x86)\WinMerge\WinMergeU.exe",
        ] {
            let pb = PathBuf::from(candidate);
            if pb.is_file() {
                return Some(pb);
            }
        }
        None
    }
}

#[cfg(not(windows))]
mod win {
    use std::path::PathBuf;
    pub fn find_tortoise_proc() -> Option<PathBuf> {
        None
    }
    pub fn find_winmerge() -> Option<PathBuf> {
        None
    }
}

fn find_tortoise_proc() -> Option<PathBuf> {
    win::find_tortoise_proc()
}

fn find_winmerge() -> Option<PathBuf> {
    win::find_winmerge()
}

/// Whether TortoiseSVN / WinMerge are installed on this machine — the
/// frontend uses this to hide the corresponding context-menu entries rather
/// than offering commands that would just fail.
#[tauri::command]
pub fn external_tools_status() -> ExternalToolsStatus {
    ExternalToolsStatus {
        tortoise_svn: find_tortoise_proc().is_some(),
        winmerge: find_winmerge().is_some(),
    }
}

/// Run a TortoiseSVN command (e.g. "commit", "update", "log", "diff") on one
/// or more paths, exactly as TortoiseSVN's own shell extension would.
/// Multiple paths are joined with `*`, the separator TortoiseProc expects.
#[tauri::command]
pub fn tortoise_svn_command(cmd: String, paths: Vec<String>) -> Result<(), String> {
    let exe = find_tortoise_proc().ok_or("TortoiseSVN が見つかりません")?;
    if paths.is_empty() {
        return Err("対象が選択されていません".into());
    }
    let joined = paths.join("*");
    spawn_detached(&exe, &[format!("/command:{cmd}"), format!("/path:\"{joined}\"")])
}

/// Open WinMerge to compare the given paths (2 → diff/folder-compare, 3 →
/// 3-way merge, 1 → WinMerge's own "Open" dialog picks the second side).
#[tauri::command]
pub fn winmerge_compare(paths: Vec<String>) -> Result<(), String> {
    let exe = find_winmerge().ok_or("WinMerge が見つかりません")?;
    if paths.is_empty() {
        return Err("対象が選択されていません".into());
    }
    spawn_detached(&exe, &paths)
}

fn spawn_detached(exe: &Path, args: &[String]) -> Result<(), String> {
    std::process::Command::new(exe)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
