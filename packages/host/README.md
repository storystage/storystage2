# @storystage/host

The host interface (decision 0028): what the build hands the studio at start-up, so the studio never sniffs whether it is in Tauri or a browser. Today that is the policy in force and the Prompter transport. Files follow when the studio first needs them (WP8).

- **Owner:** S8 and S5
- **Workplan:** WP15.3
- **Spec:** `docs/spec/00-architecture.md` sections 1 and 6, `docs/spec/05-keys-privacy-switches.md` section 3.8
- **Status:** contract, policy and transport

`PolicyInForce` has a twin in Rust (`apps/desktop/src-tauri/policy`). One fixture, `policy/fixtures/policy-in-force.json`, is tested from both sides, so they can't drift apart.
