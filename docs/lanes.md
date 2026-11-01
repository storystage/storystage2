# Lane log

Each session keeps its own section current. Newest entries first. One line each.

## S1 Platform and quality
- Merged:
  - 25 Oct: **Rust security advisories check** (#48): `cargo deny check advisories` in `desktop.yml` on the platforms we ship, and weekly (Mondays). Its first run found tokio 1.54.0 (RUSTSEC-2026-0384, yanked), updated to 1.54.1. Dependabot's glib alert is Linux-only, so it doesn't reach the app (`docs/github-settings.md`). CodeQL on `main` is green again without Python.
  - 25 Oct: **the Direction A design handoff** in `docs/design/direction-a/` (#49, without the Alice 3 screenshots), with the differences from the workplan listed on #49; the owner's decisions on it: age range (0030) and fonts (0031) (#50), and teacher Prompter levels (0034).
  - 22 Oct: platform upkeep: S1 sessions can push again (Claude GitHub App reinstalled for the organisation); CodeQL default setup saved without Python, which has had no source since WP0.10 and failed the `main` scan.
  - 22 Oct: **WP0.10, the one schedule file**: `tools/plan/schedule.yaml` holds every item, its estimate, basis and actual dates; `pnpm schedule` writes workplan 5a, a "Schedule items" line in each section 6 WP and the handover roster, and CI fails when they disagree. It replaces schedule.py, capsim.py and sessions.py with the same numbers.
  - 22 Oct: build halves of spikes **1.3 whisper in WebAssembly** (#43; CI: clear speech right, 644–758 MB of memory) and **1.7 the Android app** (#44; Babylon.js and Blockly run on an Android 14 emulator with 4 GB; the APK is a workflow artifact).
  - 22 Oct: **WP11a, the MP4 encoder module** (#41): `exportMp4` and `probeExport` in `@storystage/export` (H.264, AAC by default, progress, cancel, coded errors). **S2: WP11b's Screening room can build on it.**
  - 21 Oct: spike 1.2 build half, the character budget sweep (#40); the owner's decisions, Apache-2.0 licence (#37); WP18a self-test skeleton and M0, M1 scripts (#36); capacity probe (#23); classroom questions (#24); organisation settings (#38, #39).
  - 21 Oct: **the WP0.8 contracts** (#26, #27, #29–#33) and spikes **1.4, 1.5, 1.6 go; 1.8 go for video** (#25, #28, #35). Spike pages: https://storystage.github.io/storystage2/
  - 20 Oct: WP0.1–0.7 (#1, #2, #4, #5, #18, #21, #22).
- Blocked on:
  - Owner: the reference Chromebook (Acer Spin 314, N100, 4 GB, chosen) and iPad (#6) for the M1 device runs of 1.2, 1.4, 1.5 and 1.8, and the export audio choice (does the Chromebook encode AAC?).
  - S4: the Alice converter (WP3b) for the Alice half of spike 1.2.
- Next: spike 1.9 (AR) needs the devices; WP23a waits for WP5a (S3) and WP6 (S2); WP14b waits for S7. Until those land, S1 helps the M1 device runs and keeps CI healthy.

## S2 Language, runtime and Screening room
- Merged:
- Blocked on:
- Next:

## S3 Stage and Story API procedures
- Merged:
- Blocked on:
- Next:

## S4 Backstage and Productions
- Merged:
- Blocked on:
- Next:

## S5 Studio interface
- Merged:
  - 25 Oct (PR open, stacked on #75): **WP12b, the controls (12.3)**: mode tabs (a tab list, arrow keys between modes), segmented control (a radio group: Tab lands on the chosen segment), toggle, check box, radio cards, text field with its mic button (none on the key field), dialog (focus trapped, Escape closes unless it must be finished) and neutral note; a `tab` token for inactive mode tabs.
  - 25 Oct (#75, open, stacked on #71): **WP12b, fonts, icons and the first components (12.2, 12.3)**: Atkinson Hyperlegible and Bricolage Grotesque bundled from Fontsource; 41 Material Symbols Rounded icons as inline SVG (generated, no icon font); React Aria Components; `ThemeRoot`, `Icon`, `Button` (all Direction A variants), `StatusChip`, `AiBadge`, each tested for role, name, keyboard and focus; a test that `styles.css` uses tokens only.
  - 25 Oct: the owner approved the light theme as drawn, with the darker ok and stop (decision 0038).
  - 25 Oct (#71, open): **WP12b, `packages/ui` with tokens and strings (12.2, 12.4)**: `@storystage/ui`, the new design-system package (07-ux §2.6): role-named colour tokens for both themes, type, spacing, radius and sizes; a contrast test over every text and outline pairing in both themes (it caught three, now fixed: light `ok` and `stop` darkened); the strings helper (`{name}` values, plurals) with `en-GB.json`, and a test that scans every package's strings for rule 9's banned words. **S2, S3, S6:** use `@storystage/ui` tokens and strings; components follow.
  - 25 Oct (#63): **WP12b spec**, `07-ux.md` §2–5; owner decisions 0035 (zoom and text size), 0036 (English (UK) only), 0037 (theme setting).
  - 25 Oct (#62): **WP12a, the light theme drawn (12.1, decision 0032)**: every screen in `sizes/` opens in the light theme with `?theme=light`; PNGs in `screenshots/light/`; the light token values tabled in the handoff README. Text and outlines checked against WCAG AA in both themes.
  - 25 Oct (#58): **WP12a, mock-ups at three sizes (12.1)**: the screens 12.1 names at laptop (1536 × 864) and iPad (1180 × 820) in `docs/design/direction-a/sizes/`, a new screen 02c (Code editor closed until the scene is storyboarded, 10.8), the handoff README reconciled with `docs/decisions/`, `docs/spec/07-ux.md` §1 (screen sizes), and decisions 0032 (light theme) and 0033 (narrow windows). 12.1 stays unticked until the owner approves it.
- Blocked on:
  - Owner: approving the mock-ups (12.1), which waits for the teacher interviews (16.7) and the first use cases (16.6).
- Next: WP12b continued: the Prompter plan step and the frame card (12.3, against screen 14); the strings and screen 14 rebuilt as a component page; then axe in Playwright (12.5).

## S6 Story API spec, Tile editor and Alice import
- Merged:
- Blocked on:
- Next:

## S7 Prompter and speech
- Merged:
  - 31 Oct: **13.1** the Prompter spec (#89) and **13.8** the system prompt (#93). The owner has said S7 merges WP13a pull requests when green.
- Waiting for review: **the transport contract** gains `betas` (#91): **S8 to review**, as WP15.2 must send them. **13.7** the fake Claude server and the evaluation set, 85 requests (#95), stacked on #91. **S8: the fake server is ready for the Rust transport's tests** once it merges. 13.7's box stays open until there are real recordings and a score.
- Blocked on:
  - Owner: the go on spike 1.3, which needs the device runs (#6), for WP14a.
  - Owner: reading the evaluation set before the first paid live run.
  - S2 (WP2), S6 (WP4a) and S8 (WP15k) for WP13b. Spec 04, section 11 lists what each needs to settle.
- For D: the owner confirmed no picture is ever sent to the Prompter (31 Oct). Workplan 17.3 still lists scene pictures in the DPIA's scope, so please correct it; S7 has corrected 13.3.
- Next: WP14a when 1.3 is go; WP13b when its three dependencies land.

## S8 Apps, security and class set-up
- Merged:
  - 1 Nov (#86): **spec 05 §3–5**: policy, managed configuration, updates and channels, written before the code.
  - 1 Nov (#87): **the policy crate**: every key, the four levels, fail-closed reading, and on Windows trust by file owner, and the folder asked of the system rather than `%PROGRAMDATA%`.
  - 1 Nov (#104): **WP0.9, the threat model** (`docs/spec/15-security.md`). **S4, S6:** 8.4, 9.1 and 10.4 can start now. Section 3 has the import rules, with one archive reader in `packages/production`.
- Open, all checks passing, to merge in this order (decision 0048):
  - #88 **`@storystage/host`**: the host interface (decision 0028) with the policy in force. **S5: please review; this is what the studio reads.** #98, #99 and #100 stack on it.
  - #98 **managed configuration**: iPad and Android, through the same checks as the file. A new `ios (rust)` job compiles for iPad with no Apple account.
  - #99 **updates**: channels, pins, staged rollout, rollback, the `Release` and `Channel` workflows, and universal macOS builds.
  - #100 **the installed version and `tauriHost`**, for About. **S5: please review.**
  - #103 **decisions 0047 and 0048**, separate from the stack. It waits for the owner.
- Blocked on:
  - S5: reviewing #88 and #100.
  - Owner: the human security review before the pilot.
  - Owner: generating the updater key (0047). Until then `Release` and `Channel` have never run, and the rollback drill (15.7) can't be done.
  - Owner: a real push of a setting through managed Google Play and through iPad device management (#98). The iPad code is compiled but has never run.
- For D: decision 0047 makes GitHub a named host in the DPIA (17.3) and the privacy notice (17.4).
- Next: **WP15k**, the key store, transport and policy enforcement point (15.2). It takes up spec 04 §1.8 and section 11 for S7, and spec 05 §1 and §2.
- Working notes: no Cargo on the PC, so `Cargo.lock` changes come from a temporary CI workflow. Worktree `C:\dev\storystage2-s8` is a sparse checkout, because of the disk.

## D Documents
- Merged:
- Blocked on:
- Next:
