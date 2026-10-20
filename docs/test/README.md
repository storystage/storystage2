# Manual test scripts (WP18.4)

One script per milestone gate (workplan section 5), for the checks CI can't do: real devices, real accounts, what a person sees. Each script is written by the time its gate approaches, by S1 with the session that owns the gate's work. Results go in `docs/test/results/<milestone>-<date>.md`, one file per run. Record no pupil names or other personal data.

StoryStage 1's TR1 script is in `docs/carried-over/test/TR1-manual.md`. Its checks carry over where they still apply.

| Milestone | Gate (what the owner sees) | Script | Status |
|---|---|---|---|
| M0 Foundations | Repo, CI and spec skeleton exist | [M0-foundations.md](M0-foundations.md) | ready |
| M1 Spikes | Go/no-go per spike on the reference devices | [M1-spikes.md](M1-spikes.md) | ready for the spikes built so far (1.4, 1.5, 1.8); 1.2, 1.3, 1.7 and 1.9 are added as they're built |
| M2 One scene, coded | In the browser: add models to a scene, code it with blocks, Rehearse it | M2-one-scene.md | with WP7 (S5, S6) |
| M3 Productions | Several scenes in one `.storystage` file play in order with cuts and fades | M3-productions.md | with WP8 (S4) |
| M4 Storyboard | A production planned in the Storyboard; frames link to code; cast placed from frames | M4-storyboard.md | with WP10 (S5) |
| M5 Prompter and speech | The Prompter works in the desktop app with the owner's key; voice in and out | M5-prompter-speech.md | with WP13, WP14 (S7) |
| M6 Distribution | Signed apps, browser version live, MP4 export | M6-distribution.md | with WP15 (S8), WP11 (S2) |
| M7 Pilot ready | Curriculum mapping, DPIA, class set-up | M7-pilot-ready.md | with WP24 (S8), D |
| M8–M11 | Pathway, AR design mode, AR for audiences, projection | one script each | after the release candidate |
| M12 Pilot complete | Pilot run, feedback triaged, editor chosen | M12-pilot.md | owner |

Every script ends with the built-in self-test (WP18.1) on each device it covers, and records its last line (`SELFTEST PASS` or `SELFTEST FAIL`).
