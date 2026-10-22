# StoryStage 2 handover pack

Everything Claude Code needs to build StoryStage 2, split so that parallel sessions can each work from a short brief.

## What's in the pack

| File | Put it in the repository at | What it is |
|---|---|---|
| `CLAUDE.md` | repository root | Standing rules every session reads first |
| `docs/WORKPLAN.md` | `docs/WORKPLAN.md` | The full workplan: 26 work packages, dependencies, done-when tests. The source of truth |
| `docs/design.md` | `docs/design.md` | The design doc "StoryStage 2: the next generation", exported from Claude Docs |
| `docs/decisions.md` | `docs/decisions.md` | What is settled, and what the owner still has to decide |
| `docs/spec/10-crosswalk.md` | `docs/spec/10-crosswalk.md` | Joint and behaviour crosswalk (Alice, VRM, H-Anim, BML, X3D, engines) |
| `docs/reviews/` | `docs/reviews/` | The two board reviews of 18 Oct 2026, for background |
| `docs/lanes.md` | `docs/lanes.md` | The lane log each session keeps current |
| `tools/plan/` | `tools/plan/` | `schedule.yaml` (every item: dependencies, estimate, actual dates; the session roster), and the code that makes workplan 5a and this roster from it (`pnpm schedule`) |
| `docs/slides/` | `docs/slides/` | The architecture deck and the one-slide Gantt chart |
| `handover/` | `handover/` | This file, one brief per session, the owner's brief and all kickoff prompts |

## How to start

1. Create the repository `storystage/storystage2` and commit the pack as laid out above.
2. Start **S1** with the first-session prompt from the workplan (section 11), or with its kickoff prompt in `handover/PROMPTS.md`. S1 sets up the repository, CI and the WP0.8 contracts that every other session codes against.
3. Start the other sessions on the week shown below, once what they need has merged. Sessions that start on day one (S4, S5, D) begin with work that needs nothing from WP0.
4. Review critical-path pull requests first (they are labelled `critical`).
5. Do the owner tasks in `handover/OWNER.md` on time; several start on day one.

## The sessions

Eight code sessions plus one documents session. Each owns its own packages, so sessions rarely touch the same files.
<!-- schedule:roster-summary -->
With this split the schedule matches the workplan: **release candidate week 18.5 (26 Feb 2027), pilot ends week 24.5 (9 Apr 2027)**, later strands done by week 29.5 (13 May 2027).
<!-- /schedule:roster-summary -->

<!-- schedule:roster -->

| Session | Area | Starts | Items before the release candidate | After it | Critical-path items |
|---|---|---|---|---|---|
| [S1](S1-platform-quality.md) | Platform and quality | wk 0 | WP0 → WP1 → WP18a → WP11a → WP23a → WP14b → WP18b | WP21, WP22b, WP22c | WP0, WP1, WP18b |
| [S2](S2-language-runtime-screening.md) | Language, runtime and Screening room | wk 1.5 | WP2 → WP8f → WP6 → WP11b → WP11c | WP20 | WP11c |
| [S3](S3-stage-story-api.md) | Stage and Story API procedures | wk 4.5 | WP5a → WP4b → WP5b → WP4c | WP23b, WP23d | WP5a, WP4b |
| [S4](S4-backstage-productions.md) | Backstage and Productions | wk 0 | WP3a → WP10s → WP3b → WP3c → WP8 → WP3i | WP22a | — |
| [S5](S5-studio-interface.md) | Studio interface | wk 0 | WP12a → WP12b → WP10a → WP7 → WP10b → WP10c | WP23c | WP7, WP10b |
| [S6](S6-story-api-spec-tiles-import.md) | Story API spec, Tile editor and Alice import | wk 1.5 | WP4a → WP4d → WP7c → WP9a → WP9b → WP7t | — | — |
| [S7](S7-prompter-speech.md) | Prompter and speech | wk 1.5 | WP13a → WP14a → WP13b → WP13c | — | WP13c |
| [S8](S8-apps-security-class-setup.md) | Apps, security and class set-up | wk 1.5 | WP15a → WP0s → WP15k → WP24a → WP15b → WP24b | — | — |
| [D](D-documents.md) | Documents: curriculum, legal, privacy, website | wk 0 | WP17a → WP16a → WP16b → WP19a → WP17b | — | — |

<!-- /schedule:roster -->

The critical path runs across sessions: S1 (WP0, WP1) → S3 (WP5a, WP4b) → S5 (WP7, WP10b) with S7 (WP13c) and S2 (WP11c) → S1 (WP18b) → release candidate → owner (WP19 pilot).

**If you can review fewer than eight sessions,** pause S6 (Tile editor) first, then fold D into this project chat; the workplan's section 5a shows what each cap costs.

Owner-only items (no session): WP1.1 (Choose reference devices (1.1)), WP1g (Classroom ground truth: TR1 lessons, school IT managers (1.11)), WP3d (Storybook cast commissioned and delivered (3.6)), WP19 (Pilot in schools (19.3, 19.4)). See `OWNER.md`.
