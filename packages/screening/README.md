# @storystage/screening

The Screening room (WP11.1, 11.2): the rough cut, compare with the storyboard, retake notes, and the export dialog. The studio mounts it (S5).

- **Owner:** S2
- **Workplan:** WP11 (decision 0067)
- **Spec:** `docs/spec/08-export.md`, sections 2 to 4

So far, the rough cut's logic, from `measure`'s timeline (`rough-cut.ts`):

- `segments(production, timeline)`: one per scene, numbered in running order, for the bar under the player and the running order strip;
- `timeLabel`, `sliderText` and `clock`: "0:38 / 1:12", "0:38 of 1:12", with "+" when a scene waits on the viewer;
- `sceneAt` and `currentFrame`: the scene and frame at a moment, for the player's label ("Scene 2 · Frame 2.3") and the shared place;
- `stillMoment`: the moment Compare's film still shows for a frame;
- `nudge`: the bar's keys.
