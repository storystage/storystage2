# 0062 The shipped Backstage is bundled

- **Status:** settled
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answer in the S4 session, on the Backstage loader (workplan 3.9, WP3c)

## Decision

**The apps carry the whole shipped Backstage folder:** `backstage.json`, the models, thumbnails and sketches, and the Prompter's catalogue. That is about 85 MB for the 50 models shipped on 8 Nov 2026. Models are never downloaded, so Backstage works offline from the first launch, like the speech model (decision 0057).

- **The Tauri apps** bundle the folder as resources.
- **The browser version** (app.storystage.org, decision 0046) serves the same folder from its own origin.
- **A release ships one pinned catalogue.** `backstage.lock.json` names the commit of `storystage/backstage-assets` it uses, and the SHA-256 of its `backstage.json` and `prompter-catalogue.txt`. The Prompter's system prompt includes that catalogue, and its hash is pinned for the release (spec 04, section 1.8), so the two must match.

## Why

- Classes often have poor or filtered internet, and a model that fails to load in the middle of a lesson is worse than a bigger installer.
- A bundled catalogue is always the one the release's Prompter catalogue describes.
- Nothing new for the DPIA: no device contacts a model host.

## What follows

- **Every install is about 85 MB bigger,** and grows as models are added. If Alice's models ship (several hundred MB, WP17.1), the owner may revisit this.
- **S4:** the loader (`openBackstage`, spec 17 section 4b), `backstage.lock.json` and `pnpm backstage:fetch`.
- **S8:** bundle the fetched folder in the Tauri apps and give the app its address.
- **S1:** serve it with the browser version, and fetch it in the release workflows.
- **S3:** find models through the loader, which also says which VRM avatars to turn.

## Update, 23 Nov 2026: still bundled, at today's size

The owner revisited this on 23 Nov, on S1's cards, as this record allowed. **Everything stays installed with the app, so Backstage still works offline from the first launch.** There's no download pack.

- **The size now.** At backstage-assets `acd9415` the shipped Backstage is 624 MB on disk: models 583 MB, sketches 37 MB, thumbnails 4 MB. It's 346 MB compressed in the Android package. Each MB of Backstage adds about 0.7 MB to each installer. The Open Source Avatars are 321 MB of the 624, mostly 1024 px PNG textures and face shapes stored in full. None of Alice's models are in it.
- **Smaller avatar textures.** S4's build changes those PNG textures to WebP at the same 1024 px, which saves about 100 MB. The owner sees before-and-after sheets first. S3 has checked that the stage draws them on WebGL2 and WebGPU. Storing face shapes sparse, meshopt, fewer avatars and an optional download pack are not chosen.
- **Android:** Google Play limits an app bundle's base module to 500 MB compressed, and a plain APK to 100 MB. Install-time asset packs (up to 1.5 GB each, 4 GB in all) are installed with the app. So on Android the Backstage goes in an install-time asset pack of a Play app bundle (S8, workplan 15.8).
- **iPad and desktop:** the App Store allows 4 GB installed, and the desktop installers are StoryStage's own, so neither needs a change.
