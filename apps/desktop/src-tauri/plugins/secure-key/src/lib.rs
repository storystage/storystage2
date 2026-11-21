//! The key's dialog on Android, Chromebook and iPad, and its store on Android (spec 05 sections
//! 1.2, 2.1). On Android an AES key held in Android Keystore, which can't leave it, encrypts the
//! Claude key. On iPad the key goes to the Keychain from Rust (`storystage_transport::key`), so the
//! plugin only asks for it. The plugin has no commands, so nothing here can be reached from the
//! webview.

#![cfg(any(target_os = "android", target_os = "ios"))]

use serde::Deserialize;
#[cfg(target_os = "android")]
use serde::Serialize;
use tauri::plugin::mobile::PluginInvokeError;
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "org.storystage.securekey";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_secure_key);

#[derive(Deserialize)]
struct Text {
    text: Option<String>,
}

#[cfg(target_os = "android")]
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
    #[cfg(target_os = "android")]
    pub fn load(&self) -> Result<Option<String>, PluginInvokeError> {
        Ok(self.0.run_mobile_plugin::<Text>("load", ())?.text)
    }

    #[cfg(target_os = "android")]
    pub fn save(&self, text: &str) -> Result<(), PluginInvokeError> {
        self.0.run_mobile_plugin("save", Save { text })
    }

    #[cfg(target_os = "android")]
    pub fn delete(&self) -> Result<(), PluginInvokeError> {
        self.0.run_mobile_plugin("delete", ())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("secure-key")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "SecureKeyPlugin")?;
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_secure_key)?;
            app.manage(SecureKey(handle));
            Ok(())
        })
        .build()
}
