# Spike 1.6: Tauri key path

- **Status:** proposed: **go** (S1, 20 Oct 2026). Waiting for the owner's decision.
- **Evidence:** `docs/spikes/REPORT.md`, section 1.6; code in `spikes/1.6-key-path/`.

## Proposal

Go: build WP15.2 as in the spike. The key lives in the OS store and is read only by Rust, after a policy enforcement point passes each request. Events stream to the webview over a Tauri Channel in the transport contract's shape (#32). Keep the leak scan (the page, storage, IPC replies and a DevTools heap snapshot, with a positive control) as a CI test on every desktop build, and never ship the debugging port.

A human security review of the key handling is still recommended before the pilot (decisions.md, "Still to decide").

## Owner decision

_Go / no-go, date:_
