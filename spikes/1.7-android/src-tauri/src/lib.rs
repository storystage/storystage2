//! Spike 1.7: an app with no native commands, just the page.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running spike 1.7");
}
