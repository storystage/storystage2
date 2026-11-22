//! The system's own file picker (spec 05 section 6.5). The dialog opens from Rust, so the webview
//! never holds a path: it sends bytes and names, and gets bytes back. The rules about what may be
//! written and read are in `storystage_classes::picked` and `class_zip`.
//!
//! `tauri-plugin-dialog` is used from Rust only: no window is given the plugin's own permissions.
//! - **Desktop:** files and folders, as picked.
//! - **Android:** a picked file is a content URI, opened through the fs plugin. Nothing picks a
//!   folder there, so Collect saves one zip and Hand back opens one (decision 0070).
//! - **iPad:** iPadOS has no "save as": a copy is written to the app's cache, then exported
//!   through iPad's own Files dialog (`tauri-plugin-files-export`). Open and Hand back pick a file,
//!   which iPadOS copies into the app. Collect is one zip, as on Android (decision 0070).
//!
//! An exported film (spec 08 section 4) is one dialog for the video, with its captions written
//! beside it on desktop and iPad, and one zip of all three on Android.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use storystage_classes::picked;
use storystage_classes::Code;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, State};

#[cfg(desktop)]
use desktop as platform;
#[cfg(target_os = "android")]
use android as platform;
#[cfg(target_os = "ios")]
use ios as platform;

/// The header with a name: a copy's suggested name, or Collect's `folder/file`.
pub const NAME_HEADER: &str = "x-storystage-name";
/// The header with the Collect that a write belongs to.
pub const SESSION_HEADER: &str = "x-storystage-session";
/// The header with an exported film's files: `mp4:1234,vtt:56,srt:78`, in the body's order.
pub const FILES_HEADER: &str = "x-storystage-files";

const CANCELLED: &str = "cancelled";

#[derive(Default)]
pub struct Picker {
    next: AtomicU64,
    sessions: Mutex<HashMap<String, platform::Session>>,
}

impl Picker {
    fn start(&self, session: platform::Session) -> String {
        let token = format!("picked-{}", self.next.fetch_add(1, Ordering::Relaxed));
        self.sessions.lock().unwrap_or_else(|e| e.into_inner()).insert(token.clone(), session);
        token
    }
}

/// One film found for Hand back, as the webview sees it.
#[derive(Serialize)]
pub struct HandBackFile {
    folder: String,
    file: String,
}

#[derive(Serialize)]
pub struct HandBack {
    session: String,
    files: Vec<HandBackFile>,
}

#[cfg(desktop)]
mod desktop {
    use std::path::PathBuf;

    use storystage_classes::picked::{self, FilmPart, Found};
    use storystage_classes::Code;
    use tauri::AppHandle;
    use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

    use super::HandBackFile;

    /// A Collect or a Hand back under way: the folder the teacher picked, or what was found in it.
    pub enum Session {
        Collect(PathBuf),
        HandBack(Vec<Found>),
    }

    fn productions(app: &AppHandle) -> FileDialogBuilder<tauri::Wry> {
        app.dialog().file().add_filter("StoryStage production", &["storystage"])
    }

    fn folder(app: &AppHandle) -> Option<PathBuf> {
        app.dialog().file().blocking_pick_folder().and_then(|path| path.into_path().ok())
    }

    /// `Ok(false)` when the person closed the dialog.
    pub fn save(app: &AppHandle, name: &str, bytes: &[u8]) -> Result<bool, Code> {
        let Some(path) = productions(app).set_file_name(name).blocking_save_file().and_then(|p| p.into_path().ok())
        else {
            return Ok(false);
        };
        picked::save(&path, bytes).map(|()| true)
    }

