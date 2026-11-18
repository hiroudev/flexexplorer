//! Files on the OS clipboard (CF_HDROP), so copy/cut/paste works both ways
//! with Explorer and with any other app that copies files the same way
//! (Everything, Total Commander, …).

use serde::Serialize;

#[derive(Serialize)]
pub struct ClipFiles {
    /// Empty when the clipboard holds no files (text, an image, nothing).
    pub paths: Vec<String>,
    /// The source marked it as a cut ("Preferred DropEffect" = MOVE).
    pub cut: bool,
    /// GetClipboardSequenceNumber() — used only to notice that the clipboard
    /// changed since our own copy, never as proof of what it holds.
    pub seq: u32,
}

#[tauri::command]
pub fn clipboard_read_files() -> Result<ClipFiles, String> {
    #[cfg(windows)]
    {
        win::read()
    }
    #[cfg(not(windows))]
    {
        Err("unsupported".into())
    }
}

/// Puts `paths` on the clipboard as files; an empty list just empties it.
/// Returns the clipboard's sequence number afterwards.
#[tauri::command]
pub fn clipboard_write_files(window: tauri::WebviewWindow, paths: Vec<String>, cut: bool) -> Result<u32, String> {
    #[cfg(windows)]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        win::write(windows::Win32::Foundation::HWND(hwnd.0), &paths, cut)
    }
    #[cfg(not(windows))]
    {
        let _ = (window, paths, cut);
        Err("unsupported".into())
    }
}

/// A DROPFILES header followed by the paths as UTF-16, each NUL-terminated,
/// and one more NUL to end the list.
fn hdrop_bytes(paths: &[String]) -> Vec<u8> {
    const HEADER: u32 = 20; // DROPFILES: pFiles, pt.x, pt.y, fNC, fWide
    let mut b = Vec::new();
    b.extend_from_slice(&HEADER.to_le_bytes()); // pFiles: the list starts right after
    b.extend_from_slice(&[0u8; 12]); // pt, fNC
    b.extend_from_slice(&1u32.to_le_bytes()); // fWide: UTF-16
    for p in paths {
        // Other apps expect backslashes; our paths normally have them already.
        for u in p.replace('/', "\\").encode_utf16().chain(Some(0)) {
            b.extend_from_slice(&u.to_le_bytes());
        }
    }
    b.extend_from_slice(&[0, 0]);
    b
}

#[cfg(windows)]
mod win {
    use super::ClipFiles;
    use windows::core::w;
    use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber, OpenClipboard,
        RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::{CF_HDROP, DROPEFFECT_MOVE};
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};

    /// Closes the clipboard on every way out.
    struct Opened;
    impl Drop for Opened {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseClipboard();
            }
        }
    }

    /// Another app may be holding the clipboard: retry briefly, then give up.
    /// Kept short — sync commands run on the main thread.
    fn open(hwnd: Option<HWND>) -> Result<Opened, String> {
        for _ in 0..5 {
            if unsafe { OpenClipboard(hwnd) }.is_ok() {
                return Ok(Opened);
            }
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
        Err("クリップボードを開けません（他のアプリが使用中）".into())
    }

    fn drop_effect_format() -> u32 {
        unsafe { RegisterClipboardFormatW(w!("Preferred DropEffect")) }
    }

    pub fn read() -> Result<ClipFiles, String> {
        let _open = open(None)?;
        let mut out = ClipFiles { paths: Vec::new(), cut: false, seq: unsafe { GetClipboardSequenceNumber() } };
        unsafe {
            let Ok(h) = GetClipboardData(CF_HDROP.0 as u32) else { return Ok(out) };
            let hdrop = HDROP(h.0);
            let n = DragQueryFileW(hdrop, u32::MAX, None);
            for i in 0..n {
                let len = DragQueryFileW(hdrop, i, None) as usize;
                let mut buf = vec![0u16; len + 1];
                let got = DragQueryFileW(hdrop, i, Some(&mut buf)) as usize;
                if got > 0 {
                    out.paths.push(String::from_utf16_lossy(&buf[..got]));
                }
            }
            if let Ok(h) = GetClipboardData(drop_effect_format()) {
                let g = HGLOBAL(h.0);
                let p = GlobalLock(g) as *const u32;
                if !p.is_null() {
                    // Exactly MOVE: anything that also allows copying is treated as a copy.
                    out.cut = p.read_unaligned() == DROPEFFECT_MOVE.0;
                    let _ = GlobalUnlock(g);
                }
            }
        }
        Ok(out)
    }

    pub fn write(hwnd: HWND, paths: &[String], cut: bool) -> Result<u32, String> {
        {
            let _open = open(Some(hwnd))?;
            unsafe {
                EmptyClipboard().map_err(|e| e.to_string())?;
                if !paths.is_empty() {
                    set(CF_HDROP.0 as u32, &super::hdrop_bytes(paths))?;
                    if cut {
                        set(drop_effect_format(), &DROPEFFECT_MOVE.0.to_le_bytes())?;
                    }
                }
            }
        }
        Ok(unsafe { GetClipboardSequenceNumber() })
    }

    /// Copies `data` into global memory and hands it to the clipboard. Once
    /// SetClipboardData succeeds the system owns the memory; it is freed here
    /// only when that fails.
    unsafe fn set(format: u32, data: &[u8]) -> Result<(), String> {
        let g = GlobalAlloc(GMEM_MOVEABLE, data.len()).map_err(|e| e.to_string())?;
        let p = GlobalLock(g) as *mut u8;
        if p.is_null() {
            let _ = GlobalFree(Some(g));
            return Err("GlobalLock に失敗しました".into());
        }
        std::ptr::copy_nonoverlapping(data.as_ptr(), p, data.len());
        let _ = GlobalUnlock(g);
        if let Err(e) = SetClipboardData(format, Some(HANDLE(g.0))) {
            let _ = GlobalFree(Some(g));
            return Err(e.to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::hdrop_bytes;

    #[test]
    fn hdrop_layout() {
        let b = hdrop_bytes(&["C:\\a".into(), "\\\\srv/share\\é".into()]);
        #[cfg(windows)]
        assert_eq!(std::mem::size_of::<windows::Win32::UI::Shell::DROPFILES>(), 20);
        assert_eq!(&b[0..4], &20u32.to_le_bytes());
        assert_eq!(&b[16..20], &1u32.to_le_bytes());
        let units: Vec<u16> = b[20..].chunks(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        let expect: Vec<u16> = "C:\\a\0\\\\srv\\share\\é\0\0".encode_utf16().collect();
        assert_eq!(units, expect);
    }
}
