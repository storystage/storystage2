//! Speak line's engine (Kokoro, its voices and ONNX Runtime) and whisper.js, served from the app's
//! own origin at `speech/...`, where the studio looks for them (spec 06 sections 1.11 and 4.6).
//!
//! `.speech/` is bundled as a resource. This wraps the studio's embedded files: a request under
//! `speech/` for a file this build pinned is read from the resource and checked against its
//! SHA-256 every time, as the speech model is (section 1.4). A file that isn't pinned, or doesn't
//! match, isn't served. Being the app's own origin, nothing changes in the content security policy
//! or cross-origin isolation, and the studio needs no other address.

use std::borrow::Cow;
use std::sync::OnceLock;

use sha2::{Digest, Sha256};
use storystage_classes::backstage_files::is_served;
use tauri::path::BaseDirectory;
use tauri::utils::assets::{AssetKey, AssetsIter, CspHash};
use tauri::{App, AppHandle, Assets, Context, Manager, Runtime};

// `SPEECH_PINS`: every file `.speech/` had when this app was built, with its SHA-256, from the
// fetch scripts' own checked lists (`build.rs`).
include!(concat!(env!("OUT_DIR"), "/speech_pins.rs"));

/// Stands in for a moment while the embedded files are moved into `SpeechAssets`.
struct Nothing;

impl<R: Runtime> Assets<R> for Nothing {
    fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }

    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

pub struct SpeechAssets<R: Runtime> {
    embedded: Box<dyn Assets<R>>,
    app: OnceLock<AppHandle<R>>,
}

impl<R: Runtime> SpeechAssets<R> {
    /// Puts the speech files in front of the studio's embedded ones.
    pub fn wrap(context: &mut Context<R>) {
        let embedded = std::mem::replace(&mut context.assets, Box::new(Nothing));
        context.assets = Box::new(Self { embedded, app: OnceLock::new() });
    }

    fn read(&self, path: &str) -> Option<Vec<u8>> {
        let (_, pin) = SPEECH_PINS.iter().find(|(pinned, _)| *pinned == path)?;
        let app = self.app.get()?;
        let resolved = app.path().resolve(format!("speech/{path}"), BaseDirectory::Resource).ok()?;
        // Inside the APK on Android, so only the fs plugin can read it, from Rust.
        #[cfg(target_os = "android")]
        let bytes = {
            use tauri_plugin_fs::FsExt;
            app.fs().read(resolved).ok()?
        };
        #[cfg(not(target_os = "android"))]
        let bytes = {
            let meta = std::fs::symlink_metadata(&resolved).ok()?;
            if !meta.is_file() {
                return None;
            }
            std::fs::read(&resolved).ok()?
        };
        let digest: String = Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect();
        if digest != *pin {
            eprintln!("speech/{path}: not served, as it doesn't match the SHA-256 this build pinned");
            return None;
        }
        Some(bytes)
    }
}

impl<R: Runtime> Assets<R> for SpeechAssets<R> {
    fn setup(&self, app: &App<R>) {
        let _ = self.app.set(app.handle().clone());
        self.embedded.setup(app);
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        let path = key.as_ref().trim_start_matches('/');
        if let Some(rest) = path.strip_prefix("speech/") {
            if is_served(rest) {
                if let Some(bytes) = self.read(rest) {
                    return Some(Cow::Owned(bytes));
                }
            }
        }
        self.embedded.get(key)
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.embedded.iter()
    }

    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.embedded.csp_hashes(html_path)
    }
}
