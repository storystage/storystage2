# @storystage/stage

Babylon.js scene, model loading, joints, cameras and markers, picking, transforms, offscreen render.

- **Owner:** S3
- **Workplan:** WP5
- **Status:** WP5a in progress

## Entries

| Import | What it gives | Loads Babylon.js? |
| --- | --- | --- |
| `@storystage/stage` | The `Stage` contract, the backdrop list | No |
| `@storystage/stage/babylon` | `createBabylonStage`, for the studio and export | Yes |
| `@storystage/stage/testing` | `FakeStage` and the contract's test suite | No |

## How it fits together

`timeline.ts` works the scene out, with no graphics: the scene at any time is a pure function of the set-up and the commands so far. `FakeStage` and `BabylonStage` both wrap it, so they agree exactly. `BabylonStage` copies the timeline's state onto Babylon.js objects on each `seek`, and nothing else moves them.

## What the contract doesn't spell out

- **Directions.** Right-handed, Y up, everything faces +Z, the camera included. Looking along +Z, +X is on the left of the picture (spec 02, Directions). Babylon.js's own cameras look along -Z in a right-handed scene, so the camera's node carries an extra half turn.
- **Vehicles.** A rider keeps its pose relative to its vehicle. `transform` is still relative to the scene. Scale isn't carried, as in Alice.
- **Targets.** `moveTo`, `turnToFace` and `asSeenBy` may name a marker as well as an object. Markers aren't in `objects()`.
- **Touching.** Alice's rule, in `hull.ts`: each object has a footprint and a height from its box in the scene. Proximity is the same test with a margin, so it measures the gap between two things, not between their centres.
- **Backdrops.** `backdrops.ts` holds Alice's 20 starting templates, with her numbers. Her fog value is cubed to give the density. Ground surfaces are flat colours until WP3's textures arrive.
- **Budgets.** Spike 1.2 is waiting for its device runs, so nothing here is held to a budget yet.
