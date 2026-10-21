# Spike 1.8: MP4 export

- **Status:** decided: **go for video; audio after the Chromebook check** (owner, 21 Oct 2026). Proposed by S1 on 20 Oct 2026.
- **Evidence:** `docs/spikes/REPORT.md`, section 1.8; code in `spikes/1.8-mp4/`.

## Proposal

Go: export with WebCodecs and Mediabunny (MPL-2.0, unmodified), from offscreen frames at a fixed time step, with H.264 video. It produced valid 10-second 720p clips in Chrome, Chromium, WebKit, WebView2 and WKWebView.

**For WP11.5, before the pilot:** AAC can't be encoded by Chrome on Linux, and probably not on ChromeOS, where the browser version runs. Choose between:
- Opus audio in the MP4
- AAC from the native layer or an FFmpeg sidecar on desktop
- telling Chromebook users to export from another device

First check the reference Chromebook (#6).

## Owner decision

Go for video now. Decide how export handles audio once the M1 run shows whether the reference Chromebook can encode AAC (#6).

Recorded by S1 from the owner's answer in the S1 session, 21 Oct 2026.
