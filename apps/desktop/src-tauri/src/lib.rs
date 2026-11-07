//! StoryStage 2 native shell.
//!
//! Opens the studio in a window and reads the school lock (WP15.3, spec 05 section 3). The key
//! store, the Claude transport and its policy enforcement point (WP15.2) arrive with WP15k. No
//! API key ever crosses into the webview.

use storystage_policy::PolicyInForce;
use tauri::{App, Manager, State};

/// The policy in force, as read at start-up. Nothing writes the policy from here.
#[tauri::command]
fn policy_in_force(policy: State<'_, PolicyInForce>) -> PolicyInForce {
    policy.inner().clone()
}

#[cfg(target_os = "android")]
fn read_policy(app: &App) -> PolicyInForce {
    use tauri_plugin_managed_config::ManagedConfig;

    match app.state::<ManagedConfig<tauri::Wry>>().read() {
        Ok(pairs) => PolicyInForce::from_managed(pairs),
        Err(_) => PolicyInForce::unreadable("The school's settings can't be read."),
    }
}

#[cfg(not(target_os = "android"))]
fn read_policy(_app: &App) -> PolicyInForce {
    storystage_policy::read_installed()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_managed_config::init());
    builder
        .setup(|app| {
            let policy = read_policy(app);
            app.manage(policy);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![policy_in_force])
        .run(tauri::generate_context!())
        .expect("error while running StoryStage 2");
}
