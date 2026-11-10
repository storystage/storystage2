# 15 Security

- **Covers:** Threat model (STRIDE) for every trust boundary, with a control and a test for each threat
- **Work package:** WP0.9
- **Owner:** S8
- **Status:** first version, 1 Nov 2026. Written by the same model that wrote the plan, so a human security review before the pilot still stands (decisions.md, "Still to decide"). Import code (8.4, 9.1, 10.4) and the transport (15.2) start after this.

## 0. Decisions this spec relies on

[0003 Delivery](../decisions/0003-delivery.md), [0005 API key](../decisions/0005-api-key.md), [0011 Project file](../decisions/0011-project-file.md), [0019 Prompter model](../decisions/0019-prompter-model.md), [0022 Off switches](../decisions/0022-off-switches.md), [0027 Threat model owner](../decisions/0027-threat-model-owner.md), [0028 Host interface](../decisions/0028-host-interface.md), [spike 1.6 Key path](../decisions/spike-1.6-key-path.md), 0046 Website and browser version hosting, 0047 Update hosting and the updater key, [0057 The speech model is bundled](../decisions/0057-speech-model-bundled.md).

The rules in `CLAUDE.md` come first: no key in web code, no StoryStage server, no pictures or audio to the Prompter, and the story is the learner's.

## 1. What we protect, and from whom

**What matters most, in order:**

1. **Children:** their privacy, what they see, and that their story stays theirs.
2. **The adult's Claude key:** it costs real money, and a leak can't be undone, only revoked.
3. **The school's lock:** a school has to be able to rely on it, in an exam above all.
4. **Learners' work:** a pupil's production survives, and no other pupil can read or wreck it.
5. **The update path:** whoever controls it runs code on every school's devices.

**Who we plan for:**

| Who | Can do | Doesn't have |
|---|---|---|
| **A curious pupil** | Use the app, make and share files, type anything, start the app from a shortcut or a shell | An administrator's rights. Skill varies, and some are very able |
| **Someone sharing a crafted file** | Send a `.storystage`, `.a3p`, glTF or Fountain file to a pupil or teacher | Any access to the device |
| **A compromised dependency or account** | Change a package, a GitHub workflow or the Bluehost files | The updater key, if the `release` environment holds |
| **The local network** | See and change traffic on the school's Wi-Fi, if it isn't encrypted | Trusted certificates |

We don't plan for an attacker with administrator rights on the device, or for Anthropic, Apple, Google or Microsoft themselves acting against us.

**The boundaries:**

```
  crafted files ──► Import worker ──► validated data ──┐
                                                       ▼
  learner text ──► webview (studio) ──── commands ──► native layer ──► Anthropic
                       ▲                                 │  ▲
                       │                                 │  └── OS secure store, policy
  app.storystage.org ──┘ (browser version: no native)    └────► sidecars

  GitHub Releases ──► updater ──► the installed app
```

## 2. Threats, controls and tests

Each threat has a letter for its STRIDE class: **S**poofing, **T**ampering, **R**epudiation, **I**nformation disclosure, **D**enial of service, **E**levation of privilege. **Built** means the control and its test exist. Otherwise the named task builds them, and it isn't done until the test passes.

### 2.1 The webview and the native layer

Assume the webview can be compromised: the rest of this spec tries to stop that, and this boundary must hold if it fails.

