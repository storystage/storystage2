fn main() {
    // Listing the commands makes each one need a permission in `capabilities/`, so a window
    // gets only what it is given.
    let manifest = tauri_build::AppManifest::new().commands(&[
        "policy_in_force",
        "app_version",
        "prompter_send",
        "prompter_cancel",
        "prompter_status",
        "key_add",
        "key_status",
        "key_remove",
        "speech_models",
        "speech_model_load",
        "speech_model_download",
        "speech_model_cancel",
        "speech_model_remove",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to prepare the StoryStage 2 build");
}
