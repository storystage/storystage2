//! The policy file on Windows and macOS (spec 05 sections 3.2, 3.5, 3.6).

use std::fs::File;
use std::io::{ErrorKind, Read};
use std::path::{Path, PathBuf};

use crate::{PolicyInForce, MAX_POLICY_BYTES};

/// Where the policy file belongs on this platform. iPad and Android use managed configuration.
pub fn policy_path() -> Option<PathBuf> {
    #[cfg(windows)]
    return crate::windows::program_data()
        .map(|folder| folder.join("StoryStage").join("policy.properties"));
    #[cfg(target_os = "macos")]
    return Some(PathBuf::from("/Library/Application Support/StoryStage/policy.properties"));
    #[cfg(not(any(windows, target_os = "macos")))]
    return None;
}

/// The policy on this device. If the file's place can't be found, nobody can show there is no
/// lock, so the policy is unreadable. Android's comes through the app: see `read_policy` there.
pub fn read_installed() -> PolicyInForce {
    #[cfg(target_os = "ios")]
    return PolicyInForce::from_managed(crate::ios::managed_configuration());
    #[cfg(not(target_os = "ios"))]
    return match policy_path() {
        Some(path) => read_policy_file(&path),
        None => PolicyInForce::unreadable("The folder for the policy can't be found."),
    };
}

pub fn read_policy_file(path: &Path) -> PolicyInForce {
    read_with(path, is_trusted)
}

/// On Windows, the owner of the file and its folder (3.6). Elsewhere only administrators can
/// write to the policy's folder.
fn is_trusted(path: &Path) -> bool {
    #[cfg(windows)]
    return crate::windows::owned_by_administrators(path)
        && path.parent().is_some_and(crate::windows::owned_by_administrators);
    #[cfg(not(windows))]
    {
        let _ = path;
        true
    }
}

fn read_with(path: &Path, is_trusted: impl Fn(&Path) -> bool) -> PolicyInForce {
    let bytes = match read_limited(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == ErrorKind::NotFound => return PolicyInForce::no_policy(),
        Err(_) => return PolicyInForce::unreadable("The policy file can't be read."),
    };
    if bytes.len() > MAX_POLICY_BYTES {
        return PolicyInForce::unreadable("The policy file is too large.");
    }
    match decode(&bytes) {
        Some(text) => PolicyInForce::from_text(&text, is_trusted(path)),
        None => PolicyInForce::unreadable("The policy file isn't plain text."),
    }
}

fn read_limited(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    File::open(path)?.take(MAX_POLICY_BYTES as u64 + 1).read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Plain text only. UTF-16 with no byte order mark reads as UTF-8 with a NUL after each letter,
/// and every line would then be an unknown key, ignored: a lock that silently does nothing.
fn decode(bytes: &[u8]) -> Option<String> {
    decode_any(bytes).filter(|text| !text.contains('\0'))
}

/// UTF-8, or UTF-16 with a byte order mark: `>` in Windows PowerShell 5 writes UTF-16.
fn decode_any(bytes: &[u8]) -> Option<String> {
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8(rest.to_vec()).ok();
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return decode_utf16(rest, u16::from_le_bytes);
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return decode_utf16(rest, u16::from_be_bytes);
    }
    String::from_utf8(bytes.to_vec()).ok()
}

