# 05 Keys privacy switches

- **Covers:** Wizard, key store per platform, policy and managed configuration, updates and channels (from StoryStage 1 spec 02)
- **Work package:** WP15.3, WP15.7 (sections 3 and 4); WP15.2 (sections 1 and 2)
- **Owner:** S8
- **Status:** sections 3 and 4 written, 31 Oct 2026, before the code they govern. Sections 1 and 2 follow with WP15k.
- **Carried over from:** StoryStage 1 spec 02 (keys, privacy, switches); see `docs/carried-over/` and its note on what changes.

## 0. Decisions this spec relies on

[0003 Delivery](../decisions/0003-delivery.md), [0005 API key](../decisions/0005-api-key.md), [0022 Off switches](../decisions/0022-off-switches.md), [0026 App identifier](../decisions/0026-app-identifier.md), [0028 Host interface](../decisions/0028-host-interface.md), [0034 Teacher Prompter levels](../decisions/0034-prompter-levels.md).

## 1. Wizard

_To be written with WP15k._

## 2. Key store per platform

_To be written with WP15k._

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

1. At start-up, and at most once a day, it reads one static file from the update host (4.2). Nothing identifying the device or the learner is sent. The host sees an IP address, as any web host does.
2. If 4.3 says to move, it downloads the build in the background and checks its signature (4.5).
3. It installs when the app is next closed, never during a lesson. Learners see no prompt.

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

1. Publish a good build, and let a test install take it.
2. Publish a build marked broken, and let the test install take it.
3. Run the rollback workflow, which restores the last good manifest and lists the broken version in `withdrawn`.
4. Start the test install, and confirm that it returns to the good build by itself.

The time from step 3 to step 4 is recorded in `docs/lanes.md`.

## 5. Tests

How each rule in this spec is tested, and at which level (`09-testing.md`).

| Rule | Test | Level |
|---|---|---|
| Parsing, values, defaults (3.3, 3.5) | One unit test per key and per way of being malformed | Rust unit, `storystage-policy` |
| Fail closed, with every "When unreadable" value (3.5) | A table of broken files, all giving the same result | Rust unit |
| The four levels, and the more restrictive winning (3.4) | All eight combinations of the three keys | Rust unit |
| A policy can only narrow (3.1, 3.6) | Each widening key, with an untrusted file | Rust unit |
| UTF-16 and byte order marks (3.5) | The same policy in each encoding | Rust unit |
| File ownership on Windows (3.6) | A file the runner's user owns is untrusted | Rust unit, Windows job |
| The Windows folder comes from the system, not the variable (3.2) | The path doesn't move when `PROGRAMDATA` is changed | Rust unit, Windows job |
| `PolicyInForce` agrees on both sides (3.8) | One fixture, read by Rust and by TypeScript | Rust unit and Vitest |
| Managed configuration (3.2) | The same keys pushed to the emulator with `adb` | Android job; iPad on a device (owner) |
| Which build to move to (4.3) | One unit test per row, with pins, rollout boundaries and rollbacks | Rust unit |
| The lock holds in the app (WP15 done-when) | With the file set, `prompter_status` reports `prompter_off` | WP15k, then device (owner) |
| Rollback (4.7) | The drill | CI, then a device (owner) |
