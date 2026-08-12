//! Reads Windows' own `HKEY_CLASSES_ROOT\.<ext>\ShellNew` registry key —
//! the exact place Explorer looks up when it builds its right-click "New"
//! submenu — so that "New > Excel Worksheet" etc. produce a byte-for-byte
//! copy of the blank template Office itself registered, instead of us
//! fabricating an empty file. A 0-byte .xlsx/.docx/.pptx is not a valid
//! Office Open XML package, so guessing at bytes here would just hand the
//! user a file their own Office refuses to open — reading the real
//! template is the only approach that's actually correct.
//!
//! `ShellNew` may point to the template in one of a few ways; we support
//! the two that matter for Office file types:
//!   - `FileName` (REG_SZ/REG_EXPAND_SZ): path to a template file to copy.
//!   - `Data` (REG_BINARY): the literal bytes to write.
//! (`NullFile`, used by plain-text-ish formats, is handled by the caller
//! directly with `std::fs::write(path, [])` — no registry lookup needed.)

#[cfg(windows)]
pub fn read_template(ext: &str) -> Option<Vec<u8>> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CLASSES_ROOT, KEY_READ, REG_SZ,
        REG_EXPAND_SZ, REG_BINARY, REG_VALUE_TYPE,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Reads a registry value of any of `REG_SZ`/`REG_EXPAND_SZ`/`REG_BINARY`
    /// as raw bytes, sizing the buffer with a first no-data query (the
    /// standard two-call Win32 registry pattern) rather than guessing.
    unsafe fn read_value(hkey: HKEY, name: &str) -> Option<(REG_VALUE_TYPE, Vec<u8>)> {
        let wname = wide(name);
        let mut kind = REG_VALUE_TYPE(0);
        let mut len: u32 = 0;
        if RegQueryValueExW(hkey, PCWSTR(wname.as_ptr()), None, Some(&mut kind), None, Some(&mut len))
            != ERROR_SUCCESS
        {
            return None;
        }
        let mut buf = vec![0u8; len as usize];
        let mut len2 = len;
        if RegQueryValueExW(
            hkey,
            PCWSTR(wname.as_ptr()),
            None,
            Some(&mut kind),
            Some(buf.as_mut_ptr()),
            Some(&mut len2),
        ) != ERROR_SUCCESS
        {
            return None;
        }
        buf.truncate(len2 as usize);
        Some((kind, buf))
    }

    fn utf16_bytes_to_string(bytes: &[u8]) -> String {
        let u16s: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_ne_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&u16s)
            .trim_end_matches('\u{0}')
            .to_string()
    }

    unsafe {
        let subkey = wide(&format!(".{ext}\\ShellNew"));
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(HKEY_CLASSES_ROOT, PCWSTR(subkey.as_ptr()), None, KEY_READ, &mut hkey)
            != ERROR_SUCCESS
        {
            return None;
        }

        let result = (|| {
            if let Some((kind, bytes)) = read_value(hkey, "FileName") {
                if kind == REG_SZ || kind == REG_EXPAND_SZ {
                    let raw = utf16_bytes_to_string(&bytes);
                    let expanded = expand_env(&raw);
                    if let Ok(data) = std::fs::read(&expanded) {
                        return Some(data);
                    }
                }
            }
            if let Some((kind, bytes)) = read_value(hkey, "Data") {
                if kind == REG_BINARY {
                    return Some(bytes);
                }
            }
            None
        })();

        let _ = RegCloseKey(hkey);
        result
    }
}

#[cfg(windows)]
fn expand_env(s: &str) -> String {
    // Registry FileName values occasionally use %VAR% placeholders
    // (e.g. %ProgramFiles%); substitute from the process environment.
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if let Some(end) = s[i + 1..].find('%') {
                let var = &s[i + 1..i + 1 + end];
                if let Ok(val) = std::env::var(var) {
                    out.push_str(&val);
                    i = i + 1 + end + 1;
                    continue;
                }
            }
        }
        let ch = s[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

#[cfg(not(windows))]
pub fn read_template(_ext: &str) -> Option<Vec<u8>> {
    None
}