fn decode_utf16(bytes: &[u8], word: fn([u8; 2]) -> u16) -> Option<String> {
    if bytes.len() % 2 != 0 {
        return None;
    }
    let words: Vec<u16> = bytes.chunks_exact(2).map(|pair| word([pair[0], pair[1]])).collect();
    String::from_utf16(&words).ok()
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::process;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;
    use crate::{PrompterLevel, Source};

    /// A file of its own in the temp folder, removed when the test ends.
    struct TempFile(PathBuf);

    impl TempFile {
        fn with(bytes: &[u8]) -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let name = format!(
                "storystage-policy-{}-{}.properties",
                process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            );
            let path = std::env::temp_dir().join(name);
            fs::write(&path, bytes).unwrap();
            Self(path)
        }
    }

    impl Drop for TempFile {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.0);
        }
    }

    fn read(bytes: &[u8]) -> PolicyInForce {
        read_with(&TempFile::with(bytes).0, |_| true)
    }

    fn utf16le(text: &str, mark: &[u8]) -> Vec<u8> {
        let words = text.encode_utf16().flat_map(u16::to_le_bytes);
        mark.iter().copied().chain(words).collect()
    }

    #[test]
    fn no_file_is_no_policy() {
        let path = std::env::temp_dir().join("storystage-no-such-folder").join("policy.properties");
        assert_eq!(read_with(&path, |_| true), PolicyInForce::no_policy());
    }

    #[test]
    fn a_file_is_read() {
        let policy = read(b"prompter.enabled=false\n");
        assert_eq!(policy.source, Source::File);
        assert_eq!(policy.prompter.level, PrompterLevel::Off);
    }

    #[test]
    fn every_encoding_gives_the_same_policy() {
        let line = "prompter.explainOnly=true\r\n";
        let plain = read(line.as_bytes());
        assert_eq!(plain.prompter.level, PrompterLevel::ExplainOnly);

        let utf8_mark: &[u8] = &[0xEF, 0xBB, 0xBF];
        assert_eq!(read(&[utf8_mark, line.as_bytes()].concat()), plain);

        assert_eq!(read(&utf16le(line, &[0xFF, 0xFE])), plain);

        let be_mark: &[u8] = &[0xFE, 0xFF];
        let be: Vec<u8> = line.encode_utf16().flat_map(u16::to_be_bytes).collect();
        assert_eq!(read(&[be_mark, be.as_slice()].concat()), plain);
    }

    #[test]
    fn text_that_cannot_be_decoded_is_unreadable() {
        for bytes in [
            &b"\xC3\x28=1"[..],
            &[0xFF, 0xFE, 0x41][..],
            &[0xFF, 0xFE, 0x00, 0xD8, 0x41, 0x00][..],
            &utf16le("prompter.enabled=false", &[])[..],
        ] {
            let policy = read(bytes);
            assert_eq!(policy.source, Source::Unreadable, "{bytes:?}");
            assert_eq!(policy.prompter.level, PrompterLevel::Off);
        }
    }

    #[test]
    fn a_file_at_the_limit_is_read_and_one_over_it_is_not() {
        let line = "# a comment\n";
        let at_limit = line.repeat(MAX_POLICY_BYTES / line.len());
        let padded = format!("{at_limit}{}", "#".repeat(MAX_POLICY_BYTES - at_limit.len()));
        assert_eq!(read(padded.as_bytes()).source, Source::File);

        let over = format!("{padded}#");
        let policy = read(over.as_bytes());
        assert_eq!(policy.source, Source::Unreadable);
        assert_eq!(policy.diagnostic.as_deref(), Some("The policy file is too large."));
    }

    #[test]
    fn a_policy_that_exists_but_cannot_be_read_is_unreadable() {
        // A folder where the file should be. `temp_dir()` itself won't do: it ends in a
        // backslash on Windows, which opens as "not found" rather than "is a folder".
        let folder = std::env::temp_dir().join(format!("storystage-folder-{}", process::id()));
        fs::create_dir(&folder).unwrap();
        let policy = read_with(&folder, |_| true);
        fs::remove_dir(&folder).unwrap();
        assert_eq!(policy.source, Source::Unreadable);
        assert_eq!(policy.prompter.level, PrompterLevel::Off);
    }

    #[test]
    fn trust_is_asked_of_the_file_being_read() {
        let file = TempFile::with(b"study.enabled=true\n");
        assert!(read_with(&file.0, |_| true).study.enabled);
        assert!(!read_with(&file.0, |_| false).study.enabled);
    }

    #[cfg(windows)]
    #[test]
    fn the_windows_path_ignores_the_environment_variable() {
        let before = policy_path().unwrap();
        assert!(before.ends_with("StoryStage\\policy.properties"), "{before:?}");

        std::env::set_var("PROGRAMDATA", "C:\\somewhere-a-learner-chose");
        std::env::set_var("ALLUSERSPROFILE", "C:\\somewhere-a-learner-chose");
        assert_eq!(policy_path().unwrap(), before);
    }

    #[cfg(windows)]
    #[test]
    fn only_administrators_or_system_are_trusted_owners() {
        use crate::windows::owned_by_administrators;

        // Owned by TrustedInstaller on every Windows install.
        let notepad = std::path::Path::new("C:\\Windows\\System32\\notepad.exe");
        assert!(notepad.exists());
        assert!(!owned_by_administrators(notepad));

        // This is the fix the diagnostic gives, and the runner is an administrator.
        let file = TempFile::with(b"# a policy\n");
        let status = process::Command::new("takeown")
            .args(["/a", "/f"])
            .arg(&file.0)
            .stdout(process::Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());
        assert!(owned_by_administrators(&file.0));

        let missing = std::env::temp_dir().join("storystage-no-such-file");
        assert!(!owned_by_administrators(&missing));
    }
}
