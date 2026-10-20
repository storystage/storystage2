//! StoryStage 2 native shell.
//!
//! WP0.3 skeleton: opens the studio in a window and nothing else. The key store, the Claude
//! transport and its policy enforcement point (WP15.2) arrive with S8. No API key ever
//! crosses into the webview.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running StoryStage 2");
}
