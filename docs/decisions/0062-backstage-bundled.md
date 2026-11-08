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