    /// One dialog for the film's first file, the video; the rest go beside it.
    pub fn save_film(app: &AppHandle, name: &str, body: &[u8], parts: &[FilmPart]) -> Result<bool, Code> {
        let first = &parts.first().ok_or(Code::Invalid)?.extension;
        let chosen = app
            .dialog()
            .file()
            .add_filter("Film", &[first.as_str()])
            .set_file_name(format!("{name}.{first}"))
            .blocking_save_file();
        let Some(path) = chosen.and_then(|p| p.into_path().ok()) else { return Ok(false) };
        picked::save_film(&path, body, parts).map(|()| true)
    }

    pub fn open(app: &AppHandle) -> Result<Option<(String, Vec<u8>)>, Code> {
        let Some(path) = productions(app).blocking_pick_file().and_then(|p| p.into_path().ok()) else {
            return Ok(None);
        };
        let bytes = picked::read(&path)?;
        let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("file.storystage").to_string();
        Ok(Some((name, bytes)))
    }

    pub fn collect_start(app: &AppHandle) -> Result<Option<Session>, Code> {
        Ok(folder(app).map(Session::Collect))
    }

    pub fn collect_write(session: &mut Session, folder: &str, file: &str, bytes: &[u8]) -> Result<(), Code> {
        match session {
            Session::Collect(chosen) => picked::collect(chosen, folder, file, bytes),
            Session::HandBack(_) => Err(Code::Internal),
        }
    }

    /// Every file is already in place on desktop.
    pub fn collect_finish(_app: &AppHandle, session: Session) -> Result<bool, Code> {
        match session {
            Session::Collect(_) => Ok(true),
            Session::HandBack(_) => Err(Code::Internal),
        }
    }

    pub fn hand_back_start(app: &AppHandle) -> Result<Option<(Session, Vec<HandBackFile>)>, Code> {
        let Some(chosen) = folder(app) else { return Ok(None) };
        let found = picked::hand_back(&chosen)?;
        let files = found.iter().map(|f| HandBackFile { folder: f.folder.clone(), file: f.file.clone() }).collect();
        Ok(Some((Session::HandBack(found), files)))
    }

    pub fn hand_back_read(session: &mut Session, index: usize) -> Result<Vec<u8>, Code> {
        match session {
            Session::HandBack(found) => picked::read(&found.get(index).ok_or(Code::NotFound)?.path),
            Session::Collect(_) => Err(Code::Internal),
        }
    }

    pub fn end(_session: Session) {}
}

#[cfg(target_os = "android")]
mod android {
    use std::fs::{self, File};
    use std::io::{self, Read, Write};
    use std::path::PathBuf;

    use storystage_classes::class_zip::{write_film_zip, ClassZip, ClassZipWriter, ZipFound, UNPACKED_LIMIT};
    use storystage_classes::picked::{decode_header, FilmPart};
    use storystage_classes::{Code, FILE_LIMIT};
    use tauri::{AppHandle, Manager};
    use tauri_plugin_dialog::{DialogExt, FilePath};
    use tauri_plugin_fs::{FsExt, OpenOptions};

    use super::HandBackFile;

    /// A Collect being written to a zip in the app's cache, for the place the teacher picked; or
    /// a Hand back's zip, copied into the cache and opened.
    pub enum Session {
        Collect { writer: Option<ClassZipWriter>, temporary: PathBuf, to: FilePath },
        HandBack { zip: ClassZip, found: Vec<ZipFound>, temporary: PathBuf },
    }

    fn io_code(error: &io::Error) -> Code {
        match error.kind() {
            io::ErrorKind::NotFound => Code::NotFound,
            io::ErrorKind::PermissionDenied => Code::Locked,
            _ => Code::Unreadable,
        }
    }

    /// A file of our own in the app's cache, for a zip on its way in or out.
    fn temporary(app: &AppHandle, what: &str) -> Result<PathBuf, Code> {
        let folder = app.path().app_cache_dir().map_err(|_| Code::Internal)?.join("picker");
        fs::create_dir_all(&folder).map_err(|error| io_code(&error))?;
        Ok(folder.join(format!("{what}{}.zip", storystage_classes::temporary_name())))
    }

