//! Updates on Windows and macOS (WP15.7, spec 05 section 4). The decisions are in
//! `storystage_policy::update`. This module fetches, keeps the download on disk rather than in
//! memory, and installs when the app closes, never during a lesson. Learners see no prompt, and
//! a failure is quiet: the next start tries again.

use std::collections::hash_map::RandomState;
use std::error::Error;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use storystage_policy::update::{check_is_due, manifest_url, should_move, Rollout};
use storystage_policy::{PolicyInForce, UpdatePolicy};
use tauri::{AppHandle, Manager, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

type Failure = Box<dyn Error + Send + Sync>;

/// The updater's public key (4.5), set by the release workflow. A build without one, which
/// means every development build, never checks.
const PUBLIC_KEY: Option<&str> = option_env!("STORYSTAGE_UPDATER_PUBKEY");

/// A build that has been downloaded and is waiting for the app to close.
#[derive(Default)]
pub struct Pending(Mutex<Option<Update>>);

fn download_path(folder: &Path) -> PathBuf {
    folder.join("update-download")
}

/// On a shared computer installed per machine, the school's deployment tools own updates, so a
/// learner never meets a password prompt (4.1).
fn can_write_install_folder() -> bool {
    let Some(folder) = std::env::current_exe().ok().and_then(|exe| exe.parent().map(Path::to_owned))
    else {
        return false;
    };
    let probe = folder.join(".storystage-update-probe");
    let writable = fs::File::create(&probe).is_ok();
    let _ = fs::remove_file(&probe);
    writable
}

/// This install's number from 0 to 99 (4.3). Kept in local data and never sent anywhere.
fn bucket(path: &Path) -> std::io::Result<u8> {
    let kept = fs::read_to_string(path).ok().and_then(|text| text.trim().parse::<u8>().ok());
    if let Some(number) = kept.filter(|number| *number < 100) {
        return Ok(number);
    }
    let number = (RandomState::new().build_hasher().finish() % 100) as u8;
    fs::write(path, number.to_string())?;
    Ok(number)
}

async fn check(app: AppHandle, key: &str, policy: UpdatePolicy, url: String) -> Result<(), Failure> {
    let folder = app.path().app_local_data_dir()?;
    fs::create_dir_all(&folder)?;

    let installed = app.package_info().version.to_string();
    let stamp_path = folder.join("update-checked");
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let stamp = fs::read_to_string(&stamp_path).ok();
    if !check_is_due(stamp.as_deref(), now, &installed) {
        return Ok(());
    }

    let updater = app
        .updater_builder()
        .pubkey(key)
        .endpoints(vec![Url::parse(&url)?])?
        // Offer everything that differs: `should_move` is what decides, because this closure
        // can't see `rollout` or `withdrawn`.
        .version_comparator(|current, remote| remote.version != current)
        .build()?;
    let found = updater.check().await?;
    fs::write(&stamp_path, format!("{now} {installed}"))?;
    let Some(update) = found else {
        return Ok(());
    };

    let fields: Rollout = serde_json::from_value(update.raw_json.clone())?;
    let number = bucket(&folder.join("update-bucket"))?;
    if !should_move(&policy, &installed, &update.version, &fields, number) {
        return Ok(());
    }

    let bytes = update.download(|_, _| {}, || {}).await?;
    fs::write(download_path(&folder), bytes)?;
    if let Ok(mut pending) = app.state::<Pending>().0.lock() {
        *pending = Some(update);
    }
    Ok(())
}

/// Starts the once-a-day check in the background, if this device should check at all.
pub fn start(app: &AppHandle) {
    let Some(key) = PUBLIC_KEY else {
        return;
    };
    let policy = app.state::<PolicyInForce>().update.clone();
    let Some(url) = manifest_url(&policy) else {
        return;
    };
    if !can_write_install_folder() {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = check(app, key, policy, url).await;
    });
}

/// Installs a waiting build. Called as the app closes. On Windows this ends the process.
pub fn install_pending(app: &AppHandle) {
    let Some(update) = app.state::<Pending>().0.lock().ok().and_then(|mut pending| pending.take())
    else {
        return;
    };
    let Ok(folder) = app.path().app_local_data_dir() else {
        return;
    };
    let path = download_path(&folder);
    if let Ok(bytes) = fs::read(&path) {
        let _ = fs::remove_file(&path);
        // `install` checks the signature. A build that fails it is dropped.
        let _ = update.install(bytes);
    }
}
