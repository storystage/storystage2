//! The two Windows system calls the policy needs (spec 05 sections 3.2, 3.6).

use std::ffi::OsString;
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::path::{Path, PathBuf};
use std::ptr::null_mut;
use std::slice;

use windows_sys::Win32::Foundation::{LocalFree, ERROR_SUCCESS, S_OK};
use windows_sys::Win32::Security::Authorization::{GetNamedSecurityInfoW, SE_FILE_OBJECT};
use windows_sys::Win32::Security::{
    IsWellKnownSid, WinBuiltinAdministratorsSid, WinLocalSystemSid, OWNER_SECURITY_INFORMATION,
    PSECURITY_DESCRIPTOR, PSID,
};
use windows_sys::Win32::System::Com::CoTaskMemFree;
use windows_sys::Win32::UI::Shell::{FOLDERID_ProgramData, SHGetKnownFolderPath};

/// `C:\ProgramData` as the system knows it. Never the `PROGRAMDATA` variable, which a learner
/// can change before starting the app.
pub fn program_data() -> Option<PathBuf> {
    let mut raw = null_mut();
    // SAFETY: `raw` receives a string the system allocates. It is copied, then freed once.
    unsafe {
        let status = SHGetKnownFolderPath(&FOLDERID_ProgramData, 0, null_mut(), &mut raw);
        let path = (status == S_OK && !raw.is_null()).then(|| {
            let length = (0..).take_while(|&i| *raw.add(i) != 0).count();
            PathBuf::from(OsString::from_wide(slice::from_raw_parts(raw, length)))
        });
        CoTaskMemFree(raw as *const _);
        path
    }
}

/// True only if Windows says the owner is the Administrators group or SYSTEM. Anything else,
/// including a failure to find out, is false.
pub fn owned_by_administrators(path: &Path) -> bool {
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut owner: PSID = null_mut();
    let mut descriptor: PSECURITY_DESCRIPTOR = null_mut();
    // SAFETY: `wide` ends in a null. `owner` points inside `descriptor`, which is freed last.
    unsafe {
        let status = GetNamedSecurityInfoW(
            wide.as_ptr(),
            SE_FILE_OBJECT,
            OWNER_SECURITY_INFORMATION,
            &mut owner,
            null_mut(),
            null_mut(),
            null_mut(),
            &mut descriptor,
        );
        if status != ERROR_SUCCESS {
            return false;
        }
        let trusted = IsWellKnownSid(owner, WinBuiltinAdministratorsSid) != 0
            || IsWellKnownSid(owner, WinLocalSystemSid) != 0;
        LocalFree(descriptor);
        trusted
    }
}
