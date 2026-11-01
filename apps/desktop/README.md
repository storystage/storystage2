# @storystage/desktop

Tauri 2 shell for Windows, macOS, iPad (iOS) and Chromebook (Android). Holds the key store, the Claude transport and its policy enforcement point (WP15.2), files, policy and sidecars. Web code never sees the API key.

- **Owner:** S8 (skeleton from S1, WP0.3)
- **Workplan:** WP15
- **Status:** reads the school lock (WP15.3); the key store and transport follow (WP15k)

`src-tauri/policy/` is the school lock (spec 05 section 3), a crate with no Tauri in it, so its tests run quickly on any runner: `cargo test -p storystage-policy`, from `src-tauri`.

Builds run in CI, not on the development PC: see `.github/workflows/desktop.yml` and `mobile.yml`.
