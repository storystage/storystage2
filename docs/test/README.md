# Manual test scripts (WP18.4)

One script per milestone gate (workplan section 5), for the checks CI can't do: real devices, real accounts, what a person sees. Each script is written by the time its gate approaches, by S1 with the session that owns the gate's work. Results go in `docs/test/results/<milestone>-<date>.md`, one file per run. Record no pupil names or other personal data.

StoryStage 1's TR1 script is in `docs/carried-over/test/TR1-manual.md`. Its checks carry over where they still apply.

| Milestone | Gate (what the owner sees) | Script | Status |
|---|---|---|---|
| M0 Foundations | Repo, CI and spec skeleton exist | [M0-foundations.md](M0-foundations.md) | ready |
| M1 Spikes | Go/no-go per spike on the reference devices | [M1-spikes.md](M1-spikes.md), with the [device-run checklist](M1-device-checklist.md) | ready for 1.2, 1.3, 1.4, 1.5, 1.7 and 1.8; 1.9 is added when it's built |
| M2 One scene, coded | In the browser: add models to a scene, code it with blocks, Rehearse it | [M2-one-scene.md](M2-one-scene.md) | written with the WP7 spec; run when WP7 (S5), WP6 (S2) and the stage's editing (S3) are in |
| M3 Productions | Several scenes in one `.storystage` file play in order with cuts and fades | [M3-productions.md](M3-productions.md) | ready |
| M4 Storyboard | A production planned in the Storyboard; frames link to code; cast placed from frames | [M4-storyboard.md](M4-storyboard.md) | ready for planning and the storyboard rule; frame links wait on WP10b, placing the cast on WP10c (S5) |
| M5 Prompter and speech | The Prompter works in the desktop app with the owner's key; voice in and out | [M5-prompter-speech.md](M5-prompter-speech.md) | ready for speak lines in the browser; the rest waits on the studio's native host in the apps, and WP13c (S7, S5) |
| M6 Distribution | Signed apps, browser version live, MP4 export | M6-distribution.md | with WP15 (S8), WP11 (S2) |
| M7 Pilot ready | Curriculum mapping, DPIA, class set-up | M7-pilot-ready.md | with WP24 (S8), D |
| M8–M11 | Pathway, AR design mode, AR for audiences, projection | one script each | after the release candidate |
| M12 Pilot complete | Pilot run, feedback triaged, editor chosen | M12-pilot.md | owner |

## Performance budgets (WP18.3)

Start-up, scene load, frame rate, memory and export speed, in CI on every pull request and on each reference device: [performance.md](performance.md).

## Gate tests in CI (WP18.2)

Each gate's path, as far as CI can follow it, is one Playwright test in `apps/studio/e2e/gates/`, run with the other end-to-end tests on every pull request. Each feature has its own tests beside its code; a gate test checks they join up into what the owner sees at the gate. A step not built yet is a `test.fixme` naming what it waits on, so it shows as skipped until then.

| Milestone | Gate test | Waits on |
|---|---|---|
| M2 One scene, coded | [m2-one-scene.e2e.ts](../../apps/studio/e2e/gates/m2-one-scene.e2e.ts): models added from Backstage › Cast by pointer and by keyboard, each one undo step; a scene coded with a block from the palette, and Rehearse runs it | Dropping a model onto the stage where the pointer is (S3, S5): by hand in the script |
| M3 Productions | [m3-productions.e2e.ts](../../apps/studio/e2e/gates/m3-productions.e2e.ts): the film plays scenes 1, 2, 3 in order after a transition changes; a copy saved through Save a copy opens again with the same running order and transitions | Nothing |
| M4 Storyboard | [m4-storyboard.e2e.ts](../../apps/studio/e2e/gates/m4-storyboard.e2e.ts): a film planned by keyboard opens its Code editor (the storyboard rule); frame 1.1 unlinked and linked again, marked in the code and Coded, and "not linked" once its block is deleted; its check leads between the tabs | Placing the cast from frames (WP10c, S5) |
| M5 Prompter and speech | [m5-prompter-speech.e2e.ts](../../apps/studio/e2e/gates/m5-prompter-speech.e2e.ts): speak lines are British by default, with American as the switch | The studio on the native host in the apps (unassigned); set-up and the Prompter panel (S7, S5); whisper and the voices bundled in the apps (S8) |

Every script ends with the built-in self-test (WP18.1), **Settings › Self-test** › **Run the self-test**, on each device it covers, and records its last line (`SELFTEST PASS` or `SELFTEST FAIL`).
