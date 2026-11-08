//! Speech models (spec 05 section 5). The pins, the check on every load, and the optional
//! download, which goes to a temporary file and is kept only if it matches. The app's commands
//! are in `src/speech.rs`; this crate decides, so every rule is tested without Tauri.

use std::fs::{self, File};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use storystage_policy::{PrompterLevel, PrompterPolicy};
use tokio::sync::watch;
use tokio::time::timeout;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Model {
    pub name: String,
    pub file: String,
    pub bytes: u64,
    pub sha256: String,
    pub bundled: bool,
}

/// `speech-models.json`, built into the app (spec 05 section 5.1).
#[derive(Debug, Clone, Deserialize)]
pub struct Pins {
    pub source: String,
    pub downloads: String,
    pub models: Vec<Model>,
}

impl Pins {
    pub fn shipped() -> Self {
        serde_json::from_str(include_str!("../../speech-models.json"))
            .expect("speech-models.json is checked in CI")
    }

    /// A pinned model, by its name. A path, or any other name, finds nothing (threat M4).
    pub fn model(&self, name: &str) -> Option<&Model> {
        self.models.iter().find(|model| model.name == name)
    }

    /// Where the optional model is downloaded from.
    pub fn download_url(&self, model: &Model) -> String {
        format!("{}{}", self.downloads, model.file)
    }
}

/// One code per cause (spec 05 section 5.5). `SPEECH_ERROR_CODES` in `packages/host` is the
/// same list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Code {
    RefusedByPolicy,
    NotDownloaded,
    CheckFailed,
    Offline,
    NoSpace,
    Cancelled,
    Internal,
}

impl Code {
    /// The word the studio gets when a command fails.
    pub fn name(self) -> &'static str {
        match self {
            Self::RefusedByPolicy => "refused_by_policy",
            Self::NotDownloaded => "not_downloaded",
            Self::CheckFailed => "check_failed",
            Self::Offline => "offline",
            Self::NoSpace => "no_space",
            Self::Cancelled => "cancelled",
            Self::Internal => "internal",
        }
    }
}

/// Speech input exists only where the Prompter does and voice input is on (spec 06 1.1).
pub fn allowed(policy: &PrompterPolicy) -> bool {
    policy.level != PrompterLevel::Off && policy.voice_input
}

/// True if the bytes are exactly the pinned model (threat M1).
pub fn matches(bytes: &[u8], model: &Model) -> bool {
    bytes.len() as u64 == model.bytes && hex::encode(Sha256::digest(bytes)) == model.sha256
}

fn downloaded(dir: &Path, model: &Model) -> PathBuf {
    dir.join(&model.file)
}

fn partial(dir: &Path, model: &Model) -> PathBuf {
    dir.join(format!("{}.part", model.file))
}

fn write_error(error: std::io::Error) -> Code {
    if error.kind() == ErrorKind::StorageFull {
        Code::NoSpace
    } else {
        Code::Internal
    }
}

/// Whether a downloaded model is there. Only its size is looked at here: `load_downloaded`
/// checks the rest, every time.
pub fn is_downloaded(dir: &Path, model: &Model) -> bool {
    fs::metadata(downloaded(dir, model)).is_ok_and(|file| file.len() == model.bytes)
}

/// Reads a downloaded model and checks it (spec 05 section 5.4). One that fails is deleted, so
/// it can be fetched again.
pub fn load_downloaded(dir: &Path, model: &Model) -> Result<Vec<u8>, Code> {
    let path = downloaded(dir, model);
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == ErrorKind::NotFound => return Err(Code::NotDownloaded),
        Err(_) => return Err(Code::Internal),
    };
    if matches(&bytes, model) {
        Ok(bytes)
    } else {
        let _ = fs::remove_file(&path);
        Err(Code::CheckFailed)
    }
}

/// Checks a bundled model's bytes. It's never deleted: a mismatch means the app is damaged.
pub fn check_bundled(bytes: Vec<u8>, model: &Model) -> Result<Vec<u8>, Code> {
    if matches(&bytes, model) {
        Ok(bytes)
    } else {
        Err(Code::CheckFailed)
    }
}

