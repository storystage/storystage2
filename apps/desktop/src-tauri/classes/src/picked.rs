//! Files and folders the person picked in the system's own dialog (spec 05 section 6.5). The
//! dialog is opened from Rust, so the webview only ever hands over a name, never a path, and
//! nothing here goes outside what the person picked.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::{code_of, entry, temporary_name, write_whole, Code, Entry, FILE_LIMIT};

/// A production's file name ends in this.
pub const EXTENSION: &str = ".storystage";

const REFUSED: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
const NAME_LIMIT: usize = 80;
const DEVICES: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1",
    "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// A name the studio's `safeFileName` could give: one part of a path on every system. No
/// separators or characters Windows refuses, no control characters, nothing starting with a dot
/// or ending in a dot or space, at most 80 characters as the studio counts them, and never a
/// device name.
pub fn is_plain_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).to_ascii_lowercase();
    !name.is_empty()
        && name.encode_utf16().count() <= NAME_LIMIT
        && !name.chars().any(|c| c.is_control() || REFUSED.contains(&c))
        && !name.starts_with(['.', ' '])
        && !name.ends_with(['.', ' '])
        && !DEVICES.contains(&stem.as_str())
}

/// A file Collect may write: a plain name ending in `.storystage`.
pub fn is_production_name(name: &str) -> bool {
    is_plain_name(name) && name.len() > EXTENSION.len() && name.to_lowercase().ends_with(EXTENSION)
}

/// Writes a whole file at a path the person picked, or nothing: a temporary file beside it,
/// flushed, then renamed over. A folder or a link there is refused.
pub fn save(path: &Path, bytes: &[u8]) -> Result<(), Code> {
    if bytes.len() > FILE_LIMIT {
        return Err(Code::TooBig);
    }
    if matches!(entry(path)?, Entry::Folder | Entry::Link) {
        return Err(Code::Unreadable);
    }
    let folder = path.parent().ok_or(Code::Internal)?;
    let temporary = folder.join(temporary_name());
    write_whole(&temporary, path, bytes).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        code_of(&error)
    })
}

/// Reads a file the person picked, refusing one over `FILE_LIMIT` before reading it.
pub fn read(path: &Path) -> Result<Vec<u8>, Code> {
    let meta = fs::symlink_metadata(path).map_err(|error| code_of(&error))?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err(Code::Unreadable);
    }
    if meta.len() > FILE_LIMIT as u64 {
        return Err(Code::TooBig);
    }
    fs::read(path).map_err(|error| code_of(&error))
}

/// Collect: writes `folder/file` inside the folder the teacher picked, making `folder` if it
/// isn't there. Both names must be plain, so nothing lands outside the picked folder.
pub fn collect(chosen: &Path, folder: &str, file: &str, bytes: &[u8]) -> Result<(), Code> {
    if !is_plain_name(folder) || !is_production_name(file) {
        return Err(Code::Invalid);
    }
    let pupil = chosen.join(folder);
    match entry(&pupil)? {
        Entry::Folder => {}
        Entry::Missing => match fs::create_dir(&pupil) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(code_of(&error)),
        },
        Entry::File | Entry::Link => return Err(Code::Unreadable),
    }
    save(&pupil.join(file), bytes)
}

/// One file found for Hand back.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Found {
    pub folder: String,
    pub file: String,
    pub path: PathBuf,
}

/// Hand back: every `.storystage` file one level down in the folder the teacher picked. Links
/// aren't followed, and names that aren't plain are left out. If any file is over `FILE_LIMIT`,
/// it's `too_big`, and nothing is read.
pub fn hand_back(chosen: &Path) -> Result<Vec<Found>, Code> {
    let mut found = Vec::new();
    for folder in fs::read_dir(chosen).map_err(|error| code_of(&error))? {
        let folder = folder.map_err(|error| code_of(&error))?;
        let kind = folder.file_type().map_err(|error| code_of(&error))?;
        let Ok(folder_name) = folder.file_name().into_string() else { continue };
        if !kind.is_dir() || kind.is_symlink() || !is_plain_name(&folder_name) {
            continue;
        }
        for file in fs::read_dir(folder.path()).map_err(|error| code_of(&error))? {
            let file = file.map_err(|error| code_of(&error))?;
            let meta = fs::symlink_metadata(file.path()).map_err(|error| code_of(&error))?;
            let Ok(file_name) = file.file_name().into_string() else { continue };
            if !meta.is_file() || meta.file_type().is_symlink() || !is_production_name(&file_name) {
                continue;
            }
            if meta.len() > FILE_LIMIT as u64 {
                return Err(Code::TooBig);
            }
            found.push(Found { folder: folder_name.clone(), file: file_name, path: file.path() });
        }
    }
    found.sort_by(|a, b| (&a.folder, &a.file).cmp(&(&b.folder, &b.file)));
    Ok(found)
}

/// Decodes a header value the studio encoded with `encodeURIComponent`, as names can be any
/// language and a header can carry only plain ASCII.
pub fn decode_header(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = value.get(index + 1..index + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(out).ok()
}
