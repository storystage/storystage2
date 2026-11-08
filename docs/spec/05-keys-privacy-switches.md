# 05 Keys privacy switches

- **Covers:** Wizard, key store per platform, the gate and transport, policy and managed configuration, updates and channels (from StoryStage 1 spec 02)
- **Work package:** WP15.2 (sections 1 and 2); WP15.3, WP15.7 (sections 3 and 4)
- **Owner:** S8
- **Status:** all sections written, each before the code it governs: sections 3 and 4 on 31 Oct 2026, sections 1 and 2 on 1 Nov 2026.
- **Carried over from:** StoryStage 1 spec 02 (keys, privacy, switches); see `docs/carried-over/` and its note on what changes.

## 0. Decisions this spec relies on

[0003 Delivery](../decisions/0003-delivery.md), [0005 API key](../decisions/0005-api-key.md), [0022 Off switches](../decisions/0022-off-switches.md), [0026 App identifier](../decisions/0026-app-identifier.md), [0028 Host interface](../decisions/0028-host-interface.md), [0034 Teacher Prompter levels](../decisions/0034-prompter-levels.md), 0049 Key entry, [spike 1.6 Key path](../decisions/spike-1.6-key-path.md). The threats these sections answer are in `15-security.md` section 2.1 (W1 to W10).

## 1. Wizard

The studio draws the set-up pages (Direction A screens 10a to 10d). The key itself is typed into a **system dialog**, never into the studio (decision 0049, CLAUDE.md rule 1).

### 1.1 The pages

| Page | Who draws it | Content |
|---|---|---|
| 10a Who is setting up | Studio | Learner or adult. A learner skips to the app, with the Prompter off |
| 10b About the Prompter | Studio | What the Prompter does, what is sent, what is never sent, and the adult's consent. "The Claude account must belong to an adult." It also says the key belongs on the adult's own login, not one that pupils share (threat W10) |
| 10c Add your Claude key | Studio, with one system dialog | The steps for making a key, with a spending limit on its workspace. An **Add key** button opens the dialog. There is no key field in the studio |
| 10d You're ready | Studio | The summary. It shows the key's status, and never the key |

Finishing the wizard is the only way to switch the Prompter on (0022).

### 1.2 The system dialog

One small dialog from the platform's own controls, in the native layer. It has a masked field, Cancel and Add, and pasting works as it does anywhere on that platform. There's no Show: a key is pasted, not typed, and a wrong paste is pasted again. It has no microphone, as on screen 10c.

| Platform | Controls |
|---|---|
| Windows | A small window of Win32 controls, with a password edit control |
| macOS | `NSAlert` with an `NSSecureTextField` |
| Android and Chromebook | `AlertDialog` with a password `EditText`, in the `secure-key` plugin |
| iPad | Not yet: `UIAlertController` with a secure text field. It waits for the Apple developer account (WP15.5), because it can't be built or run before that. Until then the iPad has no way to add a key, so its Prompter stays off |

When the adult presses Add, the native layer trims the text and checks the key against `GET /v1/models`, which uses no tokens. It stores the key only if that succeeds. Then it clears the text.

### 1.3 What the studio can do

Three commands, and none of them takes or returns the key.

| Command | Takes | Returns |
|---|---|---|
| `key_add` | Nothing | One outcome from the table below |
| `key_status` | Nothing | `present` or `absent` |
| `key_remove` | Nothing | Nothing. It deletes the key and switches the Prompter off |

| Outcome | When | On screen 10c |
|---|---|---|
| `saved` | The check passed and the key is stored | "Key works. Checked just now." |
| `cancelled` | The adult closed the dialog | Nothing changes |
| `notAccepted` | 401 | "That key wasn't accepted." |
| `noClaudeAccess` | 403 or 404 | "That key works but can't use Claude models." |
| `unreachable` | No connection | "Couldn't reach Anthropic: check the internet connection or school proxy." |
| `storeUnavailable` | The secure store refused | "This device can't keep the key safely, so the Prompter stays off." |
| `refusedByPolicy` | The level is Off, so a pupil can't add a key on a locked device. No dialog opens | "Turned off by your school" |

## 2. Key store, gate and transport

### 2.1 Where the key lives

