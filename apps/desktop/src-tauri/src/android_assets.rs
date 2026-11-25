//! Files bundled with the Android app, read in place through Android's `AAssetManager` (WP15c,
//! workplan 15.8; spec 05 sections 5.2 and 7).
//!
//! The fs plugin's `read` copies an asset whole into `cacheDir/_assets/` before reading it, and
//! never removes the copy, so every Backstage model or speech file opened would be stored twice:
//! once in the package and once, uncompressed, in the cache. This reads the asset from the package
//! itself, whether it's in the base module or, later, an install-time asset pack. Both are seen
//! through the same AssetManager, at the same path.
//!
//! Callers pass only paths they've already checked (`backstage_files::is_served`, a speech pin).
//! Nothing here is reachable from the webview.

use std::ffi::CString;
use std::io::Read;
use std::ptr::NonNull;
use std::sync::OnceLock;

use jni::objects::{GlobalRef, JObject};
use jni::JavaVM;
use ndk::asset::AssetManager;
use tauri::{AppHandle, Manager};

struct Assets {
    manager: AssetManager,
    /// The Java AssetManager. The native one is valid only while this is alive.
    _java: GlobalRef,
}

static ASSETS: OnceLock<Option<Assets>> = OnceLock::new();

fn assets() -> Option<&'static Assets> {
    ASSETS
        .get_or_init(|| match open() {
            Ok(assets) => Some(assets),
            Err(error) => {
                eprintln!("The app's bundled files can't be read: {error}");
                None
            }
        })
        .as_ref()
}

/// The application's AssetManager, from the context tao registers with `ndk-context` at start.
fn open() -> Result<Assets, String> {
    let context = ndk_context::android_context();
    // SAFETY: tao gives `ndk-context` the process's Java VM and a global reference to the
    // application context, which both live as long as the app.
    let vm = unsafe { JavaVM::from_raw(context.vm().cast()) }.map_err(|e| e.to_string())?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
    // SAFETY: as above. Dropping a `JObject` doesn't delete the reference.
    let application = unsafe { JObject::from_raw(context.context().cast()) };
    let java = env
        .call_method(&application, "getAssets", "()Landroid/content/res/AssetManager;", &[])
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let java = env.new_global_ref(java).map_err(|e| e.to_string())?;
    // SAFETY: a live JNI environment on this thread, and a global reference to an AssetManager.
    let native = unsafe { ndk_sys::AAssetManager_fromJava(env.get_raw().cast(), java.as_obj().as_raw().cast()) };
    let native = NonNull::new(native).ok_or("Android gave no AssetManager")?;
    // SAFETY: `native` stays valid while `java` is alive, and `Assets` keeps both.
    let manager = unsafe { AssetManager::from_ptr(native) };
    Ok(Assets { manager, _java: java })
}

/// A bundled file's bytes, by its path in the package, such as `backstage/backstage.json`.
/// `None` if there's no such file. A folder isn't a file.
pub fn read(path: &str) -> Option<Vec<u8>> {
    let name = CString::new(path).ok()?;
    let mut asset = assets()?.manager.open(&name)?;
    let mut bytes = Vec::with_capacity(asset.length());
    asset.read_to_end(&mut bytes).ok()?;
    Some(bytes)
}

/// Removes the copies the fs plugin made of our bundled files before this reader existed:
/// `cacheDir/_assets/backstage/` and `cacheDir/_assets/speech/`, and nothing else.
pub fn remove_old_copies(app: &AppHandle) {
    let Ok(cache) = app.path().app_cache_dir() else {
        return;
    };
    std::thread::spawn(move || {
        for folder in ["backstage", "speech"] {
            let path = cache.join("_assets").join(folder);
            if path.exists() {
                if let Err(error) = std::fs::remove_dir_all(&path) {
                    eprintln!("{}: not removed: {error}", path.display());
                }
            }
        }
    });
}
