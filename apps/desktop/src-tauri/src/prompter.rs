//! The Prompter's commands (WP15.2, spec 05 sections 1.3 and 2.6). The order in `begin` is the
//! point of this file: the policy is read again, the gate checks the request, the caps are
//! counted, and only then is the key read. No command takes or returns the key.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Value};
use storystage_gate::caps::{day_level, DayCounts, Minute, DEVICE};
use storystage_gate::{check, Code, Pins, PrompterEvent, PrompterRequest};
use storystage_policy::{PolicyInForce, PrompterLevel};
use storystage_transport::{add_key, send, Key};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio::sync::watch;

use crate::{key_dialog, read_policy};

/// The running request, so `prompter_cancel` can reach it.
struct Running {
    id: String,
    stop: watch::Sender<bool>,
}

pub struct Prompter {
    pins: Pins,
    minute: Mutex<Minute>,
    running: Mutex<Option<Running>>,
    /// The pupil whose folder is open, whom requests count against (spec 05 section 2.4).
    pupil: Mutex<Option<String>>,
}

/// The pins built into the app. Only the leak scan's test build can give it others, because the
/// shipped ones would refuse its request before it ever reached the key.
fn pins() -> Pins {
    #[cfg(feature = "test-endpoint")]
    if let Some(pins) = std::env::var("STORYSTAGE_TEST_PINS")
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
    {
        return pins;
    }
    Pins::shipped()
}

impl Default for Prompter {
    fn default() -> Self {
        Self {
            pins: pins(),
            minute: Mutex::new(Minute::default()),
            running: Mutex::new(None),
            pupil: Mutex::new(None),
        }
    }
}

#[cfg(not(target_os = "android"))]
mod store {
    use storystage_transport::key;
    use storystage_transport::Key;
    use tauri::AppHandle;

    pub fn load(_app: &AppHandle) -> Option<Key> {
        key::load().ok().flatten()
    }

    pub fn save(_app: &AppHandle, key_to_save: &Key) -> bool {
        key::save(key_to_save).is_ok()
    }

    pub fn delete(_app: &AppHandle) {
        let _ = key::delete();
    }
}

/// Android Keystore, through the `secure-key` plugin.
#[cfg(target_os = "android")]
mod store {
    use storystage_transport::Key;
    use tauri::{AppHandle, Manager, State, Wry};
    use tauri_plugin_secure_key::SecureKey;

    fn plugin(app: &AppHandle) -> State<'_, SecureKey<Wry>> {
        app.state::<SecureKey<Wry>>()
    }

    pub fn load(app: &AppHandle) -> Option<Key> {
        plugin(app).load().ok().flatten().and_then(Key::new)
    }

    pub fn save(app: &AppHandle, key: &Key) -> bool {
        plugin(app).save(key.for_android_store()).is_ok()
    }

    pub fn delete(app: &AppHandle) {
        let _ = plugin(app).delete();
    }
}

/// Only a test build can point somewhere else (spec 05 section 2.2).
fn endpoint() -> String {
    #[cfg(feature = "test-endpoint")]
    if let Ok(url) = std::env::var("STORYSTAGE_TEST_ENDPOINT") {
        return url;
    }
    storystage_transport::ANTHROPIC.to_string()
}

fn seconds_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |time| time.as_secs())
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn day_file(app: &AppHandle) -> Option<PathBuf> {
    let folder = app.path().app_local_data_dir().ok()?;
    fs::create_dir_all(&folder).ok()?;
    Some(folder.join("prompter-day"))
}

fn day_counts(file: Option<&PathBuf>) -> DayCounts {
    let stored = file.and_then(|path| fs::read_to_string(path).ok());
    DayCounts::read(stored.as_deref(), &today())
}

/// Whom a request counts against: the open pupil, or the device.
fn who(prompter: &Prompter) -> String {
    prompter.pupil.lock().ok().and_then(|pupil| pupil.clone()).unwrap_or_else(|| DEVICE.to_string())
}

/// Everything up to the network. Returns the key and the way to stop this request.
fn begin(
    app: &AppHandle,
    prompter: &Prompter,
    request: &PrompterRequest,
) -> Result<(Key, watch::Receiver<bool>), PrompterEvent> {
    let refuse = |code| PrompterEvent::error(code);
    let policy = read_policy(app);
    let file = day_file(app);
    let mut counts = day_counts(file.as_ref());
    let who = who(prompter);
    let day = day_level(&policy.prompter, counts.used(&who));
    check(request, policy.prompter.level, day, &prompter.pins).map_err(refuse)?;

    let mut running = prompter.running.lock().map_err(|_| refuse(Code::Internal))?;
    if running.is_some() {
        return Err(refuse(Code::RateLimited));
    }
    let mut minute = prompter.minute.lock().map_err(|_| refuse(Code::Internal))?;
    minute.take(seconds_now()).map_err(|seconds| PrompterEvent::Error {
        code: Code::RateLimited,
        retry_after_seconds: Some(seconds),
    })?;
    // The key is read last, so a request that was refused never touches it.
    let key = store::load(app).ok_or_else(|| refuse(Code::NoKey))?;

    if let Some(path) = &file {
        counts.add(&who);
        let _ = fs::write(path, counts.write(&today()));
    }
    let (stop, cancel) = watch::channel(false);
    *running = Some(Running { id: request.id.clone(), stop });
    Ok((key, cancel))
}

