//! StoryStage 2 native shell.
//!
//! Opens the studio in a window, reads the school lock (WP15.3, spec 05 section 3), carries the
//! Prompter's requests (WP15.2, section 2), keeps a desktop install up to date (WP15.7,
//! section 4) and hands speech input its checked model (section 5). No API key ever crosses
//! into the webview.

mod key_dialog;
mod prompter;
mod speech;
#[cfg(desktop)]
mod updates;

use storystage_policy::PolicyInForce;
use tauri::{AppHandle, Manager, State};

/// The policy in force, as read at start-up. Nothing writes the policy from here.
#[tauri::command]
fn policy_in_force(policy: State<'_, PolicyInForce>) -> PolicyInForce {
    policy.inner().clone()
}

/// The installed version, for About (spec 05 section 4.6).
#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[cfg(target_os = "android")]
fn read_policy(app: &AppHandle) -> PolicyInForce {
    use tauri_plugin_managed_config::ManagedConfig;

    match app.state::<ManagedConfig<tauri::Wry>>().read() {
        Ok(pairs) => PolicyInForce::from_managed(pairs),
        Err(_) => PolicyInForce::unreadable("The school's settings can't be read."),
    }
}

#[cfg(not(target_os = "android"))]
fn read_policy(_app: &AppHandle) -> PolicyInForce {
    storystage_policy::read_installed()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder
        .plugin(tauri_plugin_managed_config::init())
        .plugin(tauri_plugin_secure_key::init())
        // For the bundled speech model inside the APK, from Rust only (spec 05 section 5.2).
        .plugin(tauri_plugin_fs::init());
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .setup(|app| {
            let policy = read_policy(app.handle());
            app.manage(policy);
            app.manage(prompter::Prompter::default());
            app.manage(speech::Speech::default());
            #[cfg(desktop)]
            {
                app.manage(updates::Pending::default());
                updates::start(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            policy_in_force,
            app_version,
            prompter::prompter_send,
            prompter::prompter_cancel,
            prompter::prompter_status,
            prompter::key_add,
            prompter::key_status,
            prompter::key_remove,
            speech::speech_models,
            speech::speech_model_load,
            speech::speech_model_download,
            speech::speech_model_cancel,
            speech::speech_model_remove,
        ])
        .build(tauri::generate_context!())
        .expect("error while running StoryStage 2")
        .run(|_app, _event| {
            #[cfg(desktop)]
            if let tauri::RunEvent::Exit = _event {
                updates::install_pending(_app);
            }
        });
}
