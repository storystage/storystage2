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
- Blocked on:
- Next:

## S8 Apps, security and class set-up
- Merged:
- Blocked on:
- Next:

## D Documents
- Merged:
- Open for the owner (25 Oct, **WP17a** drafted, every item needs-owner; boxes stay open until the owner acts):
  - #51 **17.1, 17.7** the CMU and EA email, the correspondence log, and the `docs/legal/` index with the permission-record format the Backstage manifest points to. It now also asks StoryStage 1's never-sent WP15.1 question. **Owner: send it.**
  - #52 **17.5** Anthropic's terms for under-18s: allowed with safeguards; the key holder is Anthropic's customer; ten requirements. Owner decided: parents may hold the key (Anthropic to confirm); apps in the UK and US stores, so R10 adds a US check (COPPA, store kids rules). **S7, S8:** R1–R10 for specs 04 and 05 and the store builds. **Owner: send the Anthropic question.**
  - #53 **17.6** trade mark brief: Scholastic's 2010 "Story Stage" CD-ROMs (UK, ages 5–7) are the main question in the UK, and a STORY STAGE application in the US. **Owner: register search, then an attorney, before M6.**
  - #54 **17.8** storybook characters: a rights check for about 30 characters and groups; leaves out Pooh, Peter Rabbit and Peter Pan. **S4:** WP3d waits for the owner's decisions.
  - #55 **17.9** the commissioning contract template; the owner signs as Commissioner, trading as StoryStage. **Owner: solicitor's review.**
- Open for review (25 Oct, **WP16a** done: 16.1–16.5, merge in this order):
  - #64 **16.1** England, plus the method, the four nations' stages against ages 6–13, a reform watch (England 2028, Scotland's new framework from Aug 2028, NI Curriculum 2028), and the feature, activity and arc-template ids.
  - #65 **16.2** Scotland: computing science benchmarks are the strongest fit of any nation; films count as texts.
  - #66 **16.3** Wales: film and digital media is an expressive arts discipline; the DCF's digital rights element matches Backstage's licences.
  - #67 **16.4** Northern Ireland, from the statutory minimum content: Using ICT names coding and film and animation; KS3 English with Media Education.
  - #68 **16.5** the four nations together: 156 statements, 95 strong; the storyboard check serves 20 statements, all strong; no statement needs the Prompter. Owner decided: ages 6–13 confirmed; Welsh interface in release 1.1 (**S5:** keep all wording in one place); `docs/curriculum/` under CC BY 4.0. **S2:** the storyboard check (WP11.6) carries the most strong curriculum fits.
- Reviewing: #60 (S4's licence audit, in `docs/legal/`): its 435 Alice models include 95 from StoryStage 1's non-free Sims-engine tree; the CMU email counts 343. To reconcile before the owner sends the email.
- Open (25 Oct): #70 decision records 0039 (ages 6–13 confirmed), 0040 (Welsh first, release 1.1), 0041 (`docs/curriculum/` CC BY 4.0), 0043 (UK and US app stores), 0044 (mock-ups approved). Renumbered after main took 0038 and #74 claimed 0042. **S5:** `docs/design/README.md` still lists approving the mock-ups as open.
- Open for review (25 Oct, **WP16b** drafted, 16.6):
  - #72 curriculum arc templates. Owner chose: ship tale, myth, scene and explain; hold recount. **S4/S5:** proposed JSON for WP10.2; store part ids in `arc.parts`/`arcPart`, labels in translation files.
  - #73 eight classroom use cases with lesson outlines, ages 6–13, all four nations, all working with the Prompter off. **Owner:** review templates and use cases with teachers.
  - Corrected in #64, #65, #67, #72: recording a learner's own voice is WP14.4 (release 1.2), not the first release.
- Open for review (25 Oct, **WP19a** drafted, mock-ups approved by the owner: 0044 in #70):
  - #79 **19.1** website page drafts in `website/`: home, downloads per device and the browser version, getting started (learner, adult with a Claude key, class set-up, the school lock with every 15.3 policy key), privacy at a glance (draft until 17.4), credits. Rules for the site itself: no analytics, cookies or third-party loads. Owner decided (0045, 0046): text CC BY 4.0; the website is **storystage.org** on the existing Bluehost WordPress site via WPVibe; the browser version is **app.storystage.org** (its own origin); storystage.org.uk is unregistered and not used. **Owner:** contact address; connect storystage.org to WPVibe and run the README's pre-publish check before publishing. **S8:** the browser version's origin for the threat model. **S1:** 15.6 and 19.1 wording changed in #70.
  - #81 **19.2** the teacher guide, ten pages in `website/teacher-guide/`, with a home for the 24.7 journey pages. **Owner:** review with a pilot teacher.
  - Both mark what isn't decided (24.2, 24.3, 17.8, 17.1, 19.4–19.6, signed builds) rather than promise it.
- Blocked on: the owner's WP17a actions (the CMU and Anthropic emails) before WP17b's DPIA can cite their answers; WP17b also waits for WP13b and WP14a (S7).
- Next: **WP17b**, the DPIA and privacy notice (17.3, 17.4), when S7's WP13b and WP14a land; meanwhile the owner's reviews of WP17a, WP16b and WP19a.