#[tauri::command]
pub async fn prompter_send(
    app: AppHandle,
    prompter: State<'_, Prompter>,
    request: PrompterRequest,
    channel: Channel<PrompterEvent>,
) -> Result<(), String> {
    let emit = move |event: PrompterEvent| {
        let _ = channel.send(event);
    };
    match begin(&app, &prompter, &request) {
        Ok((key, cancel)) => {
            send(&endpoint(), &key, &request, cancel, emit).await;
            if let Ok(mut running) = prompter.running.lock() {
                *running = None;
            }
        }
        Err(event) => emit(event),
    }
    Ok(())
}

#[tauri::command]
pub fn prompter_cancel(prompter: State<'_, Prompter>, id: String) {
    if let Ok(running) = prompter.running.lock() {
        if let Some(running) = running.as_ref().filter(|running| running.id == id) {
            let _ = running.stop.send(true);
        }
    }
}

/// Whose folder is open, so requests count against them; `None` when nobody's is. The host
/// calls it as a folder opens and closes. An id that isn't a safe part counts as nobody's.
#[tauri::command]
pub fn prompter_pupil(prompter: State<'_, Prompter>, pupil: Option<String>) {
    let pupil = pupil.filter(|id| storystage_classes::is_safe_part(id) && id != DEVICE);
    if let Ok(mut open) = prompter.pupil.lock() {
        *open = pupil;
    }
}

/// Today's use on this device, for the teacher (spec 05 section 2.4): the cap, and each pupil's
/// count and level. Ids only: the studio has the names.
#[tauri::command(async)]
pub fn prompter_usage(app: AppHandle) -> Value {
    let policy = read_policy(&app);
    let counts = day_counts(day_file(&app).as_ref());
    let entries: Vec<Value> = counts
        .entries()
        .map(|(who, used)| {
            json!({
                "pupil": if who == DEVICE { Value::Null } else { json!(who) },
                "used": used,
                "level": day_level(&policy.prompter, used),
            })
        })
        .collect();
    json!({
        "date": today(),
        "level": policy.prompter.level,
        "dailyCap": policy.prompter.daily_cap,
        "capAction": policy.prompter.cap_action,
        "entries": entries,
    })
}

fn status_of(policy: &PolicyInForce, key_present: bool) -> Value {
    if policy.prompter.level == PrompterLevel::Off {
        json!({ "available": false, "reason": "prompter_off" })
    } else if !key_present {
        json!({ "available": false, "reason": "no_key" })
    } else {
        json!({ "available": true })
    }
}

/// Reads the policy again, so a lock applied while the app is open shows at once (spec 05
/// section 2.6). Never says anything about the key but whether there is one. These commands run
/// off the main thread because Android's store waits on a plugin.
#[tauri::command(async)]
pub fn prompter_status(app: AppHandle) -> Value {
    status_of(&read_policy(&app), store::load(&app).is_some())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum KeyStatus {
    Present,
    Absent,
}

#[tauri::command(async)]
pub fn key_status(app: AppHandle) -> KeyStatus {
    if store::load(&app).is_some() {
        KeyStatus::Present
    } else {
        KeyStatus::Absent
    }
}

/// Deletes the key, which switches the Prompter off (spec 05 section 1.3).
#[tauri::command(async)]
pub fn key_remove(app: AppHandle) {
    store::delete(&app);
}

/// Opens the system dialog, checks what was typed, and stores it (spec 05 sections 1.2, 1.3).
/// It takes nothing, and returns one word: the studio never touches the key.
#[tauri::command]
pub async fn key_add(app: AppHandle) -> &'static str {
    if read_policy(&app).prompter.level == PrompterLevel::Off {
        return "refusedByPolicy";
    }
    let typed = key_dialog::ask(&app).await;
    add_key(&endpoint(), typed, |key| store::save(&app, key)).await.name()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_lock_comes_before_the_key_in_the_status() {
        let locked = PolicyInForce::from_text("prompter.enabled=false\n", true);
        assert_eq!(status_of(&locked, true)["reason"], "prompter_off");
        assert_eq!(status_of(&locked, false)["reason"], "prompter_off");

        let open = PolicyInForce::no_policy();
        assert_eq!(status_of(&open, false)["reason"], "no_key");
        assert_eq!(status_of(&open, true), json!({ "available": true }));
    }

    #[test]
    fn an_unreadable_policy_means_the_prompter_is_off() {
        let broken = PolicyInForce::unreadable("Line 1: there is no equals sign.");
        assert_eq!(status_of(&broken, true)["reason"], "prompter_off");
    }
}
