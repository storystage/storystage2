//! The shipped Backstage, served to the webview read-only (decision 0062, spec 05 section 7).
//! `.backstage/` is bundled as a resource, and this protocol serves files from it, at
//! `backstage://localhost/`, which Windows and Android show as `http://backstage.localhost/`.
//! Only plain relative paths inside it (`storystage_classes::backstage_files`), and never a link.
//! The headers let the studio, which is cross-origin isolated, fetch and show them.

use storystage_classes::backstage_files::{content_type, is_served};
use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

pub const SCHEME: &str = "backstage";

/// Where the studio finds the shipped Backstage: the protocol's address on this platform.
#[tauri::command]
pub fn backstage_folder() -> &'static str {
    if cfg!(any(windows, target_os = "android")) {
        "http://backstage.localhost/"
    } else {
        "backstage://localhost/"
    }
}

fn read(app: &AppHandle, path: &str) -> Option<Vec<u8>> {
    let resolved = app.path().resolve(format!("backstage/{path}"), BaseDirectory::Resource).ok()?;
    // Inside the APK on Android, so only the fs plugin can read it, from Rust.
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_fs::FsExt;
        app.fs().read(resolved).ok()
    }
    #[cfg(not(target_os = "android"))]
    {
        let meta = std::fs::symlink_metadata(&resolved).ok()?;
        if !meta.is_file() {
            return None;
        }
        std::fs::read(resolved).ok()
    }
}

fn respond(status: StatusCode, kind: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, kind)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header("Cross-Origin-Resource-Policy", "cross-origin")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(header::CACHE_CONTROL, "max-age=86400")
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

/// Serves one request: a file, or not found. Only GET and HEAD.
pub fn handle(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return respond(StatusCode::METHOD_NOT_ALLOWED, "text/plain", Vec::new());
    }
    let path = request.uri().path().trim_start_matches('/');
    if !is_served(path) {
        return respond(StatusCode::NOT_FOUND, "text/plain", Vec::new());
    }
    match read(app, path) {
        Some(bytes) if request.method() == Method::HEAD => {
            let _ = bytes;
            respond(StatusCode::OK, content_type(path), Vec::new())
        }
        Some(bytes) => respond(StatusCode::OK, content_type(path), bytes),
        None => respond(StatusCode::NOT_FOUND, "text/plain", Vec::new()),
    }
}
