//! The native store for pupil folders (spec 05 sections 6.1 and 6.4). The folders' rules are in
//! `packages/host` (`storedClassFolders`); this is only the store under them: five operations, on
//! paths of safe parts, inside one folder.
//!
//! - Every part is checked before anything is touched, so no path leaves the folder (threat F1).
//! - A write goes to a temporary file in the same folder, is flushed, then renamed over the old
//!   one, so a file is whole or untouched (PS4).
//! - Symbolic links, and junctions on Windows, are never followed.
//!
//! `picked` is the same care for the files and folders a person picks in the system's dialog.

pub mod class_zip;
pub mod picked;

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// The largest file the folders keep: `FILE_LIMIT` in `packages/host/src/files.ts`.
pub const FILE_LIMIT: usize = 512 * 1024 * 1024;

/// The `FileError` codes in `packages/host/src/files.ts` that the store can give.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Code {
    Full,
    Locked,
    Unreadable,
    NotFound,
    Invalid,
    TooBig,
    Internal,
}

impl Code {
    pub fn name(self) -> &'static str {
        match self {
            Code::Full => "full",
            Code::Locked => "locked",
            Code::Unreadable => "unreadable",
            Code::NotFound => "not_found",
            Code::Invalid => "invalid",
            Code::TooBig => "too_big",
            Code::Internal => "internal",
        }
    }
}

/// The operating system's errors as codes: a full disk is `full`, a file another program holds
/// is `locked`, and anything else is `unreadable`.
pub(crate) fn code_of(error: &io::Error) -> Code {
    match error.raw_os_error() {
        // ERROR_HANDLE_DISK_FULL, ERROR_DISK_FULL
        #[cfg(windows)]
        Some(39 | 112) => Code::Full,
        // ERROR_SHARING_VIOLATION, ERROR_LOCK_VIOLATION
        #[cfg(windows)]
        Some(32 | 33) => Code::Locked,
        // ENOSPC
        #[cfg(unix)]
        Some(28) => Code::Full,
        // EDQUOT
        #[cfg(any(target_os = "linux", target_os = "android"))]
        Some(122) => Code::Full,
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        Some(69) => Code::Full,
        _ => Code::Unreadable,
    }
}

/// Windows' device names, which open a device instead of a file whatever follows the dot.
const DEVICES: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1",
    "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// 1 to 64 of `a-z`, `0-9`, `.`, `_` and `-`, starting with a letter or digit. Never ending in a
/// dot, which Windows drops, and never one of Windows' device names. The same rule as
/// `isSafePart` in `packages/host/src/store.ts`; `fixtures/parts.json` keeps them the same.
pub fn is_safe_part(part: &str) -> bool {
    let bytes = part.as_bytes();
    let allowed = |b: &u8| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-');
    let Some(first) = bytes.first() else { return false };
    let stem = part.split('.').next().unwrap_or(part);
    bytes.len() <= 64
        && (first.is_ascii_lowercase() || first.is_ascii_digit())
        && bytes.iter().all(allowed)
        && !part.ends_with('.')
        && !DEVICES.contains(&stem)
}

/// A unique temporary name in a folder. It starts with a dot, so it's never a safe part and
/// `list` never shows it.
pub fn temporary_name() -> String {
    static COUNT: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!(".tmp-{}-{}-{}", std::process::id(), nanos, COUNT.fetch_add(1, Ordering::Relaxed))
}

fn is_link(meta: &fs::Metadata) -> bool {
    meta.file_type().is_symlink()
}

/// What is at a path, without following a link there.
pub(crate) enum Entry {
    Missing,
    File,
    Folder,
    Link,
}

pub(crate) fn entry(path: &Path) -> Result<Entry, Code> {
    match fs::symlink_metadata(path) {
        Ok(meta) if is_link(&meta) => Ok(Entry::Link),
        Ok(meta) if meta.is_dir() => Ok(Entry::Folder),
        Ok(_) => Ok(Entry::File),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Entry::Missing),
        Err(error) => Err(code_of(&error)),
    }
}

/// Writes `bytes` to a new file at `temporary`, flushes it to disk, then renames it over `path`,
/// which replaces the old file in one step, on Windows too.
pub(crate) fn write_whole(temporary: &Path, path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(temporary)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(temporary, path)
}

pub struct Store {
    root: PathBuf,
}

impl Store {
    /// The store in `root`, which is made the first time something is written.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// The path on disk, once every part is safe and every folder on the way is a real folder.
    /// Returns `Ok(None)` when a folder on the way isn't there.
    fn resolve(&self, parts: &[String]) -> Result<Option<PathBuf>, Code> {
        if parts.is_empty() || !parts.iter().all(|part| is_safe_part(part)) {
            return Err(Code::Internal);
        }
        let mut path = self.root.clone();
        for part in &parts[..parts.len() - 1] {
            path.push(part);
            match entry(&path)? {
                Entry::Folder => {}
                Entry::Missing => return Ok(None),
                Entry::File | Entry::Link => return Err(Code::Unreadable),
            }
        }
        path.push(&parts[parts.len() - 1]);
        Ok(Some(path))
    }