/// Deletes a downloaded model. The bundled one can't be removed.
pub fn remove(dir: &Path, model: &Model) -> Result<(), Code> {
    if model.bundled {
        return Err(Code::Internal);
    }
    for path in [downloaded(dir, model), partial(dir, model)] {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(_) => return Err(Code::Internal),
        }
    }
    Ok(())
}

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const SILENCE_TIMEOUT: Duration = Duration::from_secs(120);

/// Fetches into the temporary file, stopping as soon as anything doesn't fit the pin.
async fn fetch(url: &str, model: &Model, part: &Path, progress: &impl Fn(u64, u64)) -> Result<(), Code> {
    // `reqwest` is built with no crypto provider of its own. Installing twice is harmless.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|_| Code::Internal)?;
    let response = client.get(url).send().await.map_err(|_| Code::Offline)?;
    if !response.status().is_success() {
        return Err(Code::Offline);
    }
    if response.content_length().is_some_and(|length| length != model.bytes) {
        return Err(Code::CheckFailed);
    }

    let mut file = File::create(part).map_err(write_error)?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    let mut stream = response.bytes_stream();
    loop {
        let next = timeout(SILENCE_TIMEOUT, stream.next()).await.map_err(|_| Code::Offline)?;
        let Some(chunk) = next else { break };
        let chunk = chunk.map_err(|_| Code::Offline)?;
        received += chunk.len() as u64;
        if received > model.bytes {
            return Err(Code::CheckFailed);
        }
        hasher.update(&chunk);
        file.write_all(&chunk).map_err(write_error)?;
        progress(received, model.bytes);
    }
    file.sync_all().map_err(write_error)?;
    if received != model.bytes || hex::encode(hasher.finalize()) != model.sha256 {
        return Err(Code::CheckFailed);
    }
    Ok(())
}

/// Resolves when `cancel` becomes true, and never if nobody is left to cancel.
async fn cancelled(cancel: &mut watch::Receiver<bool>) {
    if cancel.wait_for(|stop| *stop).await.is_err() {
        std::future::pending::<()>().await;
    }
}

