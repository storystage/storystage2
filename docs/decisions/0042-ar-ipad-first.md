# 0042 AR is iPad-first

- **Status:** settled
- **Decided:** 25 Oct 2026, by the owner
- **Source:** the owner's answer in the S1 session, on the Android tablet spike 1.9 asked for (M1 device-run checklist, #69)

## Decision

AR is built and measured **on the reference iPad first**: spike 1.9 and AR design mode (WP21) target the native ARKit route in the Tauri iOS app. AR on Android tablets (Babylon.js WebXR with ARCore) is **"works where supported, not tested"** for now, and no Android tablet is bought as a reference device.

Why: Android tablets are probably the least common school device in the UK, and they matter only for AR. Chromebooks can't do AR in the browser, and the iPad is Apple's school device. The browser version and the apps for Windows, macOS, iPad and Chromebook are unchanged (decision 0003).

**Revisit after M1**, on evidence: the school IT managers (1.11) are asked whether they have Android tablets and how many. If schools have them, add a reference Android tablet with ARCore and the Depth API, at the budget end (for example a Galaxy Tab A9+ with 4 GB, checked against Google's current ARCore list), and test Android AR in WP21.6.

AR packs for audiences (WP22) still play on Android phones through Scene Viewer; that doesn't need a reference tablet.
