# Spike 1.6: Tauri key path

- **Status:** decided: **go** (owner, 21 Oct 2026). Proposed by S1 on 20 Oct 2026.
- **Evidence:** `docs/spikes/REPORT.md`, section 1.6; code in `spikes/1.6-key-path/`.

## Proposal

Go: build WP15.2 as in the spike. The key lives in the OS store and is read only by Rust, after a policy enforcement point passes each request. Events stream to the webview over a Tauri Channel in the transport contract's shape (#32). Keep the leak scan (the page, storage, IPC replies and a DevTools heap snapshot, with a positive control) as a CI test on every desktop build, and never ship the debugging port.

A human security review of the key handling is still recommended before the pilot (decisions.md, "Still to decide").

## Owner decision

Go. S8 builds WP15.2 this way and keeps the leak scan in CI. The human security review before the pilot still stands.

Recorded by S1 from the owner's answer in the S1 session, 21 Oct 2026.
