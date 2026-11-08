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
const models = modelsFromManifest(manifest, folder);
const stage = await createBabylonStage({ canvas, models, quality: 'low' });
await stage.load(setup);
stage.schedule(commands);
stage.startLive(() => stage.seek(clock.now()));

// Export: a fixed time step, on a canvas that's never on the page.
const stage = await createBabylonStage({ canvas, models, offscreen: true });
await stage.load(setup);
stage.schedule(commands);
for (let f = 0; f < frames; f++) {
  stage.seek(micros(f / fps));
  const frame = await stage.renderFrame(); // RGBA, top row first
}
```

Call `resize()` when the canvas changes size. Clicks and keys on the canvas reach `onEvent` by themselves. Without a `models` source, a scene can use only stand-ins.

**Renderer and quality (5.6).** `createBabylonStage` is async: it uses WebGPU where the device has it and WebGL2 otherwise (`renderer: 'auto'`), and `stage.renderer` says which. Pass `renderer: 'webgl2'` for the same pixels on every machine. `quality: 'low'` draws at two thirds of the canvas's size without smoothing edges, for the reference devices; `standard`, the default, draws full size. An export always draws full size. Both are fixed when the stage is made.

**Pictures (5.7).** `stage.picture(at, width, height)` draws the scene as it is at `at`, at any size up to 4096 each way, without moving the scene from its last `seek` and without firing events. It's for the Screening room's compare with the storyboard (WP11.6). No picture ever goes to the Prompter (CLAUDE.md rule 3).

**Budget.** `stage.measure()` counts the triangles the loaded scene draws, against Backstage's scene budget (`SCENE_BUDGET`, WP3.9). The budget is provisional until the reference devices have been measured (#6).

## Character machinery (5.8)

These are the parts WP4.5–4.6's commands will use. No command drives them yet; WP4c connects them to the timeline.

- **Ways round things.** `buildNavigation(timeline.navigationArea())` makes a scene's walkable area with Recast and Detour, through `recast-navigation`, which loads only when it's first asked for. `path(from, to)` gives the corners of the shortest way, or null if there isn't one. It has no graphics, so both stages find the same way.
- **Clips.** The stage blends a model's own animations itself, not through Babylon.js's scene, so a film is posed the same way at the same moment. `ObjectView.show(state, where, motion)` takes the clips:
  - `name`;
  - `time`, in seconds;
  - `weight`;
  - `loop`, which is on unless it's turned off.

  Weights under 1 leave the rest to the model's resting pose, and weights over 1 are scaled down to 1.
- **Order.** The clips come first, then each joint's own turn on top of them, then reaching, then looking.
- **Reaching** (`ik.ts`) bends a limb of three joints so that its end is at a point, with the middle joint bending towards a pole. When the point is out of reach, the limb points at it.
- **Looking** turns a joint to face a point, by no more than its limit. The limit is a fifth of a turn unless told otherwise, counted from where the clips left the joint.
- **Why not Babylon.js's own controllers?** They move a skeleton's bones, but a glTF model's bones follow their nodes, so the stage turns the nodes with its own arithmetic.
- **Not measured:** what any of this costs on the reference devices (#6).

## Humanoids (4.6)

A clip made once plays on any humanoid, as Unity's Mecanim Humanoid does.

- **Poses** (`src/humanoid/pose.ts`) are turns of the VRM 1.0 humanoid bones, each measured from a T-pose and in the axes of a model that faces +Z. A bone's own axes don't matter. `HumanoidRig` works out each model's from where its bones rest, and the hips' movement is in hips' heights, so it fits any size.
- **The shared clips** are KayKit's (Character Pack: Adventurers, by Kay Lousberg, CC0), by the owner's decision of 8 Nov 2026. There are 15 of them: standing, walking, running, sitting on a chair or the floor, lying, standing up from each, picking up, reaching out and cheering.
  - `scripts/make-clips.ts` makes `src/humanoid/kaykit-clips.ts` from any KayKit character in Backstage. Don't edit that file; make it again.
  - They're kept to a hundredth of a degree in about 170 kB, which loads only when a scene first has a humanoid in it (`loadHumanLibrary`).
- **Walking speed:** a walk's and a run's speed is measured from their feet: about 1.9 and 3.7 hips' heights a second.
- **VRM 0.x avatars face -Z** (spec 17, section 3), so the stage turns them to face +Z when it places them. It knows one from its file.
- **Rest poses:** every model so far rests in a T-pose. A model that rests in an A-pose would hold its arms too low. MakeHuman's people may need a correction for that, once they can be looked at here.
- **Not yet:** WP4c's actions use these, and none does yet.

## How it fits together

`timeline.ts` works the scene out, with no graphics: the scene at any time is a pure function of the set-up and the commands so far. `FakeStage` and `BabylonStage` both wrap it, so they agree exactly. `BabylonStage` copies the timeline's state onto Babylon.js objects on each `seek`, and nothing else moves them.

## What the contract doesn't spell out

- **Directions.** Right-handed, Y up, everything faces +Z, the camera included. Looking along +Z, +X is on the left of the picture (spec 02, Directions). Babylon.js's own cameras look along -Z in a right-handed scene, so the camera's node carries an extra half turn.
- **Vehicles.** A rider keeps its pose relative to its vehicle. `transform` is still relative to the scene. Scale isn't carried, as in Alice.
- **Targets.** A target may be a marker or a joint as well as an object. Markers aren't in `objects()`. A joint target is where the joint rests in the model, carried by its object; turning the joints above it doesn't move it, and asking a joint's size isn't done yet.
- **Sizes.** `load` gives the timeline each object's box and its joints' resting places (`Shape`). A stand-in is the same block on both stages (`STAND_IN_BOX`), and `FakeStage` gives every object that block, so the two agree.
- **The scene and the camera.** The sky, light and fog are `SCENE`'s, and only it takes `atmosphere`, `light` and `fog`; only the camera takes `lens`. `SCENE` isn't in `objects()`.
- **Good view.** `moveAndOrientTo` with `goodView` puts the camera in front of its target, a little above, at two and a half times its largest size, looking at its middle.
- **Fading.** `fade` on `SCENE` darkens the whole picture, sky included, to black and back. Loading a scene clears it. Going to another scene and crossfading are the production's playback (WP8.3).
- **Not yet:** smooth paths, folding and spreading wings, the size of a joint, and the character actions and faces in the contract (`walk` to `lookAt`, WP4c). The stage refuses them with `bad_argument`, and refuses to say how long they take.
- **Touching.** Alice's rule, in `hull.ts`: each object has a footprint and a height from its box in the scene. Proximity is the same test with a margin, so it measures the gap between two things, not between their centres.
- **Backdrops.** `backdrops.ts` holds Alice's 20 starting templates, with her numbers. Her fog value is cubed to give the density. Ground surfaces are flat colours until WP3's textures arrive.
- **Facing the camera.** A camera with no rotation and a model with no rotation both face +Z, so the camera sees the model's back. To face the camera, a model needs half a turn.
- **Events.** Each fires once, at the change: two things start or stop touching, a watched pair comes within or goes beyond its distance, a watched object comes into or leaves the picture. Nothing fires for what was already so when listening or watching starts, and rewinding fires nothing. An object faded to nothing is out of the picture.
- **Hashes.** What only the newer commands set (paint part-way through a blend, back paint, words, the lens, the sky) is in `stateHash` only once something sets it, so older scenes hash as they did.
- **Budgets.** Spike 1.2 is waiting for its device runs, so nothing here is held to a budget yet.

## Shots (4.10)

A `shot` moves the camera, over its duration, to frame its targets. Where it goes is worked out when it starts, from `SHOTS` in `timeline.ts`. The same rules should stand behind the storyboard's shot types (WP10.6) and the check against the storyboard (11.6).

- **Subject:** the box round all the targets. A marker or a joint counts as a 30 cm cube.
- **Side:** the camera looks level at the subject's front. With one target that's the way it faces. With more, it's across the line between the first two, on the side they face, or on the camera's side if they face each other.
- **How close:** each shot takes in a part of the subject's height, looking that far down from its top.

| Shot | Takes in | Looks at, down from the top | Notes |
| --- | --- | --- | --- |
| `wide` | 2.2 × its height | half way | Wide enough for 1.6 × its width |
| `medium` | 0.7 × its height | 0.3 | From the top down to the waist, with room above |
| `closeUp` | 0.38 × its height | 0.15 | Head and shoulders, with room above |
| `twoShot` | 0.7 × its height | 0.3 | Two side by side; wide enough for 1.3 × their width |
| `follow` | 1.4 × its height | 0.4 | From behind and a little above, then rides on the target |
| `overTheShoulder` | — | — | Behind and beside the first target's shoulder, looking at the second's face |

- **Distance** comes from the lens, and from a 16:9 picture for width.
- **Not done:** keeping out of the way. A shot doesn't move round something between the camera and its subject, as Cinemachine's collider would.
- **Follow** is followed from the end of the move: the camera then rides on the target, so it keeps up from there.

## Tests

`pnpm test` runs the contract suite on `NullEngine`, which can't draw. `packages/stage/e2e` runs the real stage in a browser, for pixels, and `tests/scenes/` holds the reference scenes. Look at the pictures too: a room with a yellow floor once passed every test here.
