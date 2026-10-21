# M0 Foundations: manual test script

**Gate:** the repository, CI and spec skeleton exist (WP0). **Who:** the owner, on their Windows PC; a Mac if one is to hand. **About 30 minutes.** Results: `docs/test/results/M0-<date>.md`.

## A. The repository

| # | Do | Expect | ✓ |
|---|---|---|---|
| A1 | Open https://github.com/storystage/storystage2. | `CLAUDE.md`, `docs/`, `handover/`, `apps/`, `packages/`, `tools/` at the top. | |
| A2 | Settings → Rules → `main`. | Pull request required; checks `check` and `e2e` required; squash only; no force pushes or deletion. Decide whether you want yourself as a bypass actor (`docs/github-settings.md`, item 5). | |
| A3 | Settings → Code security. | Secret scanning and push protection on; Dependabot alerts on; private vulnerability reporting on. | |
| A4 | Settings → Actions → General. | "Allow select actions" with SHA pinning required. | |
| A5 | Pull request #3 (closed). | `check` failed and the merge box said it was blocked: a failing test can't merge. | |
| A6 | Organisation settings, from `docs/github-settings.md`: two-factor authentication, defaults for new repositories, Actions policy, who may create public repositories. | Each one done, or a note of why not. | |

## B. The empty app (WP0 done-when: "both desktop builds produce an empty Tauri window")

| # | Do | Expect | ✓ |
|---|---|---|---|
| B1 | Actions → Desktop → the latest run on `main` → Artifacts → download `storystage2-windows`. Unzip it. | An `.msi` and a `-setup.exe`. | |
| B2 | Run the `-setup.exe`. Windows SmartScreen will warn, because the app isn't signed yet (WP15.4): choose **More info → Run anyway**. | It installs "StoryStage 2". | |
| B3 | Start StoryStage 2 from the Start menu. Time it. | A window titled "StoryStage 2" showing the three tab names: Storyboard, Production stage, Screening room. Start-up time: ______ s. | |
| B4 | Task Manager → Details → the StoryStage 2 process (`StoryStage 2.exe` or `storystage-desktop.exe`) and its `msedgewebview2.exe` processes. | Memory: ______ MB in total. | |
| B5 | With the app open, in PowerShell: `Get-Process -Name 'StoryStage*','storystage*' -ErrorAction SilentlyContinue \| ForEach-Object { Get-NetTCPConnection -OwningProcess $_.Id -ErrorAction SilentlyContinue }` | No connections (the empty app talks to nothing). | |
| B6 | Uninstall it (Settings → Apps). | It goes, with nothing left in the Start menu. | |
| B7 | On a Mac, if one is to hand: download `storystage2-macos`, open the `.dmg`, and right-click → Open the app (it isn't notarised yet). | The same window. | |
| B8 | Android, if a device is to hand: download `storystage2-android` and install the `.apk` (allow installs from unknown sources for this one file). | The same tab names, on the device. Device: ______ | |

## C. The documents

| # | Do | Expect | ✓ |
|---|---|---|---|
| C1 | Read `docs/spec/00-architecture.md` section 5, "Where the key lives". | It matches what you decided. | |
| C2 | Skim `docs/decisions/README.md`. | Every row of workplan section 2 is there. | |
| C3 | Open `NOTICE`. | A list of packages with licences; nothing GPL in the "Linked into the app" section. | |

## Record

Date, who ran it, the device and Windows version, the start-up time and memory, and anything that surprised you.