| Platform | Store | Entry |
|---|---|---|
| Windows | Credential Manager | Service `StoryStage2`, account `anthropic-api-key` |
| macOS, iPad | Keychain | The same |
| Android and Chromebook | An AES key held in Android Keystore, which can't leave it, encrypts the Claude key. The result is a file in `noBackupFilesDir`, so it never goes into a cloud backup | The same names |

There is **no fallback**. StoryStage 1's DPAPI file is gone (threat model): if the store can't be used, the Prompter stays off and the outcome is `storeUnavailable`. Nothing is kept for the session.

### 2.2 Rules for the key

- It is read only inside `prompter_send`, after the gate has passed the request, and held only for that one request.
- The type that holds it clears its memory when dropped, and prints as `(hidden)`.
- No command returns it, and nothing derived from it, such as a hash or a last few characters.
- It never appears in a log, settings file, production, export, study log or diagnostic bundle.
- The `ANTHROPIC_API_KEY` environment variable is ignored.
- It is sent only to `https://api.anthropic.com`. That address is fixed. Only a test build (a Cargo feature that release builds never turn on) can change it, for the fake server.

### 2.3 The gate

Every request passes the gate before the key is read. The gate is `storystage-gate`, a crate with no Tauri and no network. It carries out spec 04 section 1.8 in this order, and stops at the first refusal, so nothing is sent:

| Check | Refused with |
|---|---|
| The level in force (3.4) allows the mode: Off allows none; Explain only allows `explain`, `storyCoach` and `scriptCheck`; Plan only and Full allow all | `refused_by_policy` |
| The level allows it once the day's cap is taken into account (2.4) | `cap_reached` |
| Nothing in the body or `betas` looks like a key or an auth field | `refused_by_policy` |
| `model` is allowed for `mode`, and `max_tokens` is at or under the mode's ceiling | `refused_by_allowlist` |
| `stream` is `true` | `refused_by_allowlist` |
| `betas` is a subset of the allowed list, and `fallbacks` is absent or `"default"` | `refused_by_allowlist` |
| `system` and `tools` hash to the pinned values | `refused_by_allowlist` |
| Each `role: "system"` entry in `messages` is one of the pinned mode messages | `refused_by_allowlist` |
| No top-level `thinking`, `tool_choice`, `temperature`, `top_p` or `top_k`, and no field outside the known list | `refused_by_allowlist` |
| No `image` or `document` content anywhere in `messages` (rule 3) | `refused_by_allowlist` |
| The per-minute and per-day caps (2.4) | `rate_limited` for the minute, `cap_reached` for the day |

A request refused by any check above doesn't count towards the caps.

**Pins.** `apps/desktop/src-tauri/gate/pins.json` is built into the app. It holds the allowed model and token ceiling for each mode (spec 04 section 1.3), the allowed betas, and SHA-256 hashes of `system`, `tools` and each mode message. Both sides hash the JSON with keys sorted and no spaces, and a test proves they agree. A pin that isn't set yet refuses everything it guards. `packages/prompter` makes the file, and CI fails if it's out of date, as the schedule check does.

### 2.4 Caps

| Cap | Value | Counted | Reached |
|---|---|---|---|
| Per minute | 10 requests, on one device | In memory | `rate_limited`, with the seconds until a slot frees |
| Per day | `prompter.dailyCap` (3.3), or no limit | On the device, by local date, in the app's data folder | `prompter.capAction` |

When the day's cap is reached and `capAction` is `explainOnly`, the level drops to Explain only for the rest of the day, and requests in other modes get `cap_reached`. With `off`, every request gets `cap_reached`. A further 50% of the cap in Explain only is allowed, and then every request gets `cap_reached`: the graduated limit in 24.5.

Only requests that reach the network count. A learner who can edit the app's data folder can reset the count on that device, so the Console's spending limit is the real ceiling (threat L7). Class-wide counts follow in WP24b.

### 2.5 Transport

- One request in flight on a device at a time. A second gets `rate_limited`.
- HTTPS only, with the system's certificates, so a school's inspecting proxy works, and the system's proxy settings. Connection timeout 30 seconds. A stream that's silent for 120 seconds ends with `offline`.
- `POST /v1/messages`, with `anthropic-version: 2023-06-01`, `anthropic-beta` from the checked `betas`, and the key added last.
- **Retries:** at most two, only for 429 and 5xx, and only before the first byte of the reply. The wait doubles from 1 second, with up to 100% random jitter added, and `retry-after` is honoured if it's longer. A device that gets `retry-after` longer than 60 seconds doesn't retry at all.
- **Cancelling:** `prompter_cancel` ends the request. It ends with `cancelled`, and no retry follows.
- After `end` or `error`, nothing else is sent on the channel.

