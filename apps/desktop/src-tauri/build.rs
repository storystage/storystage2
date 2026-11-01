fn main() {
    // Listing the commands makes each one need a permission in `capabilities/`, so a window
    // gets only what it is given.
    let manifest = tauri_build::AppManifest::new().commands(&["policy_in_force"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to prepare the StoryStage 2 build");
}
