//! The system's own file picker (spec 05 section 6.5). The dialog opens from Rust, so the webview
//! never holds a path: it sends bytes and names, and gets bytes back. The rules about what may be
//! written and read are in `storystage_classes::picked`.
//!
//! On desktop the dialog is `tauri-plugin-dialog`'s, used from Rust only: no window is given the
//! plugin's own permissions. On iPad and Android, `picker_kind` says `browser`, and the studio
//! uses the webview's file inputs instead, until the native dialogs there are tried on devices.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use storystage_classes::picked::{self, Found};
use storystage_classes::Code;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, State};

/// The header with a name: a copy's suggested name, or Collect's `folder/file`.
pub const NAME_HEADER: &str = "x-storystage-name";
/// The header with the Collect that a write belongs to.
pub const SESSION_HEADER: &str = "x-storystage-session";

/// A Collect or a Hand back under way: the folder the teacher picked, or what was found in it.
enum Session {
    Collect(PathBuf),
    HandBack(Vec<Found>),
}

#[derive(Default)]
pub struct Picker {
    next: AtomicU64,
    sessions: Mutex<HashMap<String, Session>>,
}

impl Picker {
    fn start(&self, session: Session) -> String {
        let token = format!("picked-{}", self.next.fetch_add(1, Ordering::Relaxed));
        self.sessions.lock().unwrap_or_else(|e| e.into_inner()).insert(token.clone(), session);
        token
    }
}

#[cfg(desktop)]
mod dialog {
    use std::path::PathBuf;

    use storystage_classes::Code;
    use tauri::AppHandle;
    use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

    fn productions(app: &AppHandle) -> FileDialogBuilder<tauri::Wry> {
        app.dialog().file().add_filter("StoryStage production", &["storystage"])
    }

    /// `Ok(None)` when the person closed the dialog.
    pub fn save(app: &AppHandle, name: &str) -> Result<Option<PathBuf>, Code> {
        Ok(productions(app).set_file_name(name).blocking_save_file().and_then(|path| path.into_path().ok()))
    }

    pub fn file(app: &AppHandle) -> Result<Option<PathBuf>, Code> {
        Ok(productions(app).blocking_pick_file().and_then(|path| path.into_path().ok()))
    }

    pub fn folder(app: &AppHandle) -> Result<Option<PathBuf>, Code> {
        Ok(app.dialog().file().blocking_pick_folder().and_then(|path| path.into_path().ok()))
    }
}

#[cfg(mobile)]
mod dialog {
    use std::path::PathBuf;

    use storystage_classes::Code;
    use tauri::AppHandle;

    pub fn save(_app: &AppHandle, _name: &str) -> Result<Option<PathBuf>, Code> {
        Err(Code::Internal)
    }

    pub fn file(_app: &AppHandle) -> Result<Option<PathBuf>, Code> {
        Err(Code::Internal)
    }

    pub fn folder(_app: &AppHandle) -> Result<Option<PathBuf>, Code> {
        Err(Code::Internal)
    }
}

const CANCELLED: &str = "cancelled";

fn header(request: &Request<'_>, name: &str) -> Result<String, &'static str> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(picked::decode_header)
        .ok_or(Code::Internal.name())
}

fn body<'a>(request: &'a Request<'_>) -> Result<&'a [u8], &'static str> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        _ => Err(Code::Internal.name()),
    }
}

/// Which picker the studio should use: `native` on desktop, `browser` on iPad and Android.
#[tauri::command]
pub fn picker_kind() -> &'static str {
    if cfg!(desktop) {
        "native"
    } else {
        "browser"
    }
}