| Cause | Code |
|---|---|
| No connection, a timeout, or a dropped stream | `offline` |
| No key in the store | `no_key` |
| 401 or 403 | `key_revoked` |
| 402 | `no_credit` |
| 429, after retries | `rate_limited`, with `retryAfterSeconds` |
| 5xx or 529, after retries | `overloaded` |
| Anything else, including 400 | `internal` |

### 2.6 Commands and windows

`prompter_send`, `prompter_cancel` and `prompter_status` follow the transport contract. Each has its own permission in `capabilities/`, as do the `key_*` commands. There is one window today, so `main` holds them. When the Prompter gets a window of its own, they move to it. `prompter_status` reads the policy again, so a lock applied while the app is open shows at once. It reports `prompter_off` at level Off, then `no_key`, and otherwise `available`.

### 2.7 CI

- **The leak scan** from spike 1.6 runs on each desktop build: the page, storage, IPC replies and a heap snapshot, with a positive control. It uses a test build with a random key made in CI. The port it needs is never in a release build.
- **The retry storm test:** 30 simulated clients against a fake server that answers 429. The test passes if no client retries more than twice and the retries spread out.

## 3. Policy and managed configuration

A school sets the policy once, with the tools it already uses. The native layer reads it, and the studio is told the result through the host interface (decision 0028).

### 3.1 Who decides what

From strongest to weakest:

| Level | Set by | Where it lives |
|---|---|---|
| Build | The release | The browser version has no transport, so no Prompter (0022) |
| School lock | The school's IT manager | The policy file, or managed app configuration (3.2) |
| Class set-up | The teacher | The class settings (WP24, screen 11) |
| This device | The learner or adult | The app's own settings |

**A lower level can only narrow what a higher level allows.** The policy never turns anything on for a learner. `prompter.enabled=true` means "the Prompter may be used", and the Prompter still stays off until an adult completes the wizard and the user switch is on (0022).

### 3.2 Where the policy comes from

| Platform | Source | Who can change it |
|---|---|---|
| Windows | `%PROGRAMDATA%\StoryStage\policy.properties` | An administrator, if an administrator created it (3.6) |
| macOS | `/Library/Application Support/StoryStage/policy.properties` | An administrator |
| iPad | Managed app configuration: the `com.apple.configuration.managed` dictionary in the app's user defaults, pushed by device management | The school's device management |
| Android and Chromebook | Managed configuration: `RestrictionsManager.getApplicationRestrictions()`, with a schema in `app_restrictions.xml`, pushed by managed Google Play | The school's device management |
| Browser version | None. The browser version hands the studio a fixed policy with the Prompter off | Nobody |

The Windows and macOS paths are StoryStage 1's on purpose. A school running both versions during the move sets one file, and an exam lock covers both.

There is no environment variable, command-line switch or developer override for the policy. Tests pass a path to the reader directly. On Windows the native layer asks the system for the folder, rather than reading the `PROGRAMDATA` variable, because a learner can start the app with that variable changed. If the folder can't be found, the policy is unreadable (3.5).

### 3.3 The keys

Every platform uses these key names. Names are case-sensitive.

| Key | Values | With no policy | When unreadable (3.5) | Widens? (3.6) |
|---|---|---|---|---|
| `prompter.enabled` | `true`, `false` | `true` | `false` | No |
| `prompter.explainOnly` | `true`, `false` | `false` | n/a, the Prompter is off | No |
| `prompter.planOnly` | `true`, `false` | `false` | n/a, the Prompter is off | No |
| `prompter.voiceInput` | `true`, `false` | `true` | `false` | No |
| `prompter.dailyCap` | A whole number from 0 to 100000: requests per pupil per day. 0 allows no requests | no limit | n/a, the Prompter is off | No |
| `prompter.capAction` | `explainOnly`, `off` | `explainOnly` | n/a, the Prompter is off | No |
| `storyboard.allowImportedWithoutStoryboard` | `true`, `false` | `false` | `false` | Yes, for `true` |
| `editor.default` | `blocks`, `tiles` | `blocks` | `blocks` | Yes |
| `editor.locked` | `true`, `false` | `false` | `false` | No |
| `study.enabled` | `true`, `false` | `false` | `false` | Yes, for `true` |
| `backstage.import` | `off`, `teacher`, `learners` | `teacher` | `off` | Yes, for `learners` |
| `backstage.search` | `true`, `false` | `false` | `false` | Yes, for `true` |
| `update.channel` | `stable`, `pilot`, `off` (section 4) | `stable` | `off` | Yes |
| `update.pin` | A version, such as `1.4.2`, or empty for none | none | none | Yes |