| Id | Class | Threat | Control | Test | Where |
|---|---|---|---|---|---|
| W1 | I | Web code reads the key | No command returns it. Rust reads it only inside the send path, after the policy enforcement point passes the request | The leak scan from spike 1.6: page, storage, IPC replies and a heap snapshot, with a positive control | WP15k |
| W2 | E | A compromised webview uses the key for anything it likes | Every request is checked against the allowlist in spec 04 §1.8: model per mode, token ceiling, pinned hashes of `system` and `tools`, pinned mode messages, no extra fields, caps | One test per check, each refused before the network | WP15k |
| W3 | T | A request carries its own key or auth header | `containsSecret` in the transport, and checked again in Rust | A request with a key-shaped string is refused | WP15k |
| W4 | E | Remote content runs with the app's permissions | Only bundled files. No remote URL in any window. Navigation away from the app is refused | A test page tries to navigate and to open a window | WP15k |
| W5 | E | Script injected into the webview | The content security policy in `tauri.conf.json`: `script-src 'self' 'wasm-unsafe-eval'`, no `unsafe-eval`, and `connect-src` limited to the app. No `dangerouslySetInnerHTML`, enforced by lint. Learner and Prompter text is shown as text, never as HTML | A test that the policy has no remote hosts. A lint rule. A script line of `<img src=x onerror=…>` shows as text | The policy is in place; its test with WP15k; lint and text with WP12b, S5 |
| W6 | E | The webview calls a command it shouldn't | `build.rs` lists every command, and each needs a permission in `capabilities/`. The Prompter's commands go to the Prompter's window only | A test that `default.json` grants only the listed permissions | `build.rs` lists the commands (#87); the test, and the Prompter's window, with WP15k |
| W7 | E | DevTools or a debugging port in a release build | Tauri's `devtools` feature stays off. No remote-debugging switch in release. The leak scan's harness turns the port on in its own build only | A test on the release config | WP15k |
| W8 | I | The key reaches a log or diagnostic bundle | The key is never formatted. Anything holding it prints `(hidden)`. Logs are scrubbed for `sk-ant-` | A unit test on the type, and a scan of logs in the leak test | WP15k |
| W9 | D | A compromised webview floods the native layer | One request in flight at a time, plus the per-minute cap | 30 simulated clients back off without a retry storm (WP15 done-when) | WP15k |
| W10 | I | **On a shared Windows login, the key can be read by any program running as that user.** Credential Manager protects it from other accounts, not from that account. A pupil who can run a script can read it, without going near the webview | Can't be closed by the app. So: the wizard says the adult's key belongs on the adult's login, not a shared pupil login; the wizard asks for a monthly spend limit in a StoryStage workspace; and **Remove key** works. This weighs against 24.3 option C (see section 5) | The wizard's wording, in the UX tests. A manual check, in the human review | WP15k, WP24a |

### 2.2 The policy and the school lock

| Id | Class | Threat | Control | Test | Where |
|---|---|---|---|---|---|
| P1 | E | A pupil edits or replaces the school's file | The file is created by an administrator, so a standard user can't change it (spec 05 §3.6) | A file owned by Administrators is trusted | Built |
| P2 | E | A pupil creates a file that widens something | On Windows only the owner's group makes it trusted. An untrusted file can only narrow | Each widening key, with an untrusted file | Built |
| P3 | E | A pupil points the app at another folder | The folder comes from the system, never from `PROGRAMDATA`. No switch or variable overrides the policy | The path doesn't move when the variable changes | Built |
| P4 | T | A typing slip leaves the lock off in an exam | An unknown `prompter.*` key, or a bad value, fails closed | A table of broken files, all with the Prompter off | Built |
| P5 | T | UTF-16 with no byte order mark reads as nothing, and the lock silently does nothing | Text containing NUL is unreadable | The same file, with no mark | Built |
| P6 | T | A pupil creates the folder before the school deploys, and later deletes the school's file | A file in a pupil's folder isn't trusted. The IT guide says to create the folder with the file. Deletion itself can't be detected: no file means no policy | The ownership call is tested on a file, and the same call is made on the folder. The guide, in 24.7 | Built (owner check); WP24b (guide) |
| P7 | D | A pupil makes a broken file, so the Prompter and updates stop for that device | Accepted: it can only take away, and the diagnostic shows the IT manager why | None needed | Accepted |
| P8 | E | The webview ignores the policy and shows the Prompter anyway | The studio's view is advisory. The transport reads the policy again before each request, and refuses | With the file set, `prompter_status` reports `prompter_off` | WP15k |
| P9 | I | The diagnostic shows a file's contents | Line numbers and reasons only | A test with secret words in a file | Built |

### 2.3 Imported files

Every imported file may be crafted. The rules are in section 3. This table says why.

