//! The speech models' commands (spec 05 section 5.5). They take a pinned model's name, never a
//! path, and hand the webview only bytes that match their pin. The rules are in
//! `storystage_speech`; this file finds the files and talks to the webview.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use storystage_speech::{allowed, check_bundled, is_downloaded, load_downloaded, remove, Code, Model, Pins};
use tauri::ipc::{Channel, Response};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, State};
use tokio::sync::watch;

use crate::read_policy;

pub struct Speech {
    pins: Pins,
    /// Downloads under way, by model name, so `speech_model_cancel` can reach them.
    running: Mutex<HashMap<String, watch::Sender<bool>>>,
}

impl Default for Speech {
    fn default() -> Self {
        Self { pins: Pins::shipped(), running: Mutex::new(HashMap::new()) }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    name: String,
    bytes: u64,
    bundled: bool,
    ready: bool,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DownloadEvent {
    Progress { received: u64, total: u64 },
    End,
    Error { code: Code },
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, Code> {
    let folder = app.path().app_local_data_dir().map_err(|_| Code::Internal)?;
    Ok(folder.join("speech"))
}

/// A pinned model, if dictation is allowed now. The policy is read again each time.
fn pinned<'a>(app: &AppHandle, speech: &'a Speech, name: &str) -> Result<&'a Model, Code> {
    if !allowed(&read_policy(app)) {
        return Err(Code::RefusedByPolicy);
    }
    speech.pins.model(name).ok_or(Code::Internal)
}

/// The bundled model, from the app's resources (spec 05 section 5.2).
fn read_bundled(app: &AppHandle, model: &Model) -> Result<Vec<u8>, Code> {
    let path = app
        .path()
        .resolve(format!("speech/{}", model.file), BaseDirectory::Resource)
        .map_err(|_| Code::Internal)?;
    // Inside the APK on Android, so only the fs plugin can read it. Rust only: no window is
    // given the plugin's permissions (threat M5).
    #[cfg(target_os = "android")]
    let bytes = {
        use tauri_plugin_fs::FsExt;
        app.fs().read(path).map_err(|_| Code::Internal)?
    };
    #[cfg(not(target_os = "android"))]
    let bytes = std::fs::read(path).map_err(|_| Code::Internal)?;
    check_bundled(bytes, model)
}

#[tauri::command(async)]
pub fn speech_models(app: AppHandle, speech: State<'_, Speech>) -> Vec<Info> {
    let dir = data_dir(&app).ok();
    let ready = |model: &Model| model.bundled || dir.as_deref().is_some_and(|dir| is_downloaded(dir, model));
    speech
        .pins
        .models
        .iter()
        .map(|model| Info { name: model.name.clone(), bytes: model.bytes, bundled: model.bundled, ready: ready(model) })
        .collect()
}

/// The checked bytes, as a raw reply: a 32 or 78 MB model is never turned into JSON.
#[tauri::command(async)]
pub fn speech_model_load(app: AppHandle, speech: State<'_, Speech>, name: String) -> Result<Response, &'static str> {
    let load = || {
        let model = pinned(&app, &speech, &name)?;
        if model.bundled {
            read_bundled(&app, model)
        } else {
            load_downloaded(&data_dir(&app)?, model)
        }
    };
    load().map(Response::new).map_err(Code::name)
}

#[tauri::command]
pub async fn speech_model_download(
    app: AppHandle,
    speech: State<'_, Speech>,
    name: String,
    channel: Channel<DownloadEvent>,
) -> Result<(), &'static str> {
    let send = |event: DownloadEvent| {
        let _ = channel.send(event);
    };
    let model = match pinned(&app, &speech, &name) {
        Ok(model) => model.clone(),
        Err(code) => return Err(code.name()),
    };
    // The bundled model is always there: nothing to fetch.
    if model.bundled {
        send(DownloadEvent::End);
        return Ok(());
    }
    let dir = data_dir(&app).map_err(Code::name)?;
    let (stop, cancel) = watch::channel(false);
    {
        let mut running = speech.running.lock().map_err(|_| Code::Internal.name())?;
        if running.contains_key(&model.name) {
            return Err(Code::Internal.name());
        }
        running.insert(model.name.clone(), stop);
    }
    let url = speech.pins.download_url(&model);
    let progress = |received, total| send(DownloadEvent::Progress { received, total });
    let result = storystage_speech::download(&url, &model, &dir, progress, cancel).await;
    if let Ok(mut running) = speech.running.lock() {
        running.remove(&model.name);
    }
    match result {
        Ok(()) => send(DownloadEvent::End),
        Err(code) => send(DownloadEvent::Error { code }),
    }
    Ok(())
}

#[tauri::command]
pub fn speech_model_cancel(speech: State<'_, Speech>, name: String) {
    if let Ok(running) = speech.running.lock() {
        if let Some(stop) = running.get(&name) {
            let _ = stop.send(true);
        }
    }
}

#[tauri::command(async)]
pub fn speech_model_remove(app: AppHandle, speech: State<'_, Speech>, name: String) -> Result<(), &'static str> {
    let model = pinned(&app, &speech, &name).map_err(Code::name)?;
    remove(&data_dir(&app).map_err(Code::name)?, model).map_err(Code::name)
}
