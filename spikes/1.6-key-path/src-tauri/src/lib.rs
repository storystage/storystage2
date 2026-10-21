//! Spike 1.6: the key path. The key lives in the OS secure store (Windows Credential Manager,
//! macOS Keychain) and is read only here, in the native layer, after the policy check passes.
//! No command returns it, takes it, or echoes anything derived from it.
//!
//! Also the Tauri harness for spike 1.8: `spike_report` writes a page's results (and a file)
//! to `SPIKE_OUT`, and `spike_exit` closes the app, so CI can run a page inside WebView2 and
//! WKWebView unattended.

pub mod policy;
pub mod sse;
pub mod transport;

use base64::Engine as _;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{ipc::Channel, AppHandle, State};
use transport::{error, PrompterEvent};

/// Where the spike keeps its test key. The real app uses its own entry (WP15.2).
pub const SERVICE: &str = "StoryStage2-spike";
pub const ACCOUNT: &str = "anthropic-api-key";

pub fn key_entry() -> keyring::Result<keyring::Entry> {
    keyring::Entry::new(SERVICE, ACCOUNT)
}

#[derive(Deserialize)]
pub struct PrompterRequest {
    /// For cancelling and logs (not used by the spike).
    #[allow(dead_code)]
    pub id: String,
    pub mode: String,
    pub body: Value,
}

/// Only the spike may point the transport somewhere else (the fake Claude server in CI).
fn base_url() -> String {
    std::env::var("FAKE_CLAUDE_URL").unwrap_or_else(|_| "https://api.anthropic.com".into())
}

#[tauri::command]
fn prompter_status() -> Value {
    match key_entry().and_then(|e| e.get_password()) {
        Ok(_) => json!({ "available": true }),
        Err(_) => json!({ "available": false, "reason": "no_key" }),
    }
}

#[tauri::command]
async fn prompter_send(
    request: PrompterRequest,
    channel: Channel<PrompterEvent>,
    policy: State<'_, policy::Policy>,
) -> Result<(), String> {
    let send = |e: PrompterEvent| {
        let _ = channel.send(e);
    };
    if let Err(code) = policy.check(&request.mode, &request.body) {
        send(error(code));
        return Ok(());
    }
    // The key is read here, used for one request, and dropped when this function returns.
    let key = match key_entry().and_then(|e| e.get_password()) {
        Ok(k) => k,
        Err(_) => {
            send(error("no_key"));
            return Ok(());
        }
    };
    transport::stream(&base_url(), &key, &request.body, send).await;
    Ok(())
}

fn out_dir() -> Result<PathBuf, String> {
    let dir = PathBuf::from(std::env::var("SPIKE_OUT").map_err(|_| "SPIKE_OUT is not set".to_string())?);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Writes a page's results, and optionally a file, for CI to read.
#[tauri::command]
fn spike_report(name: String, json: String, file_name: Option<String>, file_base64: Option<String>) -> Result<(), String> {
    let safe = |s: &str| s.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c)) && !s.starts_with('.');
    if !safe(&name) {
        return Err("bad report name".into());
    }
    let dir = out_dir()?;
    std::fs::write(dir.join(format!("{name}.json")), json).map_err(|e| e.to_string())?;
    if let (Some(file), Some(data)) = (file_name, file_base64) {
        if !safe(&file) {
            return Err("bad file name".into());
        }
        let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
        std::fs::write(dir.join(file), bytes).map_err(|e| e.to_string())?;
    }
    std::fs::write(dir.join(format!("{name}.done")), b"").map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn spike_exit(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(policy::Policy::default())
        .invoke_handler(tauri::generate_handler![prompter_status, prompter_send, spike_report, spike_exit])
        .run(tauri::generate_context!())
        .expect("error while running the spike harness");
}

#[cfg(all(test, windows))]
mod keyring_tests {
    /// The key round-trips through Windows Credential Manager, under a test-only entry.
    #[test]
    fn stores_reads_and_deletes_a_key_in_credential_manager() {
        let entry = keyring::Entry::new("StoryStage2-spike-test", "unit-test").unwrap();
        let key = format!("test-{}", std::process::id());
        entry.set_password(&key).unwrap();
        assert_eq!(entry.get_password().unwrap(), key);
        entry.delete_credential().unwrap();
        assert!(entry.get_password().is_err());
    }
}