`update.channel=off` is an addition to the values in WP15.7: a school that deploys updates through its own tools needs a way to stop the app contacting the update host at all.

### 3.4 The four Prompter levels

Decision 0034 maps the keys onto the levels. The native layer works out one level, and it is what the transport enforces (WP15.2) and what the studio shows:

| `prompter.enabled` | `prompter.explainOnly` | `prompter.planOnly` | Level |
|---|---|---|---|
| `false` | any | any | **Off** |
| `true` | `true` | any | **Explain only** (the more restrictive wins) |
| `true` | `false` | `true` | **Plan only** |
| `true` | `false` | `false` | **Full** |

### 3.5 The policy file's format, and what "malformed" means

The file is plain text so a school can deploy it with its usual tools:

- One `key=value` per line. Spaces around the key and the value are ignored. Blank lines are ignored, as are lines starting with `#` or `!`.
- UTF-8, with or without a byte order mark. UTF-16 with a byte order mark is also read, because that is what `>` writes in Windows PowerShell 5.
- No larger than 64 KiB.

**Any of these makes the policy unreadable, and an unreadable policy fails closed:**

- a line that is not a comment, not blank and has no `=`;
- a value a known key does not accept;
- the same key twice with different values;
- an unknown key starting with `prompter.`, in any case, so that a typing slip in an exam lock (`prompter.enable=false`) turns the Prompter off rather than leaving it on;
- a file that is too large, or can't be decoded;
- a file that exists but can't be read. Only "no such file" counts as no policy.

Other unknown keys are ignored, as in StoryStage 1, so that a policy written for a newer version works on an older one. The diagnostic gives their line numbers.

Unreadable means every key takes the "When unreadable" column in 3.3: the Prompter is off, nothing is imported, nothing goes out, and updates stop, because a pin the app couldn't read must not be overridden by an update. The app itself keeps working, and learners keep their work.

The native layer keeps a one-line diagnostic with the line number and the reason, never the line's contents, for the IT manager.

Managed configuration on iPad and Android goes through the same checks. Its values are turned into the same strings first, so a device-management typing slip fails the same way. A key whose managed value is the wrong type (a number for a true-or-false key) is unreadable, like a bad value in the file.

### 3.6 Files a learner made

TR1 found that a standard Windows user can create the file if it doesn't exist yet: `C:\ProgramData` lets anyone create a folder there. A file a learner creates can't be allowed to widen anything, so:

- On Windows, a policy file is **trusted** only if the owner of the file and of its folder is the Administrators group or SYSTEM. That is what an elevated prompt, Group Policy and Intune give. A file copied by someone signed in as themselves is not trusted until it is fixed with `takeown /a`, and the diagnostic says so.
- If it isn't trusted, the keys marked "Widens?" in 3.3 go back to their "With no policy" values, and the rest still apply. So a file a learner makes can restrict that device, as in StoryStage 1, and can't switch on study logs, online search or a different update channel.
- On macOS, `/Library/Application Support` is writable only by administrators, so the file is trusted. Managed configuration is always trusted.
- A broken file that isn't trusted is still unreadable (3.5). A learner can turn the Prompter off on a device by making a bad file, which they could do anyway by not using it.

### 3.7 When it is read

Once at start-up. The transport reads it again before each Prompter request (WP15.2), so an exam lock applied while the app is open holds at the next request. A change to anything else takes effect at the next start.

### 3.8 What the studio is told

The policy in force reaches the studio through the host interface as one object, read through a single command, `policy_in_force`, which takes no arguments. It says what the policy *is*, never how to change it: no Tauri command writes the policy. The shape is the `PolicyInForce` type in `packages/host`, and one shared fixture is tested from both sides (section 5).

