# @storystage/playback

Plays a production on the page: the runtime worker, the stage and the production's player. Rehearse (WP7.4), the Screening room (WP11.1) and the export (WP11.3) all use it.

- **Owner:** S2
- **Workplan:** WP6.4, WP11 (decision 0066)
- **Spec:** `docs/spec/08-export.md`, section 1

`Playback` is the driver. Make one with a production, a stage and a port to the runtime worker, then:

- `start()` loads the first scene;
- `frame(t)` moves the film to time `t`, every frame live or once per frame when exporting;
- `event(e)` sends a click or a key on;
- `stop()` stops, and puts the scene's set-up back;
- `on(listener)` tells you what happens: a scene starting, the running blocks, finished, an error, the end.

`fastForward` runs ahead to a time or a block, drawing nothing. `LiveClock` gives the film's time for live play, with pause and speed. The worker itself is `packages/runtime/src/worker.ts`.