    fn open_picked(app: &AppHandle, path: FilePath, write: bool) -> Result<File, Code> {
        let mut options = OpenOptions::new();
        if write {
            options.write(true).create(true).truncate(true);
        } else {
            options.read(true);
        }
        app.fs().open(path, options).map_err(|error| io_code(&error))
    }

    /// A content URI's last part, decoded, as the file's name: `primary:Download/Film.storystage`
    /// gives `Film.storystage`.
    fn name_of(path: &FilePath) -> String {
        let text = match path {
            FilePath::Url(url) => url.as_str().to_string(),
            FilePath::Path(path) => path.to_string_lossy().into_owned(),
        };
        let decoded = decode_header(&text).unwrap_or(text);
        decoded.rsplit(['/', ':']).next().filter(|name| !name.is_empty()).unwrap_or("file.storystage").to_string()
    }

    pub fn save(app: &AppHandle, name: &str, bytes: &[u8]) -> Result<bool, Code> {
        let picked = app.dialog().file().set_file_name(name).blocking_save_file();
        let Some(to) = picked else { return Ok(false) };
        let mut file = open_picked(app, to, true)?;
        file.write_all(bytes).map_err(|error| io_code(&error))?;
        file.sync_all().map_err(|error| io_code(&error))?;
        Ok(true)
    }

    /// One zip with the film's files side by side, as nothing picks a folder here (0070).
    pub fn save_film(app: &AppHandle, name: &str, body: &[u8], parts: &[FilmPart]) -> Result<bool, Code> {
        let picked = app
            .dialog()
            .file()
            .add_filter("Zip file", &["zip"])
            .set_file_name(format!("{name}.zip"))
            .blocking_save_file();
        let Some(to) = picked else { return Ok(false) };
        let temporary = temporary(app, "film")?;
        let saved = (|| {
            write_film_zip(&temporary, name, body, parts)?;
            let mut from = File::open(&temporary).map_err(|error| io_code(&error))?;
            let mut out = open_picked(app, to, true)?;
            io::copy(&mut from, &mut out).map_err(|error| io_code(&error))?;
            out.sync_all().map_err(|error| io_code(&error))
        })();
        let _ = fs::remove_file(&temporary);
        saved.map(|()| true)
    }

    pub fn open(app: &AppHandle) -> Result<Option<(String, Vec<u8>)>, Code> {
        let Some(picked) = app.dialog().file().blocking_pick_file() else { return Ok(None) };
        let name = name_of(&picked);
        let file = open_picked(app, picked, false)?;
        // Counted while reading, as a content URI may not say its size.
        let mut bytes = Vec::new();
        file.take(FILE_LIMIT as u64 + 1).read_to_end(&mut bytes).map_err(|error| io_code(&error))?;
        if bytes.len() > FILE_LIMIT {
            return Err(Code::TooBig);
        }
        Ok(Some((name, bytes)))
    }

    pub fn collect_start(app: &AppHandle) -> Result<Option<Session>, Code> {
        let picked = app
            .dialog()
            .file()
            .add_filter("Zip file", &["zip"])
            .set_file_name("StoryStage films.zip")
            .blocking_save_file();
        let Some(to) = picked else { return Ok(None) };
        let temporary = temporary(app, "collect")?;
        let writer = ClassZipWriter::create(&temporary)?;
        Ok(Some(Session::Collect { writer: Some(writer), temporary, to }))
    }

    pub fn collect_write(session: &mut Session, folder: &str, file: &str, bytes: &[u8]) -> Result<(), Code> {
        match session {
            Session::Collect { writer: Some(writer), .. } => writer.add(folder, file, bytes),
            _ => Err(Code::Internal),
        }
    }

