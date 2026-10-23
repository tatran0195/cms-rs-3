use std::path::Path;

/// Adds `target` to a semicolon-separated Windows PATH string if not already present.
/// Comparison is case-insensitive and ignores trailing slashes.
pub fn add_to_path_string(original: &str, target: &str) -> String {
    let clean_target = target.trim().trim_end_matches(['\\', '/']);
    if clean_target.is_empty() {
        return original.to_string();
    }

    let exists = original.split(';').any(|part| {
        let clean_part = part.trim().trim_end_matches(['\\', '/']);
        clean_part.eq_ignore_ascii_case(clean_target)
    });

    if exists {
        original.to_string()
    } else if original.trim().is_empty() {
        clean_target.to_string()
    } else {
        let trimmed = original.trim_end_matches(';');
        format!("{trimmed};{clean_target}")
    }
}

/// Removes `target` from a semicolon-separated Windows PATH string if present.
/// Comparison is case-insensitive and ignores trailing slashes.
pub fn remove_from_path_string(original: &str, target: &str) -> String {
    let clean_target = target.trim().trim_end_matches(['\\', '/']);
    if clean_target.is_empty() {
        return original.to_string();
    }

    let parts: Vec<&str> = original
        .split(';')
        .filter(|part| {
            let clean_part = part.trim().trim_end_matches(['\\', '/']);
            !clean_part.is_empty() && !clean_part.eq_ignore_ascii_case(clean_target)
        })
        .collect();

    parts.join(";")
}

#[cfg(windows)]
mod native {
    use super::*;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_EXPAND_SZ};
    use winreg::{RegKey, RegValue};

    pub fn install_user_path(bin_dir: &Path) -> anyhow::Result<bool> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let env_key = hkcu.open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)?;

        let current_path: String = env_key.get_value("Path").unwrap_or_default();
        let target_str = bin_dir.to_str().ok_or_else(|| {
            anyhow::anyhow!("Binary directory contains invalid UTF-8 characters")
        })?;

        let updated_path = add_to_path_string(&current_path, target_str);
        if updated_path == current_path {
            return Ok(false);
        }

        let wide_chars: Vec<u8> = OsStr::new(&updated_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .flat_map(|w| w.to_le_bytes())
            .collect();

        let val = RegValue {
            vtype: REG_EXPAND_SZ,
            bytes: wide_chars,
        };
        env_key.set_raw_value("Path", &val)?;
        let _ = broadcast_environment_change();
        Ok(true)
    }

    pub fn uninstall_user_path(bin_dir: &Path) -> anyhow::Result<bool> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let env_key = hkcu.open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)?;

        let current_path: String = env_key.get_value("Path").unwrap_or_default();
        let target_str = bin_dir.to_str().ok_or_else(|| {
            anyhow::anyhow!("Binary directory contains invalid UTF-8 characters")
        })?;

        let updated_path = remove_from_path_string(&current_path, target_str);
        if updated_path == current_path {
            return Ok(false);
        }

        let wide_chars: Vec<u8> = OsStr::new(&updated_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .flat_map(|w| w.to_le_bytes())
            .collect();

        let val = RegValue {
            vtype: REG_EXPAND_SZ,
            bytes: wide_chars,
        };
        env_key.set_raw_value("Path", &val)?;
        let _ = broadcast_environment_change();
        Ok(true)
    }

    pub fn register_protocol_handler(exe_path: &Path) -> anyhow::Result<()> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (proto_key, _) = hkcu.create_subkey(r"Software\Classes\cms-doc")?;
        proto_key.set_value("", &"URL:CMS Documentation Protocol")?;
        proto_key.set_value("URL Protocol", &"")?;

        let (cmd_key, _) = proto_key.create_subkey(r"shell\open\command")?;
        let cmd_val = format!("\"{}\" open \"%1\"", exe_path.display());
        cmd_key.set_value("", &cmd_val)?;
        Ok(())
    }

    pub fn unregister_protocol_handler() -> anyhow::Result<()> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(classes) = hkcu.open_subkey_with_flags(r"Software\Classes", KEY_WRITE) {
            let _ = classes.delete_subkey_all("cms-doc");
        }
        Ok(())
    }

    pub fn broadcast_environment_change() -> anyhow::Result<()> {
        use windows_sys::Win32::Foundation::LPARAM;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
        };

        let env_param: Vec<u16> = OsStr::new("Environment")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut result: usize = 0;
        unsafe {
            SendMessageTimeoutW(
                HWND_BROADCAST as _,
                WM_SETTINGCHANGE,
                0,
                env_param.as_ptr() as LPARAM,
                SMTO_ABORTIFHUNG,
                5000,
                &mut result as *mut usize as _,
            );
        }
        Ok(())
    }
}

#[cfg(windows)]
pub use native::*;

#[cfg(not(windows))]
pub fn install_user_path(_bin_dir: &Path) -> anyhow::Result<bool> {
    Ok(false)
}

#[cfg(not(windows))]
pub fn uninstall_user_path(_bin_dir: &Path) -> anyhow::Result<bool> {
    Ok(false)
}

#[cfg(not(windows))]
pub fn register_protocol_handler(_exe_path: &Path) -> anyhow::Result<()> {
    Ok(())
}

#[cfg(not(windows))]
pub fn unregister_protocol_handler() -> anyhow::Result<()> {
    Ok(())
}

#[cfg(not(windows))]
pub fn broadcast_environment_change() -> anyhow::Result<()> {
    Ok(())
}

/// Opens a URL in the user's default web browser.
pub fn open_url_in_browser(url: &str) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_string_manipulation() {
        let original = r"C:\Windows\System32;C:\Users\Admin\.cargo\bin";
        let target = r"C:\Users\Admin\AppData\Local\Programs\cms-site";

        let added = add_to_path_string(original, target);
        assert!(added.contains(target));
        assert_eq!(add_to_path_string(&added, target), added, "idempotent addition");

        let removed = remove_from_path_string(&added, target);
        assert!(!removed.contains(target));
        assert_eq!(removed, original);
    }

    #[test]
    fn test_path_string_case_and_slash_insensitivity() {
        let original = r"C:\tools\bin;D:\data";
        let target_with_slash = r"c:\tools\bin\";
        let target_clean = r"C:\tools\bin";

        let added = add_to_path_string(original, target_with_slash);
        assert_eq!(added, original, "Already present ignoring case and trailing slash");

        let removed = remove_from_path_string(original, target_with_slash);
        assert_eq!(removed, r"D:\data");

        let empty_added = add_to_path_string("", target_clean);
        assert_eq!(empty_added, target_clean);

        let empty_removed = remove_from_path_string(target_clean, target_clean);
        assert_eq!(empty_removed, "");
    }
}
