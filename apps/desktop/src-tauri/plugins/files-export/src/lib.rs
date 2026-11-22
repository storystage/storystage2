//! iPad's own Files dialogs (spec 05 section 6.5, owner 17 Nov): export copies of files the app
//! wrote to its cache, to a place the person picks in Files, OneDrive or Google Drive; and pick a
//! file to open, which iPadOS copies into the app for it to read. iPadOS has no "save as", so a
//! copy is always written first and exported after. The plugin has no commands, so nothing here
//! can be reached from the webview: `src/picker.rs` calls it from Rust.

#![cfg(target_os = "ios")]

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::plugin::mobile::PluginInvokeError;
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

tauri::ios_plugin_binding!(init_plugin_files_export);

#[derive(Serialize)]
struct Export<'a> {
    paths: Vec<&'a str>,
}

#[derive(Deserialize)]
struct Exported {
    saved: bool,
}

/// What may be picked to open: a production, or a class zip.
#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Production,
    Zip,
}

#[derive(Serialize)]
struct Pick {
    kind: Kind,
}

#[derive(Deserialize)]
struct Picked {
    path: Option<String>,
}

pub struct FilesExport<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> FilesExport<R> {
    /// Exports copies of these files together, to one place the person picks. `false` if they
    /// closed the dialog. The files stay where they are, for the caller to remove.
    pub fn export(&self, files: &[&Path]) -> Result<bool, PluginInvokeError> {
        let paths = files.iter().map(|path| path.to_str().unwrap_or_default()).collect();
        Ok(self.0.run_mobile_plugin::<Exported>("export", Export { paths })?.saved)
    }

    /// A copy of the file the person picked, inside the app, for the caller to read and remove.
    /// `None` if they closed the dialog.
    pub fn pick(&self, kind: Kind) -> Result<Option<PathBuf>, PluginInvokeError> {
        Ok(self.0.run_mobile_plugin::<Picked>("pick", Pick { kind })?.path.map(PathBuf::from))
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("files-export")
        .setup(|app, api| {
            let handle = api.register_ios_plugin(init_plugin_files_export)?;
            app.manage(FilesExport(handle));
            Ok(())
        })
        .build()
}
