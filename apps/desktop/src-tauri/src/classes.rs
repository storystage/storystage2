//! The pupil folders' native store (spec 05 section 6.4): five commands over
//! `storystage_classes::Store`, in `<local app data>/classes/`. The rules are in the crate; this
//! file finds the folder and talks to the webview. Bytes cross as raw bodies, never JSON.

use storystage_classes::{Code, Store};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, State};

/// The header that carries a write's path, as safe parts joined by `/`. A safe part has no `/`.
pub const PATH_HEADER: &str = "x-storystage-path";

pub struct Classes(Option<Store>);

impl Classes {
    /// Local app data, not roaming: a roaming profile would carry every film at each sign-in.
    pub fn new(app: &AppHandle) -> Self {
        Self(app.path().app_local_data_dir().ok().map(|folder| Store::new(folder.join("classes"))))
    }

    fn store(&self) -> Result<&Store, &'static str> {
        self.0.as_ref().ok_or(Code::Unreadable.name())
    }
}

/// A file's bytes, as a raw reply. Nothing there is `not_found`, which the studio reads as none.
#[tauri::command(async)]
pub fn classes_read(classes: State<'_, Classes>, path: Vec<String>) -> Result<Response, &'static str> {
    match classes.store()?.read(&path) {
        Ok(Some(bytes)) => Ok(Response::new(bytes)),
        Ok(None) => Err(Code::NotFound.name()),
        Err(code) => Err(code.name()),
    }
}

/// The bytes are the raw body, and the path is in `PATH_HEADER`.
#[tauri::command]
pub async fn classes_write(request: Request<'_>, classes: State<'_, Classes>) -> Result<(), &'static str> {
    let InvokeBody::Raw(bytes) = request.body() else { return Err(Code::Internal.name()) };
    let path: Vec<String> = request
        .headers()
        .get(PATH_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or(Code::Internal.name())?
        .split('/')
        .map(str::to_owned)
        .collect();
    classes.store()?.write(&path, bytes).map_err(Code::name)
}

#[tauri::command(async)]
pub fn classes_remove(classes: State<'_, Classes>, path: Vec<String>) -> Result<(), &'static str> {
    classes.store()?.remove(&path).map_err(Code::name)
}

#[tauri::command(async)]
pub fn classes_list(classes: State<'_, Classes>, path: Vec<String>) -> Result<Vec<String>, &'static str> {
    classes.store()?.list(&path).map_err(Code::name)
}

#[tauri::command(async)]
pub fn classes_move(classes: State<'_, Classes>, from: Vec<String>, to: Vec<String>) -> Result<(), &'static str> {
    classes.store()?.r#move(&from, &to).map_err(Code::name)
}