| Id | Class | Threat | Control | Test | Where |
|---|---|---|---|---|---|
| F1 | T, E | **Zip slip:** a `../` entry writes outside the app's folder | Entries are read in memory, and never written to disk under the name in the archive. Rule 3.2 rejects the name anyway | A crafted zip for each bad form in 3.2 | WP8.4, 9.1 |
| F2 | D | **Zip bomb:** a small file expands until the device dies | The limits in 3.1, counted while inflating, because a zip's declared sizes can lie | A bomb with honest sizes, and one with false ones | WP8.4, 9.1 |
| F3 | D | An XML bomb in `.a3p` | Reject any document with a `<!DOCTYPE`, before parsing. Size and depth limits | A billion-laughs file | WP9.1 |
| F4 | I | XML external entities read local files | The same rule. Nothing is fetched | A file with an external entity | WP9.1 |
| F5 | E | A crafted program runs code | The AST is data. The interpreter has no `eval`, no network and no file access, and every call goes through the Story API. The content security policy backs this up | A program with every node kind runs with no way out. A search for `eval` and `new Function` in `runtime` | WP6, S2 |
| F6 | T | A file that isn't valid reaches the app | The schema check comes first, whole, before anything is loaded. Unknown node kinds, or a newer version than this app reads, are refused in plain words. This applies to a tool call from the Prompter too | Fuzzed productions: each is loaded or refused, and nothing crashes | WP8.4, 13.2 |
| F7 | D | A program that never ends, or that fills memory | It runs in its own worker. Stop always works, by ending the worker. Limits on list sizes | An infinite loop stops within a second. Stop works while it runs | WP6, S2 |
| F8 | E, D | A crafted glTF or image attacks the decoder, or exhausts memory | Import worker. Limits in 3.4. Image sizes are read from the header before decoding. Decoders stay current through the advisory checks | A glTF with a false size, and an image of 20,000 × 20,000 | WP3.11, S4 |
| F9 | I, S | A glTF reaches out with a remote `uri` | Only embedded data, or files in the same import. Any `http:`, `https:` or `file:` URI is refused. The content security policy blocks it as well | A glTF with a remote image makes no request | WP3.11, S4 |
| F10 | E | A script line or name renders as markup | Fountain is plain text, shown as text (W5). The parser is linear, so no pattern can stall it | A 1 MiB line finishes in under a second. Markup shows as text | WP10.4, S4 |
| F11 | I | A production holds someone's personal details, or a key | The list of what is never stored in the file (8.1). The app scans for key-shaped text before saving and export | A key pasted into a script isn't saved | WP8.4 |
| F12 | D | A file is opened that crashes the app every time it's reopened | A production that fails to open is not reopened automatically | Crash during open, then restart | WP8.4 |

### 2.4 Learner text and the Prompter

Text from a production may be someone else's, written to steer the Prompter.

| Id | Class | Threat | Control | Test | Where |
|---|---|---|---|---|---|
| L1 | T, E | **Prompt injection:** a script line tells the Prompter to ignore its rules | Spec 04 §2.4: one function writes every block as JSON, with `<`, `>` and `&` escaped, inside named tags. The system prompt says data is never instructions | The injection category in the evaluation set, and a unit test that no text can close a tag | WP13.2, S7 |
| L2 | E | Injection makes the Prompter write the story, against rule 4 | No tool can write the logline, synopsis or script. Tools are pinned by hash | The evaluation set. A test that no tool's schema reaches those fields | WP13.2, S7 |
| L3 | T | Injection makes Build it change the program without consent | Plan before change (13.9): the learner sees and edits the plan first, and every change is an undoable edit operation | A test that nothing is built without the plan being accepted | WP13.9, S7 |
| L4 | I | The Prompter is led to send something it shouldn't | It has no network tool. Requests hold text only: no images, no audio (rule 3), checked in Rust (W2). It sees only the open production | A request with image content is refused | WP15k |
| L5 | I | A child types personal details, and they reach Anthropic | Plain words in the panel. The adult's set-up says what is sent. The DPIA covers it. It can't be prevented in free text | The wording, in the UX tests. DPIA (WP17.3) | WP13, WP17 |
| L6 | S | A reply shows a link or text that misleads a child | Replies are shown as text, with no live links, images or HTML | A reply containing a link and markup | WP13c, S7 |
| L7 | D | A pupil or a loop runs up the adult's bill | Per-minute and per-day caps in the native layer (24.5), a token ceiling, and a spend limit in the Console | Caps refuse with `cap_reached` | WP15k, WP24b |
| L8 | R | Nobody can tell what the Prompter did | Each change is a labelled edit operation in the undo history. Study logs are pseudonymous and stay on the device | The history names each Prompter change | WP7, WP13 |

