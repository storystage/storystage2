//! StoryStage 2 native shell.
//!
//! Opens the studio in a window and reads the school lock (WP15.3, spec 05 section 3). The key
//! store, the Claude transport and its policy enforcement point (WP15.2) arrive with WP15k. No
//! API key ever crosses into the webview.

use storystage_policy::PolicyInForce;
use tauri::State;

/// The policy in force, as read at start-up. Nothing writes the policy from here.
#[tauri::command]
fn policy_in_force(policy: State<'_, PolicyInForce>) -> PolicyInForce {
    policy.inner().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(storystage_policy::read_installed())
        .invoke_handler(tauri::generate_handler![policy_in_force])
        .run(tauri::generate_context!())
        .expect("error while running StoryStage 2");
}