```json
{
  "source": "file",
  "trusted": true,
  "diagnostic": null,
  "set": ["prompter.planOnly", "prompter.dailyCap", "editor.locked"],
  "prompter": {
    "level": "planOnly",
    "voiceInput": true,
    "dailyCap": 20,
    "capAction": "explainOnly"
  },
  "storyboard": { "allowImportedWithoutStoryboard": false },
  "editor": { "default": "blocks", "locked": true },
  "study": { "enabled": false },
  "backstage": { "import": "teacher", "search": false },
  "update": { "channel": "stable", "pin": null }
}
```

- `source` is `none`, `file`, `managed`, or `unreadable`. The browser version uses `none` and level `off`.
- `set` lists the keys the school set, so the studio shows those controls disabled with "Turned off by your school" (wording from StoryStage 1 spec 02 §4; S5 owns the screens). Anything not in `set` is the teacher's to change.
- `diagnostic` is the line from 3.5, or `null`. It holds no file contents, because the webview shows it.
- `dailyCap` is `null` when there is no limit.

## 4. Updates and channels

Desktop only (WP15.7). The iPad and Android apps are updated by the stores and the school's device management, and they ignore `update.channel` and `update.pin`. Managed Play tracks and App Store phased release are set up in WP15b.

### 4.1 What the app does

1. At start-up it reads one static file from the update host (4.2): at most once a day, and also at the first start after its version changes, so a device that took a broken build finds the rollback at once. Nothing identifying the device or the learner is sent. The host sees an IP address, as any web host does.
2. If 4.3 says to move, it downloads the build in the background, to disk rather than memory, for the low-end devices.
3. It installs when the app is next closed, never during a lesson, after checking the signature (4.5). Learners see no prompt.

It stands down, and never asks for an administrator's password, if the current user can't write to the folder the app is installed in. On a shared school computer installed per machine, the school's deployment tools own updates. `update.channel=off` says the same thing explicitly and also stops the check.

### 4.2 The update host

Update files are static, so there is no StoryStage server (rule 2). *Proposed, for the owner to decide:* GitHub Releases on `storystage/storystage2`, because publishing and rollback then run from CI. Decision 0046 uploads the website by hand through a file manager, which can't support a timed rollback. This adds GitHub as a host that sees update checks, so the DPIA (WP17.3) must name it.

| Purpose | File |
|---|---|
| The latest build on a channel | `https://github.com/storystage/storystage2/releases/download/channel-<channel>/latest.json` |
| One exact build, for `update.pin` | `https://github.com/storystage/storystage2/releases/download/v<version>/latest.json` |

Each build's release keeps its own `latest.json` for ever. `channel-stable` and `channel-pilot` are releases that hold only a `latest.json`, and moving a channel means replacing that one file.

### 4.3 Which build a device should be on

The manifest is Tauri's updater format, plus two fields of our own, which the updater ignores and the decision below reads:

- `rollout`: 0 to 100, the percentage of devices offered this build. No field means 100.
- `withdrawn`: a list of versions pulled from the channel.

Each install picks a random `bucket` from 0 to 99 the first time it runs. It is kept in the app's local data and never sent anywhere.

| Case | Move? |
|---|---|
| `update.channel=off`, or the policy is unreadable, or the app can't write to its folder | No check at all |
| `update.pin` is set | Read that version's file. Move if it differs from the installed version, up or down: the school asked for exactly that build |
| The manifest's version is newer | Move if `bucket < rollout` |
| The manifest's version is older, and the installed version is in `withdrawn` | Move: this is a rollback, and `rollout` doesn't apply |
| Anything else, including older and not withdrawn | No |

A rollback is therefore one change to one file: point the channel's `latest.json` at the last good build and list the bad version in `withdrawn`. No rebuild is needed.

### 4.4 Channels and staged rollout

Every build goes to `pilot` first, at the rollout the release workflow is given. Promotion to `stable` copies the manifest to `channel-stable`, starting at a low `rollout` and raising it in steps by re-publishing the same manifest. Pilot schools choose `update.channel=pilot`.

A school holds a version through a term with `update.pin`. That is the only way to hold one: a pinned device installs only that version, on any channel.

### 4.5 Signing