    /// Makes the folders a path needs, refusing a link or a file on the way.
    fn make_folders(&self, parts: &[String]) -> Result<PathBuf, Code> {
        if parts.is_empty() || !parts.iter().all(|part| is_safe_part(part)) {
            return Err(Code::Internal);
        }
        fs::create_dir_all(&self.root).map_err(|error| code_of(&error))?;
        let mut path = self.root.clone();
        for part in &parts[..parts.len() - 1] {
            path.push(part);
            match entry(&path)? {
                Entry::Folder => {}
                Entry::Missing => match fs::create_dir(&path) {
                    Ok(()) => {}
                    // Another window made it first.
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                        if !matches!(entry(&path)?, Entry::Folder) {
                            return Err(Code::Unreadable);
                        }
                    }
                    Err(error) => return Err(code_of(&error)),
                },
                Entry::File | Entry::Link => return Err(Code::Unreadable),
            }
        }
        path.push(&parts[parts.len() - 1]);
        Ok(path)
    }

    /// A file's bytes, or `None` if nothing is there. A folder or a link there is `unreadable`.
    pub fn read(&self, parts: &[String]) -> Result<Option<Vec<u8>>, Code> {
        let Some(path) = self.resolve(parts)? else { return Ok(None) };
        match entry(&path)? {
            Entry::Missing => Ok(None),
            Entry::File => fs::read(&path).map(Some).map_err(|error| code_of(&error)),
            Entry::Folder | Entry::Link => Err(Code::Unreadable),
        }
    }

    /// Writes a whole file or nothing: a temporary file, flushed to disk, then renamed over.
    pub fn write(&self, parts: &[String], bytes: &[u8]) -> Result<(), Code> {
        if bytes.len() > FILE_LIMIT {
            return Err(Code::TooBig);
        }
        let path = self.make_folders(parts)?;
        if matches!(entry(&path)?, Entry::Folder | Entry::Link) {
            return Err(Code::Unreadable);
        }
        let folder = path.parent().ok_or(Code::Internal)?;
        let temporary = folder.join(temporary_name());
        if let Err(error) = write_whole(&temporary, &path, bytes) {
            let _ = fs::remove_file(&temporary);
            return Err(code_of(&error));
        }
        Ok(())
    }

    /// Removes a file or a folder and everything in it. A link is removed, never what it points
    /// at. Nothing there is fine.
    pub fn remove(&self, parts: &[String]) -> Result<(), Code> {
        let Some(path) = self.resolve(parts)? else { return Ok(()) };
        let removed = match entry(&path)? {
            Entry::Missing => return Ok(()),
            Entry::File => fs::remove_file(&path),
            // `remove_dir_all` removes links inside without following them.
            Entry::Folder => fs::remove_dir_all(&path),
            Entry::Link => fs::remove_file(&path).or_else(|_| fs::remove_dir(&path)),
        };
        match removed {
            Err(error) if error.kind() != io::ErrorKind::NotFound => Err(code_of(&error)),
            _ => Ok(()),
        }
    }

    /// The safe names in a folder, without links. Nothing there is an empty list.
    pub fn list(&self, parts: &[String]) -> Result<Vec<String>, Code> {
        let Some(path) = self.resolve(parts)? else { return Ok(Vec::new()) };
        match entry(&path)? {
            Entry::Folder => {}
            Entry::Missing => return Ok(Vec::new()),
            Entry::File | Entry::Link => return Err(Code::Unreadable),
        }
        let mut names = Vec::new();
        for item in fs::read_dir(&path).map_err(|error| code_of(&error))? {
            let item = item.map_err(|error| code_of(&error))?;
            let Ok(name) = item.file_name().into_string() else { continue };
            let link = item.file_type().map(|kind| kind.is_symlink()).unwrap_or(true);
            if !link && is_safe_part(&name) {
                names.push(name);
            }
        }
        names.sort();
        Ok(names)
    }

    /// Moves a file or folder, refusing to move onto anything already there. Nothing at `from`
    /// is fine. Moves are into the bin and back, inside the one folder, so a rename does it.
    pub fn r#move(&self, from: &[String], to: &[String]) -> Result<(), Code> {
        let Some(source) = self.resolve(from)? else { return Ok(()) };
        match entry(&source)? {
            Entry::Missing => return Ok(()),
            Entry::Link => return Err(Code::Unreadable),
            Entry::File | Entry::Folder => {}
        }
        let target = self.make_folders(to)?;
        if !matches!(entry(&target)?, Entry::Missing) {
            return Err(Code::Internal);
        }
        fs::rename(&source, &target).map_err(|error| code_of(&error))
    }
}
