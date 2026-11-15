use std::path::Path;

/// `SPEECH_PINS` for `src/speech_files.rs`: every file in `.speech/` with its SHA-256, from the
/// fetch scripts' own checked lists (`<folder>/files.json`), so the app serves only what it was
/// built with, and checks each file against it.
fn speech_pins() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../.speech");
    let mut pins = Vec::new();
    for list in ["kokoro/files.json", "whisper/files.json"] {
        let path = root.join(list);
        println!("cargo:rerun-if-changed={}", path.display());
        let Ok(text) = std::fs::read_to_string(&path) else {
            // whisper.js comes later (spec 06, 1.11); Kokoro's files are needed.
            assert!(list != "kokoro/files.json", "No {}: run `pnpm speech:fetch` first (spec 06, 4.6).", path.display());
            continue;
        };
        let files: Vec<serde_json::Value> = serde_json::from_str(&text).expect("files.json is a list");
        for file in files {
            let (Some(name), Some(sha)) = (file["path"].as_str(), file["sha256"].as_str()) else {
                panic!("{}: every entry needs a path and a sha256", path.display());
            };
            pins.push(format!("    ({name:?}, {sha:?}),\n"));
        }
    }
    let out = Path::new(&std::env::var("OUT_DIR").expect("OUT_DIR")).join("speech_pins.rs");
    let code = format!("pub const SPEECH_PINS: &[(&str, &str)] = &[\n{}];\n", pins.concat());
    std::fs::write(out, code).expect("write speech_pins.rs");
}

fn main() {
    speech_pins();
    // Listing the commands makes each one need a permission in `capabilities/`, so a window
    // gets only what it is given.
    let manifest = tauri_build::AppManifest::new().commands(&[
        "policy_in_force",
        "app_version",
        "backstage_folder",
        "prompter_send",
        "prompter_cancel",
        "prompter_status",
        "prompter_pupil",
        "prompter_usage",
        "key_add",
        "key_status",
        "key_remove",
        "speech_models",
        "speech_model_load",
        "speech_model_download",
        "speech_model_cancel",
        "speech_model_remove",
        "classes_read",
        "classes_write",
        "classes_remove",
        "classes_list",
        "classes_move",
        "picker_kind",
        "picker_save",
        "picker_open",
        "picker_collect_start",
        "picker_collect_write",
        "picker_collect_finish",
        "picker_hand_back_start",
        "picker_hand_back_read",
        "picker_end",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to prepare the StoryStage 2 build");
}
