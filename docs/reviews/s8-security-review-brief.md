# Security review brief: S8's native code

For the human security review before the pilot (spec 15 §5). Written by S8 on 8 Nov 2026 so the reviewer can start in the right place: what each piece does, where the risk is, what is already tested, and the questions worth an expert's time. The threat ids (W1, PS1 and so on) are spec 15's.

**Scope:** `apps/desktop/src-tauri`: about 4,800 lines of Rust in eight crates and the app, plus two Android plugins in Kotlin. The browser version has no native code and no key (spec 15 §2.6).

**Suggested order:** sections 1 to 3 first. They are the key, and spec 15 asks for W1, W2, W10 and U3 first. A careful pass over those is about half a day; the rest about the same again.

## 0. The boundary in one paragraph

The studio runs in a webview that we **assume can be compromised** (spec 15 §2.1). It reaches the native layer only through the commands listed in `build.rs`, each of which needs a permission in `capabilities/default.json`. The Claude key lives in the system's own key store. Rust reads it in exactly one place, after every check on the request has passed, and no command ever returns it. Everything else the native layer does for the webview (the policy, files, speech models, pickers, updates) is reached through named commands that take names and bytes, never paths.

## 1. The key (W1, W3, W8, W10)

| File | What to look at |
|---|---|
| `src/prompter.rs`, `begin` | **The order:** the policy is read again, then the gate checks the request, then the caps, and only then is the key read (`store::load`). Is there any other path to `store::load`, or any way a refused request touches the key? |
| `transport/src/key.rs` | `Key` holds the text in `Zeroizing`, prints as `(hidden)` and is never formatted. Is it ever cloned into an ordinary `String`, or moved into a log or error? |
| `transport/src/add.rs`, `stream.rs` | The key is added as the last header, to `api.anthropic.com` only (a test build can point elsewhere; check `endpoint()` can't in a release build). Errors carry codes, never bodies with the key in. |
| `src/key_dialog.rs` | The system dialog (decision 0056): Win32 on Windows, AppKit on macOS. The typed key never passes through the webview. Check that the buffer is cleared and that nothing logs it. |
| `src/prompter.rs`, `key_add`, `key_status`, `key_remove` | They return one word each. Check that no reply carries anything derived from the key. |
| `plugins/secure-key/android/.../SecureKeyPlugin.kt` | **Look here first on Android.** `load` is a plugin command. The webview could call it if any permission ever granted `secure-key:allow-load`. None does, and Rust calls it directly. But the leak scan runs on Windows only, so nothing tests this on Android. Is the Keystore use sound, and is there a safer shape than a plugin command for `load`? |

**Already tested:** the leak scan (every desktop build in CI) runs the real Windows app with a random key, then searches the page, storage, every IPC reply and a full heap snapshot for it, with a positive control (spec 05 §2.7). `Key`'s formatting has a unit test.

**Accepted (W10):** on a shared Windows login, any program running as that user can read the key from Credential Manager. Set-up page 10b tells the adult to keep the key on their own login. Is that warning enough, or should the app refuse to keep a key on a login it can tell is shared?

## 2. The gate (W2, W9)

| File | What to look at |
|---|---|
| `gate/src/check.rs` | Every request is checked before the key is read: the model for the mode, the token ceiling, SHA-256 of `system` and `tools` against `pins.json`, the mode messages, no unknown fields, no images, no thinking or sampling fields, and no key-shaped text (`containsSecret`). Can a request carry anything to Anthropic that the pins don't fix? For example a field the check doesn't know, or a message role it lets through. |
| `gate/pins.json` | Made by S7's `pnpm prompter:pins`; a test fails if it's out of date. S7 may merge regenerated pins without S8's review, only from that command and only with the gate's tests passing (8 Nov). |
| `gate/src/caps.rs`, `src/prompter.rs` | Ten requests a minute per device, and the daily cap per pupil (24.5). **The pupil is whoever's folder is open**, which the webview reports with `prompter_pupil`. So a compromised webview can spread its requests across pupils, or count them against the device. That is accepted (L7): the Console's spending limit is the real ceiling. Agree? |

**Already tested:** one test per rule in `check.rs`, each refused before the network; a real Prompter request passes the shipped pins; 30 simulated clients hitting rate limits make exactly 90 requests with retries spread out.

## 3. The policy and updates (P, U3)

| File | What to look at |
|---|---|
| `policy/src/windows.rs` | The policy file's folder comes from `SHGetKnownFolderPath`, not the `PROGRAMDATA` variable, which a pupil could change. A file that widens anything is trusted only if its owner is Administrators or SYSTEM (spec 05 §3.6). Is the owner check sound, and is there a race between checking the owner and reading the file? |
| `policy/src/file.rs` | Anything malformed turns the Prompter off (spec 05 §3.5). Worth a look for parser edge cases. |
| `policy/src/ios.rs`, `plugins/managed-config` | Managed configuration on iPad and Android. Not yet pushed through real device management. |
| `src/updates.rs`, `policy/src/update.rs` | Tauri's updater checks each build's signature. Channels, pins and rollback are in spec 05 §4. **U3 is accepted:** if the update host is taken over, it can offer an older signed build. Agree? The updater key isn't generated yet (0047). |

## 4. Files on the device (F1, PS1 to PS5)

| File | What to look at |
|---|---|
| `classes/src/lib.rs`, `src/classes.rs` | The pupil folders' store (spec 05 §6.4). Five commands. Every path is a list of **safe parts**, checked in Rust as well as TypeScript (`fixtures/parts.json` keeps the two the same). A write's path comes in an `x-storystage-path` header. Symbolic links and Windows junctions are refused on the way and never listed. Writes go to a temporary file and are renamed over. **Question:** `entry()` checks a folder, then the write opens it. A program on the same login could swap a folder for a junction in between. That's the PS2 case (a shared desktop login), which is accepted. Is anything worse possible? |
| `classes/src/picked.rs`, `src/picker.rs` | The native file dialog (spec 05 §6.5), opened from Rust, so the webview never holds a path. Collect writes `folder/file` inside the folder the teacher picked: both names must be plain (no separators, no device names, no leading dot), decoded from a header. A Collect or Hand back session holds the picked folder in Rust until `picker_end`. Check the session handling, and that nothing outside the picked folder can be read or written. |
| `tauri-plugin-dialog` | Used from Rust only. The leak scan checks the page can't call `plugin:dialog\|open`. |

**Already tested:** Rust tests on Windows and macOS for paths, links (macOS; Windows needs a privilege to make one), size limits, temporary files and moves; the real Windows app writes and reads a 3 MB film and is refused a path out of its folder.

## 5. Speech models (M1 to M6)

`speech/src/lib.rs` and `src/speech.rs`: the bundled model, and the optional one downloaded from a GitHub release (0061). Every load is checked against a pinned SHA-256, and the webview names a model, never a path. On Android the bundled model is read through the fs plugin, from Rust only (M5). Worth checking: the download's size limit and timeout, and that a partial download can never be loaded.

## 6. Permissions and the webview (W4 to W7)

| File | What to look at |
|---|---|
| `build.rs`, `capabilities/default.json` | Every command is listed, so each needs a permission. **Spec 15's W6 says "the Prompter's commands go to the Prompter's window only", but the app has one window, `main`, and it holds every permission.** Either the spec should say so, or the Prompter should move to a window of its own. Which do you recommend? |
| `tauri.conf.json` | The content security policy: `script-src 'self' 'wasm-unsafe-eval'`, `connect-src` limited to the app and IPC, no remote content. DevTools are off in release. The leak scan's own config turns on a debugging port, and CI checks the shipped config has none. |

## 7. What's not covered here

- **The classroom relay** (spec 15 §2.8): not built. The spike's probe in `spikes/24.3-relay` is throwaway and isn't shipped.
- **Imported files** (§2.3 and §3): S4's import code.
- **The studio's own code:** for example `dangerouslySetInnerHTML`, which lint refuses.

## 8. How to report

A finding with its threat id and file, how bad (critical, high, medium, low) and a suggested fix. S8 turns each into a PR, and spec 15 records what was found and what was accepted.
