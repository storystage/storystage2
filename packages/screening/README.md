# @storystage/screening

The Screening room (WP11.1, 11.2): the rough cut, compare with the storyboard, retake notes, and the export dialog. The studio mounts it (S5).

- **Owner:** S2
- **Workplan:** WP11 (decision 0067)
- **Spec:** `docs/spec/08-export.md`, sections 2 to 4

**`RoughCut`** is the rough cut's screen (spec 08 section 2): the player, the time, the bar, the running order strip and errors. It's controlled: the host gives it the time, whether it's playing, the stage's picture and the captions, and it calls back to play, seek, move a scene (a `SceneStep`, one undo step through the session), open a block on the Production stage, and share the current place. Import `@storystage/screening/styles.css` once.

**`ScreeningPlayer`** plays it. `prepare(signal)` measures the film on a hidden stage that it makes with `measureStage()` and disposes of when done, and a cancelled measure stops at once. `play`, `pause` and `seek(t)` drive the shown stage: a seek starts the driver from the scene at `t` and fast-forwards to it. Call `tick()` on every animation frame and draw `RoughCut` from `state` (`subscribe` says when it changes). `dispose()` ends every worker it started; the shown stage is the host's.

Its logic, from `measure`'s timeline (`rough-cut.ts`):

- `segments(production, timeline)`: one per scene, numbered in running order, for the bar under the player and the running order strip;
- `timeLabel`, `sliderText` and `clock`: "0:38 / 1:12", "0:38 of 1:12", with "+" when a scene waits on the viewer;
- `sceneAt` and `currentFrame`: the scene and frame at a moment, for the player's label ("Scene 2 · Frame 2.3") and the shared place;
- `stillMoment`: the moment Compare's film still shows for a frame;
- `nudge`: the bar's keys.