### 2.5 Sidecars

FFmpeg where WebCodecs is missing (provisional, WP1.8), and Rhubarb later (14.4).

| Id | Class | Threat | Control | Test | Where |
|---|---|---|---|---|---|
| C1 | E | A title or file name injects a command | Arguments are arrays, never a shell string. No Tauri shell plugin. Names on the command line are ones the app made, in its own temp folder | A title containing `; rm -rf ~` and `$(…)` | WP11, WP15k |
| C2 | E | The webview starts a sidecar with its own arguments | No command takes arguments or a path from the webview. It asks for a job by kind | A test on the command's input type | WP11 |
| C3 | T | A sidecar binary is swapped in the build | Fetched at a pinned version with a pinned checksum, and bundled inside the signed app | CI fails on a wrong checksum | WP11 |
| C4 | D | A sidecar runs for ever | A time limit, and it ends with the app | A job that hangs is stopped | WP11 |

### 2.6 The browser version

Static files at `app.storystage.org`, in a clean folder with no WordPress (0046).

| Id | Class | Threat | Control | Test | Where |
|---|---|---|---|---|---|
| B1 | I | Another site reads saved work | A separate origin from WordPress, which shares nothing with it | A check of the origin, at release | WP15b |
| B2 | E | Script injected into the page | The same content security policy, sent as a header. No third-party script, font or analytics. HTTPS with HSTS | A release check of the headers. A test that the build makes no third-party request | WP15b |
| B3 | T | The Bluehost account is taken over, and the app is changed for every school | Two-factor sign-in. The release publishes a hash of the build, and a check compares the live site with it | A scheduled comparison of the live files | WP15b (owner: two-factor) |
| B4 | E | A bad build lives on through a service worker | No service worker in the first release | A check of the build | WP15b |
| B5 | I | On a shared computer, the next pupil finds work in browser storage | Saving goes to a file. The banner says work isn't saved to a file. The privacy notice says so | The banner, in the UX tests | WP8.4 |
| B6 | E | Prompter code is present in the browser build | The browser build has no transport, and `browserHost` uses `offTransport` (0022) | A test that the transport is off in `browserHost` | Built (#88) |

### 2.7 Updates and the build

| Id | Class | Threat | Control | Test | Where |
|---|---|---|---|---|---|
| U1 | T, E | A tampered update | Every build is signed, and the public key is built into the app. A build that fails is dropped | The drill, with a build signed by the wrong key | WP15.7 |
| U2 | E | The updater key is stolen | It lives only in the `release` environment and the owner's offline copy. No pull request can reach it: `Release` runs by hand and uses no build cache. The environment needs the owner's approval | A check of the environment's settings | Owner, with the key |
| U3 | T | Whoever controls the host offers an older signed build | The manifest isn't signed. A device moves down only if its own version is listed as `withdrawn` or a school pinned it, so this can't be fully closed. Accepted, for review | Unit tests on `should_move` | Built (#99) |
| U4 | T | A bad package reaches the app | Frozen lockfiles, pinned actions by full SHA, `cargo deny`, Dependabot and CodeQL. A new dependency is reviewed with its licence | CI | Built |
| U5 | E | A pull request reads a secret | Only `Release` and `Channel` use the `release` environment, and they run by hand. No workflow on `push` or `pull_request` names a secret. The default token is read-only | A test that lists which workflows name a secret | Controls in place; the test with WP15b |
| U6 | I | The update check identifies a device | A static file with nothing about the device. The rollout `bucket` stays on the device. GitHub sees an IP address, named in the DPIA (0047). A school can stop the check | A test that the URL holds only a channel or a version | Built (#99) |
| U7 | D | A broken update reaches every school | Staged rollout, pilot first, and a rollback that needs no rebuild | The rollback drill | WP15.7 |

### 2.9 Speech models

whisper's model files (spec 05 section 5, spec 06 section 1.3). The default is bundled in the app (decision 0057). The optional one is downloaded only when a learner asks.

| Id | Class | Threat | Control | Test | Where |
|---|---|---|---|---|---|
| M1 | T, E | A changed model file crashes the decoder, or takes it over | Each model is pinned by SHA-256 and size. The build refuses a bundled one that doesn't match, and every load checks again, so a file changed on disk is never used. The decoder runs in a worker with no network and no file access | A tampered file is refused at load. The build fails on a changed upstream file | Spec 05 §5, S8 (native), S7 (worker) |
| M2 | I | A model fetched by the webview, or from a new host, reveals the device | The native layer fetches. The webview's content security policy gains no host. The optional model comes from the update host (decisions 0047 and 0061), and only after consent | A test that the address is pinned. The leak scan's report shows no remote fetch by the webview | Spec 05 §5.3 |
| M3 | D | A huge or never-ending download fills the disk | The download stops once more bytes arrive than the pin allows. It goes to a temporary file, and is deleted if it doesn't match | A server that sends too much, and one that announces a different size | Spec 05 §5.3 |
| M4 | E | The webview names a file of its choice to load | Commands take a pinned model's name only, never a path. Any other name is refused | A test with a path and an unknown name | Spec 05 §5.5 |
| M5 | E | The webview reads files through the fs plugin that Android needs | It's used from Rust only, and no capability grants it to any window | The leak scan's ungranted-plugin check covers plugins registered on desktop; on Android, with the human review | Spec 05 §5.2 |
| M6 | E | Cross-origin isolation is turned off, or a page loads content it shouldn't | `Cross-Origin-Embedder-Policy: require-corp` stops anything cross-origin loading without consent. The content security policy is unchanged | A test on the shipped headers | Spec 05 §5.6 |

### 2.10 Pupils on shared devices

Decision 0065: pupil folders in the app, inside the device user's own data, with Collect and Hand back through files. Built in 24.4.

| Id | Class | Threat | Control | Test | Where |
|---|---|---|---|---|---|
| PS1 | I, T | A pupil opens, changes or deletes another pupil's production in the app | Each folder opens only by choosing that name, and nothing lists other pupils' productions. Deleting asks first, and goes to a bin the teacher empties | A pupil's view shows only their own productions | 24.4 |
| PS2 | I | A pupil reads another's files on disk, on a shared desktop login | Accepted, and said in the DPIA: folders stop slips and casual looking, not a determined pupil on a shared desktop login. Per-pupil sign-in on the device removes it | n/a | Accepted |
| PS3 | I | The class list on a device names children | It stays in the app's data on the device, never in a production, an export or a study log. First names, or a word and a picture, are enough | A production, an export and a study log hold no class list | 24.4 |
| PS4 | D | Work is lost: a device is reset, or a pupil is on another device | Autosave and backups (8.4). Collect and Hand back. Settings shows when work was last collected | Collect, reset, hand back: every production returns | 8.4, 24.4 |
| PS5 | T, E | A handed-back file is crafted | The same import rules as any file (section 3, F1 to F12) | The hostile-file set, through Hand back | 24.4 |
| PS6 | I | A collected folder on a school drive is readable by others | The school's storage, under its own sharing settings. The teacher's guide (24.7) says to collect into a staff-only folder | The guide | 24.7 |

### 2.8 The classroom relay, if chosen

Only if the owner chooses option B in WP24.3. Nothing is built until then, and these are the spike's questions.

| Id | Class | Threat | Control | Test | Where |
|---|---|---|---|---|---|
| R1 | S | A device joins a class it isn't in | A class code from the teacher, with enough randomness and a limit on tries, valid for one lesson | Guessing is refused | WP24a |
| R2 | I, T | Someone on the network reads or changes requests | Traffic between devices is encrypted, with a key from the class code, not plain HTTP | A capture shows no text | WP24a |
| R3 | S | A device poses as the teacher's | The pupil's device checks the teacher's device from the code, not from a name on the network | A rogue device is refused | WP24a |
| R4 | D | A pupil floods the teacher's device, or uses up the class's limit | Caps per device on the teacher's side | Flooding from one device leaves the others working | WP24a |
| R5 | E | A pupil's device reaches the key | The relay accepts only Prompter requests, through the same checks as W2, and never returns the key | The same tests, across the relay | WP24a |

## 3. Rules for imported files

For S4 and S6. **One archive reader, in `packages/production`,** is used by `.storystage`, `.a3p` and any imported model pack, so these rules live in one place and are tested once. The numbers below are limits to begin with, for the reference devices. S4 may change them with a measurement, here, in the same pull request.

Import happens in the import worker, off the main thread, with no network, and ends if it runs for more than 60 seconds. Refusals are in plain words and never quote the file.

### 3.1 Sizes

| Limit | Value |
|---|---|
| File on disk | 512 MiB |
| Everything once unpacked | 1 GiB |
| One entry once unpacked | 256 MiB |
| One JSON or XML entry | 64 MiB |
| Number of entries | 20,000 |
| Unpacked size against packed size, for an entry over 1 MiB | 200 to 1 |
| Nesting in JSON or XML | 256 levels |

**Count the bytes while inflating, and stop at the limit.** Never trust the sizes a zip declares.

### 3.2 Names in an archive

Reject the whole file if any entry:

- contains `..` as a path part, or a backslash, NUL or control character;
- is absolute: starts with `/`, a drive letter or `\\`;
- is a symbolic link or a device file;
- has a part that Windows reserves (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`9`, `LPT1`–`9`) or that ends in a dot or a space;
- is longer than 255 characters;
- has the same name as another entry after Unicode NFC and case folding.

Entries are looked up from the list the format expects. An entry the format doesn't name is ignored and never written out.

### 3.3 `.storystage` and `.a3p`

- **Schema first:** the whole file is checked against the schema before anything is loaded (F6). A failure loads nothing.
- **`.a3p`:** XML with a `<!DOCTYPE` is refused before parsing. Read UTF-8 and UTF-16, as 9.1 says. Nothing is fetched.
- **Fountain:** 1 MiB at most, as plain text, and parsed in linear time.

### 3.4 Models and images

- glTF has its budgets from 3.11, checked before loading: triangles, joints, textures.
- `uri` values are embedded data, or files in the same import (F9).
- Image width and height come from the header before decoding: 8192 pixels on a side at most, and 40 million pixels in all.
- Only the glTF extensions the stage uses are accepted. An unknown required extension refuses the file.
- **A film's packed models are checked when it opens,** as imports are, in the import worker within its 60-second limit (`checkFilmInWorker`; spec 03, section 1.3). Each sketch must be exactly what Backstage's renderer writes (`isSafeSketch`), with every attribute's value too. A model that fails, or every model if the check can't finish, shows as an outline, with the reason in plain words.

## 4. Tests

How each rule in this spec is tested, and at which level (`09-testing.md`).

- **Each table above names its test.** A task isn't done until its row's test passes. The pull request says which ids it closes.
- **Hostile files:** a shared set, built at test time rather than stored, in `packages/production`, used by each importer: every form in 3.2, both kinds of bomb, an XML bomb, and a glTF with a remote image.
- **The leak scan** runs in CI on every desktop build, and in the self-test (WP18), as the owner decided on spike 1.6.
- **The injection category** in the evaluation set (13.7) has script lines, names and comments.
- **Fuzzing:** the schema check and the archive reader get random and mutated input in CI, for a fixed number of runs.

## 5. What stays open

- **The human security review,** before the pilot. W1, W2, W10 and U3 first.
- **W10 and WP24.3.** Option C, a key on every device, puts the key where any program on a pupil's login could read it on Windows, as well as breaking the rule against keeping it in a settings file. This is a further reason to prefer A or B.
- **Pupil separation on shared devices** is decided (0065) and in section 2.10. PS2 is accepted for shared desktop logins.
- **Accepted, and recorded here:** P7 (a pupil can turn the Prompter off on a device), and U3 (an older signed build, if the host is taken over).
