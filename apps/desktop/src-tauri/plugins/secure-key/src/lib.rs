//! The key's store and dialog on Android and Chromebook (spec 05 sections 1.2, 2.1). An AES key
//! held in Android Keystore, which can't leave it, encrypts the Claude key. The plugin has no
//! commands, so nothing here can be reached from the webview.

#![cfg(target_os = "android")]

use serde::{Deserialize, Serialize};
use tauri::plugin::mobile::PluginInvokeError;
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

const PLUGIN_IDENTIFIER: &str = "org.storystage.securekey";

#[derive(Deserialize)]
struct Text {
    text: Option<String>,
}

#[derive(Serialize)]
struct Save<'a> {
    text: &'a str,
}

pub struct SecureKey<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> SecureKey<R> {
    /// The text typed into the system dialog. `None` if it was closed.
    pub fn ask(&self) -> Result<Option<String>, PluginInvokeError> {
        Ok(self.0.run_mobile_plugin::<Text>("ask", ())?.text)
    }

    /// The stored key's text. `None` if there isn't one.
    pub fn load(&self) -> Result<Option<String>, PluginInvokeError> {
        Ok(self.0.run_mobile_plugin::<Text>("load", ())?.text)
    }

    pub fn save(&self, text: &str) -> Result<(), PluginInvokeError> {
        self.0.run_mobile_plugin("save", Save { text })
    }

    pub fn delete(&self) -> Result<(), PluginInvokeError> {
        self.0.run_mobile_plugin("delete", ())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("secure-key")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "SecureKeyPlugin")?;
            app.manage(SecureKey(handle));
            Ok(())
        })
        .build()
}
