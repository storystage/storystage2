# @storystage/check

The automatic check against the storyboard (WP11.6): what a run did, against what the storyboard planned, from the scene's state rather than pictures, in plain words. It works without the Prompter and without a network, takes no picture, and sends nothing anywhere.

- **Owner:** S2
- **Workplan:** WP11c (decision 0071)
- **Spec:** `docs/spec/08-export.md`, section 9

## Running it

`checkFrame({ production, stage, startWorker, frame })`, `checkScene({ …, scene })` and `checkFilm({ … })` play the code offscreen on the caller's hidden stage (made, prepared and disposed of by the caller), deterministic and with the runtime's `trace`, and give each frame's `CheckResult` (`basis` and `items`) for the production session's `annotate`. `signal` stops a run; `onProgress(done, total)` counts frames. `sameOrNew(previous, next)` hands back the previous result when nothing in it changed, so the frame card isn't redrawn.

## Reading it

- `frameStatus(frame, production)`: `'checked'`, `'lookAt'`, or `null` (no result, or a stale one).
- `checkState(frame, production)`: `{ stale, flags, kept }`.
- `keepFlag(production, frame, itemId, keep)`: the next production, for the learner's undoable step.
- `basisFor(production, frame)`: what a result depends on, hashed; the program's and each set-up's share are cached.
- `ITEM_ORDER`: flags, then notes, then passed.

## Inside

- `geometry.ts`: where a point lands on the picture (the camera's +X on the left, the lens in turns), on screen or not, facing, and the share of the picture's height.
- `spans.ts`: each frame's span in the film, from its links or its plan (9.3).
- `compare.ts`: the comparisons and their words (9.4, 9.5).
- `status.ts`: `basis`, status and keeping a flag (9.6).
- `runner.ts`: playing a scene and gathering each frame's state.
