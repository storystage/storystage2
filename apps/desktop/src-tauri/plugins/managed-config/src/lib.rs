//! Managed configuration on Android and Chromebook (spec 05 section 3.2): what a school pushes
//! through managed Google Play. A Tauri plugin because the schema in `app_restrictions.xml` has
//! to reach the app's manifest, and the Android project is generated in CI.
//!
//! The iPad needs no plugin: `storystage-policy` reads its user defaults directly.

#![cfg(target_os = "android")]

use std::collections::BTreeMap;

use serde::Deserialize;
use tauri::plugin::mobile::PluginInvokeError;
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

const PLUGIN_IDENTIFIER: &str = "org.storystage.managedconfig";

#[derive(Deserialize)]
struct Reply {
    values: BTreeMap<String, String>,
}

pub struct ManagedConfig<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> ManagedConfig<R> {
    /// The settings the school pushed, as strings. Empty if it pushed none.
    pub fn read(&self) -> Result<Vec<(String, String)>, PluginInvokeError> {
        let reply: Reply = self.0.run_mobile_plugin("read", ())?;
        Ok(reply.values.into_iter().collect())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("managed-config")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "ManagedConfigPlugin")?;
            app.manage(ManagedConfig(handle));
            Ok(())
        })
        .build()
}
