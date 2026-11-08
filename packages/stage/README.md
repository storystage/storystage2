# @storystage/stage

Babylon.js scene, model loading, joints, cameras and markers, picking, transforms, offscreen render.

- **Owner:** S3
- **Workplan:** WP5
- **Status:** WP5a built (5.1 to 5.5). The frame rate on the reference devices waits for #6.

## Entries

| Import | What it gives | Loads Babylon.js? |
| --- | --- | --- |
| `@storystage/stage` | The `Stage` contract, the backdrop list | No |
| `@storystage/stage/babylon` | `createBabylonStage`, for the studio and export | Yes |
| `@storystage/stage/testing` | `FakeStage` and the contract's test suite | No |

## Using it

Code against the `Stage` type. Only what makes the stage needs `@storystage/stage/babylon`, and that's best imported with `import()`, so that a page with no scene doesn't load Babylon.js.

```ts
// Rehearse: draw every frame, and seek to the clock first.
const stage = createBabylonStage({ canvas, models: modelsFromManifest(manifest, folder) });
await stage.load(setup);
stage.schedule(commands);
stage.startLive(() => stage.seek(clock.now()));

// Export: a fixed time step, on a canvas that's never on the page.
const stage = createBabylonStage({ canvas, models, offscreen: true });
await stage.load(setup);
stage.schedule(commands);
for (let f = 0; f < frames; f++) {
  stage.seek(micros(f / fps));
  const frame = await stage.renderFrame(); // RGBA, top row first
}
```

Call `resize()` when the canvas changes size. Clicks and keys on the canvas reach `onEvent` by themselves. Without a `models` source, a scene can use only stand-ins.

## How it fits together

`timeline.ts` works the scene out, with no graphics: the scene at any time is a pure function of the set-up and the commands so far. `FakeStage` and `BabylonStage` both wrap it, so they agree exactly. `BabylonStage` copies the timeline's state onto Babylon.js objects on each `seek`, and nothing else moves them.

## What the contract doesn't spell out

- **Directions.** Right-handed, Y up, everything faces +Z, the camera included. Looking along +Z, +X is on the left of the picture (spec 02, Directions). Babylon.js's own cameras look along -Z in a right-handed scene, so the camera's node carries an extra half turn.
- **Vehicles.** A rider keeps its pose relative to its vehicle. `transform` is still relative to the scene. Scale isn't carried, as in Alice.
- **Targets.** A target may be a marker or a joint as well as an object. Markers aren't in `objects()`. A joint target is where the joint rests in the model, carried by its object; turning the joints above it doesn't move it, and asking a joint's size isn't done yet.
- **Sizes.** `load` gives the timeline each object's box and its joints' resting places (`Shape`). A stand-in is the same block on both stages (`STAND_IN_BOX`), and `FakeStage` gives every object that block, so the two agree.
- **The scene and the camera.** The sky, light and fog are `SCENE`'s, and only it takes `atmosphere`, `light` and `fog`; only the camera takes `lens`. `SCENE` isn't in `objects()`.
- **Good view.** `moveAndOrientTo` with `goodView` puts the camera in front of its target, a little above, at two and a half times its largest size, looking at its middle.
- **Not yet:** smooth paths, folding and spreading wings, and the size of a joint. The stage refuses them with `bad_argument`.
- **Touching.** Alice's rule, in `hull.ts`: each object has a footprint and a height from its box in the scene. Proximity is the same test with a margin, so it measures the gap between two things, not between their centres.
- **Backdrops.** `backdrops.ts` holds Alice's 20 starting templates, with her numbers. Her fog value is cubed to give the density. Ground surfaces are flat colours until WP3's textures arrive.
- **Facing the camera.** A camera with no rotation and a model with no rotation both face +Z, so the camera sees the model's back. To face the camera, a model needs half a turn.
- **Events.** Each fires once, at the change: two things start or stop touching, a watched pair comes within or goes beyond its distance, a watched object comes into or leaves the picture. Nothing fires for what was already so when listening or watching starts, and rewinding fires nothing. An object faded to nothing is out of the picture.
- **Hashes.** What only the newer commands set (paint part-way through a blend, back paint, words, the lens, the sky) is in `stateHash` only once something sets it, so older scenes hash as they did.
- **Budgets.** Spike 1.2 is waiting for its device runs, so nothing here is held to a budget yet.

## Tests

`pnpm test` runs the contract suite on `NullEngine`, which can't draw. `packages/stage/e2e` runs the real stage in a browser, for pixels, and `tests/scenes/` holds the reference scenes. Look at the pictures too: a room with a yellow floor once passed every test here.