/// Downloads a model that isn't bundled (spec 05 section 5.3). It's kept only if it matches its
/// pin exactly. Otherwise, or on Cancel, nothing is left behind.
pub async fn download(
    url: &str,
    model: &Model,
    dir: &Path,
    progress: impl Fn(u64, u64),
    mut cancel: watch::Receiver<bool>,
) -> Result<(), Code> {
    if model.bundled {
        return Err(Code::Internal);
    }
    fs::create_dir_all(dir).map_err(write_error)?;
    let part = partial(dir, model);
    let result = tokio::select! {
        result = fetch(url, model, &part, &progress) => result,
        () = cancelled(&mut cancel) => Err(Code::Cancelled),
    };
    let result = result.and_then(|()| fs::rename(&part, downloaded(dir, model)).map_err(write_error));
    if result.is_err() {
        let _ = fs::remove_file(&part);
    }
    result
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    /// A folder of its own in the temp folder, removed when the test ends.
    pub struct TempDir(pub PathBuf);

    impl TempDir {
        pub fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let name = format!("storystage-speech-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed));
            let path = std::env::temp_dir().join(name);
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn model_of(bytes: &[u8], bundled: bool) -> Model {
        Model {
            name: "test".to_string(),
            file: "test.bin".to_string(),
            bytes: bytes.len() as u64,
            sha256: hex::encode(Sha256::digest(bytes)),
            bundled,
        }
    }

    #[test]
    fn the_shipped_pins_are_the_two_in_the_spec() {
        let pins = Pins::shipped();
        let names: Vec<(&str, bool)> = pins.models.iter().map(|m| (m.name.as_str(), m.bundled)).collect();
        assert_eq!(names, [("tiny.en-q5_1", true), ("tiny.en", false)]);
        assert_eq!(pins.model("tiny.en-q5_1").unwrap().bytes, 32_166_155);
        assert_eq!(pins.model("tiny.en").unwrap().bytes, 77_704_715);
        assert!(pins.downloads.starts_with("https://"));
    }

    #[test]
    fn only_pinned_names_are_found() {
        let pins = Pins::shipped();
        for name in ["", "tiny", "ggml-tiny.en.bin", "../tiny.en", "C:\\models\\tiny.en", "TINY.EN"] {
            assert!(pins.model(name).is_none(), "{name}");
        }
    }

    #[test]
    fn the_download_address_is_the_pinned_host_and_file() {
        let pins = Pins::shipped();
        let url = pins.download_url(pins.model("tiny.en").unwrap());
        assert!(url.starts_with(&pins.downloads));
        assert!(url.ends_with("/ggml-tiny.en.bin"));
    }

    #[test]
    fn speech_follows_the_level_and_voice_input() {
        use storystage_policy::CapAction;
        let policy = |level, voice_input| PrompterPolicy { level, voice_input, daily_cap: None, cap_action: CapAction::Off };
        assert!(allowed(&policy(PrompterLevel::Full, true)));
        assert!(allowed(&policy(PrompterLevel::ExplainOnly, true)));
        assert!(!allowed(&policy(PrompterLevel::Off, true)));
        assert!(!allowed(&policy(PrompterLevel::Full, false)));
    }

    #[test]
    fn a_file_is_checked_by_size_and_hash() {
        let bytes = b"a stand-in model";
        let model = model_of(bytes, false);
        assert!(matches(bytes, &model));
        let mut changed = bytes.to_vec();
        changed[0] ^= 1;
        assert!(!matches(&changed, &model));
        assert!(!matches(&bytes[..4], &model));
    }

    #[test]
    fn a_downloaded_model_is_checked_on_every_load_and_deleted_if_changed() {
        let dir = TempDir::new();
        let bytes = b"a stand-in model";
        let model = model_of(bytes, false);
        assert_eq!(load_downloaded(&dir.0, &model), Err(Code::NotDownloaded));
        assert!(!is_downloaded(&dir.0, &model));

        fs::write(dir.0.join("test.bin"), bytes).unwrap();
        assert!(is_downloaded(&dir.0, &model));
        assert_eq!(load_downloaded(&dir.0, &model).unwrap(), bytes);

        let mut changed = bytes.to_vec();
        changed[3] ^= 1;
        fs::write(dir.0.join("test.bin"), changed).unwrap();
        assert_eq!(load_downloaded(&dir.0, &model), Err(Code::CheckFailed));
        assert!(!dir.0.join("test.bin").exists());
    }

    #[test]
    fn a_changed_bundled_model_is_refused() {
        let model = model_of(b"a stand-in model", true);
        assert_eq!(check_bundled(b"a stand-in model".to_vec(), &model).unwrap(), b"a stand-in model");
        assert_eq!(check_bundled(b"a stand-in modeL".to_vec(), &model), Err(Code::CheckFailed));
    }

    #[test]
    fn removing_deletes_the_download_and_any_part_but_never_the_bundled_one() {
        let dir = TempDir::new();
        let model = model_of(b"x", false);
        fs::write(dir.0.join("test.bin"), b"x").unwrap();
        fs::write(dir.0.join("test.bin.part"), b"").unwrap();
        assert_eq!(remove(&dir.0, &model), Ok(()));
        assert!(!dir.0.join("test.bin").exists());
        assert!(!dir.0.join("test.bin.part").exists());
        assert_eq!(remove(&dir.0, &model), Ok(()), "removing twice is fine");
        assert_eq!(remove(&dir.0, &model_of(b"x", true)), Err(Code::Internal));
    }

    #[test]
    fn the_codes_match_the_contract() {
        use Code::*;
        let codes = [RefusedByPolicy, NotDownloaded, CheckFailed, Offline, NoSpace, Cancelled, Internal];
        let names: Vec<&str> = codes.iter().map(|code| code.name()).collect();
        assert_eq!(
            names,
            ["refused_by_policy", "not_downloaded", "check_failed", "offline", "no_space", "cancelled", "internal"]
        );
        assert_eq!(serde_json::to_value(codes).unwrap(), serde_json::json!(names));
    }

    /// Spec 05 section 5.6, and the bundled model in the app's resources (section 5.2).
    #[test]
    fn the_shipped_config_isolates_and_bundles() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        let headers = &config["app"]["security"]["headers"];
        assert_eq!(headers["Cross-Origin-Opener-Policy"], "same-origin");
        assert_eq!(headers["Cross-Origin-Embedder-Policy"], "require-corp");
        let resources = config["bundle"]["resources"].as_object().unwrap();
        for model in Pins::shipped().models.iter().filter(|model| model.bundled) {
            assert_eq!(resources[&format!("resources/speech/{}", model.file)], format!("speech/{}", model.file));
        }
    }
}
