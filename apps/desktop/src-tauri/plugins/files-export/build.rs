// No commands: only the native layer may reach this, never the webview.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
