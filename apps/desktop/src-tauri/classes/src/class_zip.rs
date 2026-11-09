//! Collect and Hand back as one zip file, for iPad and Android, which can't pick a folder
//! (decision 0070, spec 05 section 6.5). Inside: `<pupil>/<production>.storystage`, one folder
//! per pupil, as Collect writes into a folder on desktop.
//!
//! Writing stores each film as it is: a production is already compressed. Reading never trusts
//! the zip: every name is checked as spec 15 section 3.2 says, and sizes are counted while
//! reading, not taken from what the zip declares (section 3.1).

use std::collections::HashSet;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;

use zip::result::ZipError;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::picked::{is_plain_name, is_production_name};
use crate::{code_of, Code, FILE_LIMIT};

/// The most entries a class zip may have.
pub const ENTRY_LIMIT: usize = 2_000;
/// The most a Hand back reads from one zip, all films together.
pub const UNPACKED_LIMIT: u64 = 8 * 1024 * 1024 * 1024;
/// Unpacked against packed size, for an entry over 1 MiB (spec 15 section 3.1).
const RATIO_LIMIT: u64 = 200;
const RATIO_FROM: u64 = 1024 * 1024;
const NAME_LIMIT: usize = 255;
const DEVICES: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1",
    "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

fn zip_code(error: ZipError) -> Code {
    match error {
        ZipError::Io(error) => code_of(&error),
        _ => Code::Unreadable,
    }
}

/// An entry name the whole archive is refused for (spec 15 section 3.2).
fn is_refused(name: &str) -> bool {
    let absolute = name.starts_with('/')
        || name.starts_with("\\\\")
        || name.as_bytes().get(1) == Some(&b':');
    let bad_part = name.split('/').any(|part| {
        let stem = part.split('.').next().unwrap_or(part).trim_end().to_ascii_lowercase();
        part == ".." || DEVICES.contains(&stem.as_str()) || part.ends_with('.') || part.ends_with(' ')
    });
    absolute
        || bad_part
        || name.chars().count() > NAME_LIMIT
        || name.chars().any(|c| c == '\\' || c.is_control())
}

/// Writes a class zip into a file, a film at a time, so a class's work is never all in memory.
pub struct ClassZipWriter {
    zip: ZipWriter<File>,
    names: HashSet<String>,
}

impl ClassZipWriter {
    pub fn create(path: &Path) -> Result<Self, Code> {
        let file = File::create(path).map_err(|error| code_of(&error))?;
        Ok(Self { zip: ZipWriter::new(file), names: HashSet::new() })
    }

    /// Adds `folder/file`. Both names must be plain, as on desktop, and a name already in the
    /// zip, ignoring case, is `invalid`.
    pub fn add(&mut self, folder: &str, file: &str, bytes: &[u8]) -> Result<(), Code> {
        if !is_plain_name(folder) || !is_production_name(file) {
            return Err(Code::Invalid);
        }
        if bytes.len() > FILE_LIMIT {
            return Err(Code::TooBig);
        }
        let name = format!("{folder}/{file}");
        if !self.names.insert(name.to_lowercase()) {
            return Err(Code::Invalid);
        }
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        self.zip.start_file(name, options).map_err(zip_code)?;
        self.zip.write_all(bytes).map_err(|error| code_of(&error))
    }

    pub fn finish(self) -> Result<(), Code> {
        let file = self.zip.finish().map_err(zip_code)?;
        file.sync_all().map_err(|error| code_of(&error))
    }
}

/// One film found in a class zip.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ZipFound {
    pub folder: String,
    pub file: String,
    index: usize,
}

/// A class zip opened for Hand back.
pub struct ClassZip {
    archive: ZipArchive<File>,
    read: u64,
}

impl ClassZip {
    /// Opens a zip and lists its films. The whole zip is refused, as `unreadable`, if any entry's
    /// name breaks spec 15 section 3.2, any two names are the same ignoring case, an entry is a
    /// link, or there are too many entries. A film declared over `FILE_LIMIT` is `too_big`, and
    /// nothing is read. Entries that aren't `<folder>/<production>.storystage` are left out.
    pub fn open(path: &Path) -> Result<(Self, Vec<ZipFound>), Code> {
        let file = File::open(path).map_err(|error| code_of(&error))?;
        let mut archive = ZipArchive::new(file).map_err(zip_code)?;
        if archive.len() > ENTRY_LIMIT {
            return Err(Code::Unreadable);
        }
        let mut names = HashSet::new();
        let mut found = Vec::new();
        for index in 0..archive.len() {
            let entry = archive.by_index_raw(index).map_err(zip_code)?;
            let name = entry.name().to_string();
            let link = entry.unix_mode().is_some_and(|mode| mode & 0o170000 == 0o120000);
            if is_refused(&name) || link || !names.insert(name.to_lowercase()) {
                return Err(Code::Unreadable);
            }
            if entry.is_dir() {
                continue;
            }
            let parts: Vec<&str> = name.split('/').collect();
            let &[folder, file] = parts.as_slice() else { continue };
            if !is_plain_name(folder) || !is_production_name(file) {
                continue;
            }
            if entry.size() > FILE_LIMIT as u64 {
                return Err(Code::TooBig);
            }
            found.push(ZipFound { folder: folder.to_string(), file: file.to_string(), index });
        }
        found.sort_by(|a, b| (&a.folder, &a.file).cmp(&(&b.folder, &b.file)));
        Ok((Self { archive, read: 0 }, found))
    }

    /// One film's bytes, counted as they're read: over `FILE_LIMIT`, over the zip's total, or
    /// unpacking far more than its packed size, and it stops.
    pub fn read(&mut self, found: &ZipFound) -> Result<Vec<u8>, Code> {
        let entry = self.archive.by_index(found.index).map_err(zip_code)?;
        // The most this entry may unpack to, known before a byte is read: never more than a
        // film, and never far more than it's packed into. One byte over says it went too far.
        let allowed = (FILE_LIMIT as u64).min(RATIO_FROM.max(entry.compressed_size().saturating_mul(RATIO_LIMIT)));
        let mut bytes = Vec::new();
        entry.take(allowed + 1).read_to_end(&mut bytes).map_err(|error| code_of(&error))?;
        let size = bytes.len() as u64;
        if size > FILE_LIMIT as u64 {
            return Err(Code::TooBig);
        }
        if size > allowed {
            return Err(Code::Unreadable);
        }
        self.read += size;
        if self.read > UNPACKED_LIMIT {
            return Err(Code::TooBig);
        }
        Ok(bytes)
    }
}