Update files are signed with an updater key (Tauri's minisign format), separate from the Windows and Apple code-signing certificates (WP15.4). The public key is built into the app, and a build with none switches updates off. The private key lives in a GitHub Actions secret in a `release` environment, used only by the release workflow. It can't be rotated without reinstalling every copy of the app, so the owner keeps an offline copy.

The manifest itself isn't signed, only the builds it points to. Someone who took over the host could offer an older signed build but not a tampered one. The threat model (WP0.9) records this.

### 4.6 The version in About

The host interface gives the studio the installed version and the channel in force, and About shows them. On a pinned device it also says the version is held by the school.

### 4.7 The rollback drill

WP15's done-when. On the pilot channel:

1. Publish a good build with the `Release` workflow, and let a test install take it.
2. Publish a build marked broken the same way, and let the test install take it.
3. Run the `Channel` workflow with `rollback`, the good version, and the broken version to withdraw.
4. Start the test install, close it, and confirm that the next start is the good build.

The time from step 3 to step 4 is recorded in `docs/lanes.md`.

## 5. Tests

How each rule in this spec is tested, and at which level (`09-testing.md`).

| Rule | Test | Level |
|---|---|---|
| Every check in the gate (2.3) | One test per row, each refused before the network, with one good request as a positive control | Rust unit, `storystage-gate` |
| Caps (2.4) | The minute's window, the day's roll-over, both cap actions and the 50% allowance | Rust unit |
| Retries (2.5) | Waits, jitter, `retry-after`, and no retry after the first byte | Rust unit |
| One code per cause (2.5) | One test per row, and the same codes as `TRANSPORT_ERROR_CODES` | Rust unit and Vitest |
| Hashes agree between Rust and TypeScript (2.3) | One fixture, hashed on both sides | Rust unit and Vitest |
| The key can't reach the webview (2.2) | The leak scan (2.7) | Windows job |
| No retry storm (2.5) | 30 simulated clients (2.7) | Rust integration |
| The key's type hides it (2.2) | Its `Debug` output | Rust unit |
| The store round trip (2.1) | Store, read, replace and delete under a test-only entry | Windows and macOS jobs |
| What happens after the dialog (1.2, 1.3) | Stored only if the check passes, and nothing contacted if it's closed | Rust integration |
| The system dialogs (1.2) | By hand on each platform | Device (owner) |
| The webview can't reach the Android plugin (2.1) | `plugin:secure-key` is refused, because no capability grants it | Android job, with the human review |
| Parsing, values, defaults (3.3, 3.5) | One unit test per key and per way of being malformed | Rust unit, `storystage-policy` |
| Fail closed, with every "When unreadable" value (3.5) | A table of broken files, all giving the same result | Rust unit |
| The four levels, and the more restrictive winning (3.4) | All eight combinations of the three keys | Rust unit |
| A policy can only narrow (3.1, 3.6) | Each widening key, with an untrusted file | Rust unit |
| UTF-16 and byte order marks (3.5) | The same policy in each encoding | Rust unit |
| File ownership on Windows (3.6) | A file owned by TrustedInstaller is untrusted, and one given to Administrators with `takeown /a` is trusted | Rust unit, Windows job |
| The Windows folder comes from the system, not the variable (3.2) | The path doesn't move when `PROGRAMDATA` is changed | Rust unit, Windows job |
| `PolicyInForce` agrees on both sides (3.8) | One fixture, read by Rust and by TypeScript | Rust unit and Vitest |
| Managed configuration reaches the same checks (3.5) | Pairs of strings go through the file's rules | Rust unit |
| The schema is in the Android app (3.2) | `aapt2` finds it in the built APK | Android job |
| The iPad code compiles (3.2) | `cargo check` for iPad, with no Apple account | `ios (rust)` job |
| A real push reaches the app (3.2) | A setting pushed through managed Google Play, and through the iPad's device management | Device (owner). Android's push needs a device policy controller, which CI doesn't have |
| Which build to move to (4.3) | One unit test per row, with pins, rollout boundaries and rollbacks | Rust unit |
| When a device checks (4.1) | Once a day, and after a version change | Rust unit |
| Manifests, rollouts and rollbacks (4.2 to 4.4) | Building and changing a manifest | Vitest |
| The lock holds in the app (WP15 done-when) | With the file set, `prompter_status` reports `prompter_off` | WP15k, then device (owner) |
| Rollback (4.7) | The drill | CI, then a device (owner) |