    /// Finishes the zip and copies it to the place the teacher picked.
    pub fn collect_finish(app: &AppHandle, session: Session) -> Result<bool, Code> {
        let Session::Collect { writer: Some(writer), temporary, to } = session else {
            return Err(Code::Internal);
        };
        let copied = (|| {
            writer.finish()?;
            let mut from = File::open(&temporary).map_err(|error| io_code(&error))?;
            let mut out = open_picked(app, to, true)?;
            io::copy(&mut from, &mut out).map_err(|error| io_code(&error))?;
            out.sync_all().map_err(|error| io_code(&error))
        })();
        let _ = fs::remove_file(&temporary);
        copied.map(|()| true)
    }

    pub fn hand_back_start(app: &AppHandle) -> Result<Option<(Session, Vec<HandBackFile>)>, Code> {
        let picked = app.dialog().file().add_filter("Zip file", &["zip"]).blocking_pick_file();
        let Some(from) = picked else { return Ok(None) };
        let temporary = temporary(app, "hand-back")?;
        let opened = (|| {
            let mut source = open_picked(app, from, false)?;
            let mut copy = File::create(&temporary).map_err(|error| io_code(&error))?;
            // A zip may be bigger than what it unpacks to, but never by much: this bounds the copy.
            let copied = io::copy(&mut (&mut source).take(UNPACKED_LIMIT + 1), &mut copy)
                .map_err(|error| io_code(&error))?;
            if copied > UNPACKED_LIMIT {
                return Err(Code::TooBig);
            }
            ClassZip::open(&temporary)
        })();
        let (zip, found) = match opened {
            Ok(opened) => opened,
            Err(code) => {
                let _ = fs::remove_file(&temporary);
                return Err(code);
            }
        };
        let files = found.iter().map(|f| HandBackFile { folder: f.folder.clone(), file: f.file.clone() }).collect();
        Ok(Some((Session::HandBack { zip, found, temporary }, files)))
    }

    pub fn hand_back_read(session: &mut Session, index: usize) -> Result<Vec<u8>, Code> {
        match session {
            Session::HandBack { zip, found, .. } => {
                let entry = found.get(index).ok_or(Code::NotFound)?.clone();
                zip.read(&entry)
            }
            Session::Collect { .. } => Err(Code::Internal),
        }
    }

    /// Removes whatever the session left in the cache.
    pub fn end(session: Session) {
        let temporary = match session {
            Session::Collect { temporary, .. } | Session::HandBack { temporary, .. } => temporary,
        };
        let _ = fs::remove_file(temporary);
    }
}

/// iPad: iPadOS has no "save as", so a copy is written to the app's cache first and exported
/// after, through iPad's own Files dialog (`tauri-plugin-files-export`). Open and Hand back pick
/// a file, which iPadOS copies into the app; it's read, then removed. Collect is one zip, as on
/// Android (decision 0070); an exported film is its three files, exported together.
#[cfg(target_os = "ios")]
mod ios {
    use std::fs;
    use std::io;
    use std::path::{Path, PathBuf};

    use storystage_classes::class_zip::{ClassZip, ClassZipWriter, ZipFound, UNPACKED_LIMIT};
    use storystage_classes::picked::{self, is_plain_name, FilmPart};
    use storystage_classes::Code;
    use tauri::{AppHandle, Manager, Wry};
    use tauri_plugin_files_export::{FilesExport, Kind};

    use super::HandBackFile;

    /// A Collect's zip being written in a folder of the app's cache, to export when it's done;
    /// or a Hand back's zip, picked and copied in by iPadOS.
    pub enum Session {
        Collect { writer: Option<ClassZipWriter>, folder: PathBuf, zip: PathBuf },
        HandBack { zip: ClassZip, found: Vec<ZipFound>, picked: PathBuf },
    }

    fn io_code(error: &io::Error) -> Code {
        match error.kind() {
            io::ErrorKind::NotFound => Code::NotFound,
            io::ErrorKind::PermissionDenied => Code::Locked,
            _ => Code::Unreadable,
        }
    }

