# 0061 The optional speech model's host, and S8's speech pull requests

- **Status:** settled
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answers in the S8 session, on spec 05 section 5.3 (#151)

## Decision

- **The optional speech model (`ggml-tiny.en.bin`, 78 MB) is downloaded from GitHub Releases,** from the `speech-models-v1` release on `storystage/storystage2`. That's the host already named for updates (decision 0047), so no new third party sees a device. The `Speech models` workflow publishes it, by hand, through the `release` environment, after checking its pin. The default model is bundled (decision 0057), so most learners never download anything.
- **S8 merges #151, #152 and #155** in stack order once each is green, as with decision 0048; the owner reviews afterwards. These three only.

## What follows

- **S7** changes spec 06 section 1.4's "From where" to GitHub Releases.
- **The owner** runs the `Speech models` workflow once, before the first build that offers the optional model.
- **D:** the DPIA (WP17.3) already names GitHub for updates (0047). It now also covers this download, which happens only when a learner asks for it.
