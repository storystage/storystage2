// No commands: only the native layer reads this, never the webview.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