    fn plugin(app: &AppHandle) -> tauri::State<'_, FilesExport<Wry>> {
        app.state::<FilesExport<Wry>>()
    }

    /// A new, empty folder of our own in the app's cache, for files on their way out.
    fn outgoing(app: &AppHandle) -> Result<PathBuf, Code> {
        let folder = app
            .path()
            .app_cache_dir()
            .map_err(|_| Code::Internal)?
            .join("picker")
            .join(storystage_classes::temporary_name());
        fs::create_dir_all(&folder).map_err(|error| io_code(&error))?;
        Ok(folder)
    }

    /// Exports the files, then removes the folder they were written in, whatever happened.
    fn export_from(app: &AppHandle, folder: &Path, files: &[&Path]) -> Result<bool, Code> {
        let saved = plugin(app).export(files).map_err(|_| Code::Internal);
        let _ = fs::remove_dir_all(folder);
        saved
    }

    /// The copy iPadOS made of a picked file, if the person picked one.
    fn picked_copy(app: &AppHandle, kind: Kind) -> Result<Option<PathBuf>, Code> {
        plugin(app).pick(kind).map_err(|_| Code::Internal)
    }

    pub fn save(app: &AppHandle, name: &str, bytes: &[u8]) -> Result<bool, Code> {
        if !is_plain_name(name) {
            return Err(Code::Invalid);
        }
        let folder = outgoing(app)?;
        let file = folder.join(name);
        if let Err(code) = picked::save(&file, bytes) {
            let _ = fs::remove_dir_all(&folder);
            return Err(code);
        }
        export_from(app, &folder, &[file.as_path()])
    }

    /// The three files side by side in the cache, then exported together to one place.
    pub fn save_film(app: &AppHandle, name: &str, body: &[u8], parts: &[FilmPart]) -> Result<bool, Code> {
        let folder = outgoing(app)?;
        let written: Result<Vec<PathBuf>, Code> = (|| {
            let first = parts.first().ok_or(Code::Invalid)?;
            picked::save_film(&folder.join(format!("{name}.{}", first.extension)), body, parts)?;
            Ok(parts.iter().map(|part| folder.join(format!("{name}.{}", part.extension))).collect())
        })();
        let files = match written {
            Ok(files) => files,
            Err(code) => {
                let _ = fs::remove_dir_all(&folder);
                return Err(code);
            }
        };
        let paths: Vec<&Path> = files.iter().map(PathBuf::as_path).collect();
        export_from(app, &folder, &paths)
    }

    pub fn open(app: &AppHandle) -> Result<Option<(String, Vec<u8>)>, Code> {
        let Some(copy) = picked_copy(app, Kind::Production)? else { return Ok(None) };
        let read = picked::read(&copy);
        let _ = fs::remove_file(&copy);
        let name = copy.file_name().and_then(|name| name.to_str()).unwrap_or("file.storystage").to_string();
        read.map(|bytes| Some((name, bytes)))
    }

    /// Nothing to ask yet: iPadOS asks where the zip goes once it's written (`collect_finish`).
    pub fn collect_start(app: &AppHandle) -> Result<Option<Session>, Code> {
        let folder = outgoing(app)?;
        let zip = folder.join("StoryStage films.zip");
        match ClassZipWriter::create(&zip) {
            Ok(writer) => Ok(Some(Session::Collect { writer: Some(writer), folder, zip })),
            Err(code) => {
                let _ = fs::remove_dir_all(&folder);
                Err(code)
            }
        }
    }

    pub fn collect_write(session: &mut Session, folder: &str, file: &str, bytes: &[u8]) -> Result<(), Code> {
        match session {
            Session::Collect { writer: Some(writer), .. } => writer.add(folder, file, bytes),
            _ => Err(Code::Internal),
        }
    }

    /// Finishes the zip and exports it. `false` if the teacher closed the dialog.
    pub fn collect_finish(app: &AppHandle, session: Session) -> Result<bool, Code> {
        let Session::Collect { writer: Some(writer), folder, zip } = session else {
            return Err(Code::Internal);
        };
        if let Err(code) = writer.finish() {
            let _ = fs::remove_dir_all(&folder);
            return Err(code);
        }
        export_from(app, &folder, &[zip.as_path()])
    }

    pub fn hand_back_start(app: &AppHandle) -> Result<Option<(Session, Vec<HandBackFile>)>, Code> {
        let Some(copy) = picked_copy(app, Kind::Zip)? else { return Ok(None) };
        let opened = (|| {
            // A zip may be bigger than what it unpacks to, but never by much: this bounds it.
            let meta = fs::symlink_metadata(&copy).map_err(|error| io_code(&error))?;
            if !meta.is_file() {
                return Err(Code::Unreadable);
            }
            if meta.len() > UNPACKED_LIMIT {
                return Err(Code::TooBig);
            }
            ClassZip::open(&copy)
        })();
        let (zip, found) = match opened {
            Ok(opened) => opened,
            Err(code) => {
                let _ = fs::remove_file(&copy);
                return Err(code);
            }
        };
        let files = found.iter().map(|f| HandBackFile { folder: f.folder.clone(), file: f.file.clone() }).collect();
        Ok(Some((Session::HandBack { zip, found, picked: copy }, files)))
    }

    pub fn hand_back_read(session: &mut Session, index: usize) -> Result<Vec<u8>, Code> {
        match session {
            Session::HandBack { zip, found, .. } => {
                let entry = found.get(index).ok_or(Code::NotFound)?.clone();
                zip.read(&entry)
            }
            Session::Collect { .. } => Err(Code::Internal),
        }
    }

    /// Removes whatever the session left in the app.
    pub fn end(session: Session) {
        match session {
            Session::Collect { folder, .. } => {
                let _ = fs::remove_dir_all(folder);
            }
            Session::HandBack { picked, .. } => {
                let _ = fs::remove_file(picked);
            }
        }
    }
}