/// Save a copy: the bytes are the raw body and the suggested name is in `NAME_HEADER`.
#[tauri::command]
pub async fn picker_save(app: AppHandle, request: Request<'_>) -> Result<(), &'static str> {
    let bytes = body(&request)?;
    if bytes.len() > storystage_classes::FILE_LIMIT {
        return Err(Code::TooBig.name());
    }
    let name = header(&request, NAME_HEADER)?;
    let path = dialog::save(&app, &name).map_err(Code::name)?.ok_or(CANCELLED)?;
    picked::save(&path, bytes).map_err(Code::name)
}

/// Open: the file's name and bytes as one raw reply, so a big file is never turned into JSON.
/// The first four bytes are the name's length, big-endian, then the name in UTF-8, then the file.
#[tauri::command(async)]
pub fn picker_open(app: AppHandle) -> Result<Response, &'static str> {
    let path = dialog::file(&app).map_err(Code::name)?.ok_or(CANCELLED)?;
    let bytes = picked::read(&path).map_err(Code::name)?;
    let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("file.storystage");
    let mut reply = Vec::with_capacity(4 + name.len() + bytes.len());
    reply.extend_from_slice(&(name.len() as u32).to_be_bytes());
    reply.extend_from_slice(name.as_bytes());
    reply.extend_from_slice(&bytes);
    Ok(Response::new(reply))
}

/// Collect, step 1: the teacher picks a folder. Gives the session for the writes.
#[tauri::command(async)]
pub fn picker_collect_start(app: AppHandle, picker: State<'_, Picker>) -> Result<String, &'static str> {
    let folder = dialog::folder(&app).map_err(Code::name)?.ok_or(CANCELLED)?;
    Ok(picker.start(Session::Collect(folder)))
}

/// Collect, step 2, once a file: the bytes are the raw body, `folder/file` is in `NAME_HEADER`.
#[tauri::command]
pub async fn picker_collect_write(request: Request<'_>, picker: State<'_, Picker>) -> Result<(), &'static str> {
    let bytes = body(&request)?;
    let token = header(&request, SESSION_HEADER)?;
    let name = header(&request, NAME_HEADER)?;
    let (folder, file) = name.split_once('/').ok_or(Code::Invalid.name())?;
    let chosen = match picker.sessions.lock().unwrap_or_else(|e| e.into_inner()).get(&token) {
        Some(Session::Collect(chosen)) => chosen.clone(),
        _ => return Err(Code::Internal.name()),
    };
    picked::collect(&chosen, folder, file, bytes).map_err(Code::name)
}

#[derive(Serialize)]
pub struct HandBack {
    session: String,
    files: Vec<HandBackFile>,
}

#[derive(Serialize)]
pub struct HandBackFile {
    folder: String,
    file: String,
}

/// Hand back, step 1: the teacher picks a folder, and what's in it is listed. Any file over
/// `FILE_LIMIT` is `too_big`, and nothing is read.
#[tauri::command(async)]
pub fn picker_hand_back_start(app: AppHandle, picker: State<'_, Picker>) -> Result<HandBack, &'static str> {
    let folder = dialog::folder(&app).map_err(Code::name)?.ok_or(CANCELLED)?;
    let found = picked::hand_back(&folder).map_err(Code::name)?;
    let files = found.iter().map(|f| HandBackFile { folder: f.folder.clone(), file: f.file.clone() }).collect();
    Ok(HandBack { session: picker.start(Session::HandBack(found)), files })
}

/// Hand back, step 2, once a file: its bytes, as a raw reply.
#[tauri::command(async)]
pub fn picker_hand_back_read(
    picker: State<'_, Picker>,
    session: String,
    index: usize,
) -> Result<Response, &'static str> {
    let path = match picker.sessions.lock().unwrap_or_else(|e| e.into_inner()).get(&session) {
        Some(Session::HandBack(found)) => found.get(index).map(|f| f.path.clone()).ok_or(Code::NotFound.name())?,
        _ => return Err(Code::Internal.name()),
    };
    picked::read(&path).map(Response::new).map_err(Code::name)
}

/// The end of a Collect or a Hand back: the picked folder is forgotten.
#[tauri::command]
pub fn picker_end(picker: State<'_, Picker>, session: String) {
    picker.sessions.lock().unwrap_or_else(|e| e.into_inner()).remove(&session);
}
