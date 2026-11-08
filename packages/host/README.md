# @storystage/host

The host interface (decision 0028): what the build hands the studio at start-up, so the studio never sniffs whether it is in Tauri or a browser. That is the policy in force, the Prompter transport, the installed version, the speech models and the pupil folders.

- **Owner:** S8 and S5
- **Workplan:** WP15.3
- **Spec:** `docs/spec/00-architecture.md` sections 1 and 6, `docs/spec/05-keys-privacy-switches.md` section 3.8
- **Status:** contract, policy, transport, speech models and pupil folders (browser store; the native store is next)

`PolicyInForce` has a twin in Rust (`apps/desktop/src-tauri/policy`). One fixture, `policy/fixtures/policy-in-force.json`, is tested from both sides, so they can't drift apart.

**Pupil folders and files** (`files.ts`, decision 0065): `ClassFolders`, `PupilFolder` and `FilePicker`, all bytes in and out, for S4's save and open (8.4). Every implementation passes `describeClassFoldersContract` from `@storystage/host/testing`, which also has `memoryClassFolders` and `memoryFilePicker` for tests.

The folders' rules are written once, in `storedClassFolders`, over a small `FileStore` (spec 05 section 6): `browserStore` over the Origin Private File System, `memoryStore` for tests, and the native store in the Tauri apps when it lands. Until then the Tauri apps use the browser store too. `HostInterface.classes` is what the studio uses.