fn header(request: &Request<'_>, name: &str) -> Result<String, &'static str> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(storystage_classes::picked::decode_header)
        .ok_or(Code::Internal.name())
}

fn body<'a>(request: &'a Request<'_>) -> Result<&'a [u8], &'static str> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        _ => Err(Code::Internal.name()),
    }
}

/// Which picker the studio should use: `native` on desktop, Android and iPad.
#[tauri::command]
pub fn picker_kind() -> &'static str {
    "native"
}

/// Save a copy: the bytes are the raw body and the suggested name is in `NAME_HEADER`.
#[tauri::command]
pub async fn picker_save(app: AppHandle, request: Request<'_>) -> Result<(), &'static str> {
    let bytes = body(&request)?;
    if bytes.len() > storystage_classes::FILE_LIMIT {
        return Err(Code::TooBig.name());
    }
    let name = header(&request, NAME_HEADER)?;
    match platform::save(&app, &name, bytes) {
        Ok(true) => Ok(()),
        Ok(false) => Err(CANCELLED),
        Err(code) => Err(code.name()),
    }
}

/// Save an exported film (spec 08 section 4): its files one after another as the raw body, their
/// extensions and lengths in `FILES_HEADER`, and the name to suggest, already plain, in
/// `NAME_HEADER`. One dialog; on desktop the files go side by side where the person chose, and
/// on Android into one zip there.
#[tauri::command]
pub async fn picker_save_film(app: AppHandle, request: Request<'_>) -> Result<(), &'static str> {
    let body = body(&request)?;
    let name = header(&request, NAME_HEADER)?;
    let parts = picked::film_parts(&header(&request, FILES_HEADER)?, body.len()).map_err(Code::name)?;
    if picked::film_stem(&name, &parts).as_deref() != Some(name.as_str()) {
        return Err(Code::Invalid.name());
    }
    match platform::save_film(&app, &name, body, &parts) {
        Ok(true) => Ok(()),
        Ok(false) => Err(CANCELLED),
        Err(code) => Err(code.name()),
    }
}

/// Open: the file's name and bytes as one raw reply, so a big file is never turned into JSON.
/// The first four bytes are the name's length, big-endian, then the name in UTF-8, then the file.
#[tauri::command(async)]
pub fn picker_open(app: AppHandle) -> Result<Response, &'static str> {
    let (name, bytes) = platform::open(&app).map_err(Code::name)?.ok_or(CANCELLED)?;
    let mut reply = Vec::with_capacity(4 + name.len() + bytes.len());
    reply.extend_from_slice(&(name.len() as u32).to_be_bytes());
    reply.extend_from_slice(name.as_bytes());
    reply.extend_from_slice(&bytes);
    Ok(Response::new(reply))
}

/// Collect, step 1: the teacher picks a folder, or on Android where the zip goes. Gives the
/// session for the writes.
#[tauri::command(async)]
pub fn picker_collect_start(app: AppHandle, picker: State<'_, Picker>) -> Result<String, &'static str> {
    let session = platform::collect_start(&app).map_err(Code::name)?.ok_or(CANCELLED)?;
    Ok(picker.start(session))
}

/// Collect, step 2, once a file: the bytes are the raw body, `folder/file` is in `NAME_HEADER`.
#[tauri::command]
pub async fn picker_collect_write(request: Request<'_>, picker: State<'_, Picker>) -> Result<(), &'static str> {
    let bytes = body(&request)?;
    let token = header(&request, SESSION_HEADER)?;
    let name = header(&request, NAME_HEADER)?;
    let (folder, file) = name.split_once('/').ok_or(Code::Invalid.name())?;
    let mut sessions = picker.sessions.lock().unwrap_or_else(|e| e.into_inner());
    let session = sessions.get_mut(&token).ok_or(Code::Internal.name())?;
    platform::collect_write(session, folder, file, bytes).map_err(Code::name)
}

/// Collect, step 3: on Android the zip is finished and saved where the teacher picked; on iPad
/// it's finished, and the teacher picks where it goes now (closing that is `cancelled`). Nothing
/// to do on desktop. The session ends either way.
#[tauri::command(async)]
pub fn picker_collect_finish(app: AppHandle, picker: State<'_, Picker>, session: String) -> Result<(), &'static str> {
    let taken = picker.sessions.lock().unwrap_or_else(|e| e.into_inner()).remove(&session);
    let session = taken.ok_or(Code::Internal.name())?;
    match platform::collect_finish(&app, session) {
        Ok(true) => Ok(()),
        Ok(false) => Err(CANCELLED),
        Err(code) => Err(code.name()),
    }
}

/// Hand back, step 1: the teacher picks a folder, or on Android a zip, and what's in it is
/// listed. Any film over `FILE_LIMIT` is `too_big`, and nothing is read.
#[tauri::command(async)]
pub fn picker_hand_back_start(app: AppHandle, picker: State<'_, Picker>) -> Result<HandBack, &'static str> {
    let (session, files) = platform::hand_back_start(&app).map_err(Code::name)?.ok_or(CANCELLED)?;
    Ok(HandBack { session: picker.start(session), files })
}

/// Hand back, step 2, once a file: its bytes, as a raw reply.
#[tauri::command(async)]
pub fn picker_hand_back_read(
    picker: State<'_, Picker>,
    session: String,
    index: usize,
) -> Result<Response, &'static str> {
    let mut sessions = picker.sessions.lock().unwrap_or_else(|e| e.into_inner());
    let session = sessions.get_mut(&session).ok_or(Code::Internal.name())?;
    platform::hand_back_read(session, index).map(Response::new).map_err(Code::name)
}

/// The end of a Collect or a Hand back: the picked folder is forgotten, and anything left in the
/// cache removed.
#[tauri::command]
pub fn picker_end(picker: State<'_, Picker>, session: String) {
    let taken = picker.sessions.lock().unwrap_or_else(|e| e.into_inner()).remove(&session);
    if let Some(session) = taken {
        platform::end(session);
    }
}
