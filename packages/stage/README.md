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

**Renderer and quality (5.6).** `createBabylonStage` is async: it uses WebGPU where the device has it and WebGL2 otherwise (`renderer: 'auto'`), and `stage.renderer` says which. Pass `renderer: 'webgl2'` for the same pixels on every machine. `quality: 'low'` draws at two thirds of the canvas's size without smoothing edges, for the reference devices; `standard`, the default, draws full size. An export always draws full size. **An export's frames are the same every time, on any GPU:** a GPU's multisampled edges aren't exactly repeatable (one shade, at a few edge pixels, on a GeForce RTX 2060), so an offscreen stage draws at twice the width and height with no multisampling, and `renderFrame` averages each 2 by 2 block in whole numbers (the owner's choice of 10 Nov 2026). It costs about four times the drawing, for exports only. `picture` is drawn the same way, unless that would be bigger than the GPU allows. Frames come back top row first and red first on both renderers. Both are fixed when the stage is made.

**Pictures (5.7).** `stage.picture(at, width, height)` draws the scene as it is at `at`, at any size up to 4096 each way, without moving the scene from its last `seek` and without firing events. It's for the Screening room's compare with the storyboard (WP11.6). No picture ever goes to the Prompter (CLAUDE.md rule 3).

**Budget.** `stage.measure()` counts the triangles the loaded scene draws, against Backstage's scene budget (`SCENE_BUDGET`, WP3.9). The budget is provisional until the reference devices have been measured (#6).

## Character machinery (5.8)

These are the parts WP4.5–4.6's commands use ("Character actions", below).

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
- **Costs:** measured on the owner's PC; the reference devices are still to come (#6). See "What characters cost", below.

## Humanoids (4.6)

A clip made once plays on any humanoid, as Unity's Mecanim Humanoid does.

- **Poses** (`src/humanoid/pose.ts`) are turns of the VRM 1.0 humanoid bones, each measured from a T-pose and in the axes of a model that faces +Z. A bone's own axes don't matter. `HumanoidRig` works out each model's from where its bones rest, and the hips' movement is in hips' heights, so it fits any size.
- **The shared clips** are KayKit's (Character Pack: Adventurers, by Kay Lousberg, CC0), by the owner's decision of 8 Nov 2026. There are 15 of them: standing, walking, running, sitting on a chair or the floor, lying, standing up from each, picking up, reaching out and cheering.
  - `scripts/make-clips.ts` makes `src/humanoid/kaykit-clips.ts` from any KayKit character in Backstage. Don't edit that file; make it again.
  - They're kept to a hundredth of a degree in about 170 kB, which loads only when a scene first has a humanoid in it (`loadHumanLibrary`).
- **Walking speed:** a walk's and a run's speed is measured from their feet: about 1.9 and 3.7 hips' heights a second.
- **VRM 0.x avatars face -Z** (spec 17, section 3), so the stage turns them to face +Z when it places them. It knows one from its file.
- **Rest poses:** a pose is measured from a T-pose, but not every model rests in one. MakeHuman's people rest in an A-pose, their arms 48° below level and their legs a little apart. So the stage works out, from where a model's joints rest, the turn that sets each arm and leg bone straight as a T-pose has it (`humanoid/rest.ts`); hands, feet and fingers turn with them. The rig and the body both use it, so a model posed from a T-pose looks the same whatever it rests in. KayKit's and 100Avatars' models need none.
- **The gestures and the fall** are written in code (`humanoid/gestures.ts`): wave, nod, shrug, clap and point, and a fall onto the back that ends as KayKit's lying begins. A gesture turns only the bones it names, so it plays over whatever the legs are doing. The wave is in front of the shoulder, so it shows on a character whose head is wider than its arms are long, as KayKit's are.

## Character actions (4.5, 4.6)

The contract's `walk`, `enter`, `posture`, `reach`, `pickUp`, `putDown`, `clip`, `gesture`, `expression` and `lookAt` (`actions.ts`). Each is worked out once, from the scene as it starts, like every other command, so both stages agree and a film is the same every time.

- **Their own time.** `naturalDuration` says how long an action takes at its own pace. The Story API's blocks ask it, then send the command with that duration. Another duration stretches or squeezes the action.
- **A body.** A model whose joints include a humanoid's (`Body.of`) has a body. A stand-in has none, so it moves where an action takes it, but no limb moves.
  - Its pose is its resting clip (standing, sitting, sitting on the floor or lying), with the clips of the actions going on laid over it, kept on the ground, then its hands and head turned to what they reach for and look at (`bodyPose`).
  - A body stands at rest from the start, with KayKit's `idle`.
- **Walking.** A walk goes the shortest way round what's in the way where things are when it starts (5.8's walkable area, made again only when something that stays put has moved). Something being carried isn't in the way.
  - To a thing, it stops a step (0.35 m) from its box, facing it; to a marker, on it.
  - Past an edge, it ends 1.5 m out of the picture, as the camera sees it when the walk starts: `back` is 15 m further away, `front` is behind the camera. `enter` is the same, the other way.
  - Its legs go at the speed it moves: the walk and run clips are played by the distance gone, and blended by speed, so a walk that starts and ends gently doesn't slide.
  - A model without a body walks at 1.2 m a second and runs at 3.
- **Sitting** on something puts the hips on its seat. The stage doesn't know where a seat is, so it guesses: on top of something up to 0.7 m tall, otherwise 45% of the way up, as a chair's is. A stand-in block is solid, so a sitter sits inside it. Standing up leaves it in front of the seat.
- **Lying and falling** end lying on the back; standing up from either uses KayKit's.
- **Reaching** turns the nearer hand's arm to put the hand on the nearest point of the target, or as near as it gets. `touch` goes there and back; `stay` keeps it there until the next posture, reach or `pose`.
- **Holding.** Picking up reaches the thing, then it rides its holder, as on a vehicle, in front of its chest with the hand on it. `vehicle` says who's holding it. Putting it down puts it on the ground in front.
- **Looking** turns the neck and head, half each, to face the target, by at most a fifth of a turn. Then a model's eyes, if it has eye bones (as VRMs made in VRoid do), turn the rest of the way, by at most 0.07 of a turn. It follows the target until the next `lookAt`; `null` stops looking. None of the shipped people has eye bones yet, so eyes show on imported avatars.
- **Faces** are a VRM's own (`faces.ts`): VRM 0.x's `joy`, `sorrow`, `angry`, `fun` and `blink` and VRM 1.0's presets, by their Story API names. An expression stays until the next, and the old face fades out as the new one comes in, over the block's duration. `neutral` is a plain face: the old one fades and nothing comes. `blink` shuts and opens the eyes. A model without that face shows no change (owner's decision of 8 Nov 2026), except surprised: VRM 0.x has no preset for it, so a model without its own is surprised with its open mouth, its `O` viseme (VRM 1.0's `oh`), all the way. Surprised from the open mouth is the owner's choice (19 Nov). A surprised humanoid also tips its head back about 9° as the face comes and goes, so it reads on 100Avatars' small mouths, which barely show an `O` (S3, as S4 suggested). A VRM 1.0 face can also shift a surface's picture (`textureTransformBinds`): Seed-san's forearm robot shows each face on its screen (the owner's choice, 19 Nov). A face its model calls all or nothing (`isBinary`) shows in full once over half way in, and not at all before. As a scene loads, the stage draws every face shape a little and then none, unseen, since Babylon.js gets a face shape right only from its second drawing: otherwise a face in a film's first frame showed none.
- **Clips.** `play animation` plays the model's own clip of that name, or for a biped, a shared clip. Anything else is refused.
- **Not yet:** visemes for speaking (waiting on S1's speak line design, WP14.3); turning the eyes as well as the head; and a walk round other characters, which aren't in the way.


### Animals (agreed with S4, 18 Nov)

An animal, or any model that isn't a humanoid, walks, runs and stands with its own clips (`gaits.ts`), as a humanoid does with the shared ones. Spec 17's standard clip names: `walk`, `run`, `idle`, and a flyer's `fly` and a swimmer's `swim` for walking; `jump` is kept for later. S4's build gives a shipped model's clips those names, playing in place; until then the stage reads Styloo's `iddle` as `idle`.

- **Keeping pace:** as a model loads, the stage measures how far its toes (or ankles, or feet) sweep front to back over each walk and run, and works out how fast the clip carries it (a foot is down about two thirds of a walk, under half a run). Walking, the clip keeps pace with the ground covered, so the feet don't slide, and a walk's natural length comes from that speed. Without a run of its own, it runs with its walk, faster.
- **Without feet** (a flyer's, a swimmer's, or a model without mapped joints): the clip plays at its own pace, and it moves at a plain walk or run.
- **Standing:** its `idle` plays under whatever else it's doing.
- **With no walk clip** (Styloo's cat and giraffe), an animal with four legs walks in code (`coded-gait.ts`). Walking, it puts its feet down one at a time (back left, front left, back right, front right); running, it trots, a front leg with the back leg across from it. Its legs swing about its sideways axis with the ground covered, not the clock, so a foot on the ground stays put (about two thirds of a walk, under half a run), and a knee lifts each foot as it swings forward. It walks as fast as its legs are long, as animals do (a Froude number of 0.1 walking, 0.8 trotting: legs 20 cm long walk at about 0.45 m/s, and legs four times as long twice as fast). A flyer with wings and no fly clip beats them while it moves, faster for smaller wings. A stand-in's joints all rest at one place, so it has no walk in code.
## What characters cost

`stageHarness.characterCost(count)` in the stage harness measures it, as `eventCost` does for events.
- It has `count` humanoids stand, then walk round a wall looking at the first of them (every third one waving), then crossfades into a second scene of the same.
- For each, it times the stage's own work a frame (`seek`: timeline, poses, reaching and looking, views) and the whole frame, the GPU's drawing included.
- On a reference device, open the harness and call it in the console (#6). CI runs it small, to check it works.

Measured on the owner's PC, 9 Nov 2026 (Edge, 640 × 360), in milliseconds a frame. A frame at 30 fps has 33 ms.

| Characters, walking | Stage's own work | Frame, on the GPU (GeForce RTX 2060) | Frame, software rendering (SwiftShader) |
| --- | --- | --- | --- |
| 10 MakeHuman people | 0.9 | 3.0 | 122 |
| 20 MakeHuman people | 1.5 | 5.2 | 235 |
| 20 100Avatars (`david.vrm`) | 1.7 | 3.7 | 43 |
| 20 KayKit knights | 1.1 | 4.0 | 161 |
| 40 MakeHuman people | 3.2 | 11.1 | 451 |

- **The stage's own work is small:** about 0.08 ms a character walking, the same with or without a GPU. It isn't what limits a scene.
- **Drawing is:** it grows with triangles.
  - Software rendering, a stand-in for a device with a weak GPU, takes about 15 ms for each MakeHuman person (33,000 to 47,000 triangles, before WP3c reduces them), 13 ms for each knight and 5 ms for each VRM.
  - So the scene budget (`SCENE_BUDGET`, WP3.9) and WP3c's simplifying are what keep a scene at 30 fps. How far, the reference devices will say.
- **Working out the walks** (their walkable area and ways round the wall) takes about 33 ms once for a layout, whatever the number of characters.
- **Loading** a scene of 20 takes 0.2 to 0.7 s.
- **A crossfade** adds 1 to 2 ms a frame on the GPU with 20 characters in each scene, and the old scene's own work.

## How it fits together

`timeline.ts` works the scene out, with no graphics: the scene at any time is a pure function of the set-up and the commands so far. `FakeStage` and `BabylonStage` both wrap it, so they agree exactly. `BabylonStage` copies the timeline's state onto Babylon.js objects on each `seek`, and nothing else moves them.

## What the contract doesn't spell out

- **Directions.** Right-handed, Y up, everything faces +Z, the camera included. Looking along +Z, +X is on the left of the picture (spec 02, Directions). Babylon.js's own cameras look along -Z in a right-handed scene, so the camera's node carries an extra half turn.
- **What it can't find.** A model Backstage hasn't got, or a file that won't load, shows as a stand-in labelled with the model's name, with its class's joints; a backdrop's ground, sky or lighting it doesn't know is the default. The scene loads and plays on, and `missing()` says what wasn't found, for the studio to show (spec 03 section 1.3, the owner's choice of 10 Nov 2026). `load` still rejects a set-up it can't make sense of, such as a paint with no name, with `bad_argument`.
- **Bubbles and captions.** The stage draws no bubbles: `speech(object)` says what each object is saying, and the studio draws it. A speak line is a `say` whose bubble is `caption`, with the script line's id (spec 06 section 4.7); the studio shows it as a film subtitle and plays the line's sound. Both are in the state hash.
- **Vehicles.** A rider keeps its pose relative to its vehicle. `transform` is still relative to the scene. Scale isn't carried, as in Alice.
- **Targets.** A target may be a marker or a joint as well as an object. Markers aren't in `objects()`. A joint target is where the joint rests in the model, carried by its object; turning the joints above it doesn't move it, and asking a joint's size isn't done yet.
- **Sizes.** `load` gives the timeline each object's box and its joints' resting places (`Shape`). A stand-in is the same block on both stages: `STAND_IN_BOX`, or the size it carries (`StandIn.size`, for an imported Alice object), standing on its origin (`standInBox`), and `FakeStage` gives every object that block, so the two agree.
- **The scene and the camera.** The sky, light and fog are `SCENE`'s, and only it takes `atmosphere`, `light` and `fog`; only the camera takes `lens`. `SCENE` isn't in `objects()`.
- **Good view.** `moveAndOrientTo` with `goodView` puts the camera in front of its target, a little above, at two and a half times its largest size, looking at its middle.
- **Fading.** `fade` on `SCENE` darkens the whole picture, sky included, to black and back. Loading a scene clears it. Which scene comes next, and how, is the production's playback (WP8.3); the stage draws it ("Scene after scene", below).
- **Not yet:** smooth paths, folding and spreading wings, and the size of a joint. The stage refuses them with `bad_argument`.
- **Touching.** Alice's rule, in `hull.ts`: each object has a footprint and a height from its box in the scene. Proximity is the same test with a margin, so it measures the gap between two things, not between their centres.
- **Backdrops.** `backdrops.ts` holds Alice's 20 starting templates, with her numbers. Her fog value is cubed to give the density. Each ground is a flat colour unless Backstage has a texture for it (below).
- **Ground textures and picture skies** (spec 17 section 2, agreed with S4, 10 Nov 2026). Both are ordinary Backstage items under the backdrop's own id, found through the stage's `ModelSource`.
  - **A ground's texture:** a `.glb` of one square, a tile's size in metres. The stage puts its picture on the stage's own ground material, so Alice's lights colour it as they colour a flat ground. It's multiplied by `TEXTURE_SHADE`, so a picture of the ground's `groundLook` colour looks just like the flat ground. It's tiled across the 600 m ground, or the room's floor, with mipmaps and anisotropic filtering. `paint` keeps using the colours.
  - **A picture sky** (`PICTURE_SKY_TYPES`: clearDay, cloudy, sunset and night, each with a lighting of the same name): a dome, drawn unlit and without fog, kept on the camera just inside the far clip, so it's behind everything. Fog and the background still follow the atmosphere colour, which is the picture's horizon. Setting the atmosphere colour tints the picture by the new colour over its own, at most 1. Their colours are from S4's build of the pictures.
  - **What's missing:** a ground with no item is drawn in its colour, and isn't reported. A picture sky with no item, or any item that can't be read, is drawn in its colour and reported in `missing()`.
  - **Pictures as they are:** as a model's are (below).
- **A model's colours.** Every surface is a plain, matt material, as in Alice. A model's colours and pictures show as its file means them: glTF's linear colour is turned to sRGB, and pictures are read without sRGB buffers, so their pixels reach the plain material as they are. Until 10 Nov 2026 both came out darker (the owner chose the fix from before and after pictures).
- **Facing the camera.** A camera with no rotation and a model with no rotation both face +Z, so the camera sees the model's back. To face the camera, a model needs half a turn.
- **Events.** Each fires once, at the change: two things start or stop touching, a watched pair comes within or goes beyond its distance, a watched object comes into or leaves the picture. Nothing fires for what was already so when listening or watching starts, and rewinding fires nothing. An object faded to nothing is out of the picture.
- **Hashes.** What only the newer commands set (paint part-way through a blend, back paint, words, the lens, the sky) is in `stateHash` only once something sets it, so older scenes hash as they did.
- **Budgets.** Spike 1.2 is waiting for its device runs, so nothing here is held to a budget yet.

## Scene after scene (8.2, 8.3)

A production plays its scenes in running order (spec 03 section 3.1). The player decides what comes next; the stage gets it ready and draws the change.

- **Preloading.** `stage.preload(setup)` gets a scene that will probably come next ready while this one plays: it makes its Babylon.js scene and fetches and reads its models. Nothing changes on screen, and it never rejects. The next `load` takes that scene and whatever it has loaded, whether or not it's the scene preloaded, so models the two share load at once. A second `preload` replaces the first.
- **Crossfading.** `stage.load(setup, { crossfade })` keeps the old scene and draws it over the new one, fading out over `crossfade` microseconds of the new scene's time. Each frame the old scene is drawn into a picture of its own, laid over the new one.
  - It moves on as far as the new scene has come, from where it was when the new one began. A stage drawing live at "low" quality holds it still, which costs one scene's drawing rather than two (spec 03 section 3.1, rule 7). An export always shows it moving.
  - It fires no events and answers nothing. Its objects aren't in `objects()`.
  - It goes once the crossfade is over, at the next `seek` past it, or at a `reset` or another `load`. Rewinding doesn't bring it back.
  - A `picture` (5.7) is of the new scene alone.
- **Fade to black** is the `fade` command, at the end of one scene and the start of the next.
- **Loads that overlap** (the scene view's set-up and Rehearse's, say): the newest call wins, whichever finishes building first. An older one drops only the scene it was building and settles without taking over, and no load waits for ever on a scene a newer one dropped before it was ready (found by S2). `FakeStage` does the same.
- **Cost:** on the owner's PC, a crossfade adds 1 to 2 ms a frame with 20 characters in each scene ("What characters cost", below). The reference Chromebook is still to measure (#6).

## The scene view (07-ux 7.2)

`EditableStage` (`contract.ts`, agreed with S5) is the stage the Production stage's scene view edits: `Stage`, plus choosing, moving and looking round a scene's set-up. The runtime, export and the self-test use `Stage` alone.

- **Editing** (`editing(true)`) puts the scene back to its set-up. It draws the chosen object's outline and handles (move along the ground, with Shift up and down; turn about the vertical; resize evenly), and the markers. These are drawn on the live canvas only, never in `renderFrame` or `picture`.
- **Picking** is by ray (`editing.ts`, pure, so both stages agree): `pick(x, y)` gives the object or marker there and where the point meets the ground, for a drop from Backstage. `onTap` reports a click or tap that didn't start a handle drag, and `onEdit` reports the handles' drags, live and then `final`.
- **Changing the set-up** without reloading: `setObject` (a transform, opacity or paint; the camera's transform alone) and `setMarker`. Scheduled commands stay and are worked out again from the new set-up, and everything the stage answers, `inShot` included, reflects the change at once.
- **Look around** is a camera of its own that never changes the set-up. `viewTransform` gives where the view is, for "Move the camera here". `inShot` names what the scene's own camera sees, for "In this shot:".
- **Posing** (agreed with S4, 15 Nov): `SceneObjectSetup.joints` gives each joint's turn from rest, in its own axes, as a unit quaternion; joints only turn (decision 0051), and a joint left out is at rest. The scene starts in that pose, so code's joint turns, `getJoint` and Straighten (which goes back to rest) start from it. A posed joint the model hasn't got is left out and the scene plays on, as a missing model does, and `missing()` names it (`{ kind: 'joint', object, joint }`, spec 03 §2.2), after the backdrop and in set-up order, never for an object shown as a stand-in; a turn that isn't a unit quaternion (within 1e-3, then made exact) is refused. `setObject(object, { joints })` replaces the whole pose without reloading, and refuses a joint the object hasn't got (`unknown_joint`). Pose handles on the stage are not here yet: the Pose panel's fields come first.
- **`FakeStage`** picks against stand-in boxes, and tests drive it with `drag`, `tap` and `moveView`. Both stages run `describeEditableStageContract`.

On the Babylon.js stage:

- **The handles** (`handles.ts`, pure): drag the chosen object itself to move it along the ground, level with where it was taken hold of, or up and down while Shift is held; drag the ring round the bottom of its box to turn it; drag the knob on top away from it to make it bigger, evenly. A marker has a ring but no knob. The set-up follows a drag at once, and `onEdit` hears each step, then `final` when it's let go. A press on the chosen object that doesn't move is a tap.
- **The outline, handles and markers** (`babylon/edit-view.ts`) are drawn in amber, markers in blue, in a utility layer over the scene, at the same width on the view however near they are. `picture` never draws them, and `renderFrame` turns them off while it draws, so a frame is always the scene's own camera, as the film will be.
- **Look around** (`orbit.ts`, pure) turns round a point on the scene camera's line of sight, as far ahead as what's in the shot. Dragging turns the scene as if by hand, a pinch or the wheel comes nearer, and the arrow keys (with + and −) work while the canvas has focus. It never takes focus.
- **The pointer:** the canvas's listeners give `pointerDown`, `pointerMove`, `pointerUp`, `pointerCancel`, `wheel` and `viewKey` CSS pixels and keys, and a test can call them too. While editing or looking around, the canvas takes touch drags from the page (`touch-action: none`).
- **Picking a character** uses the pose it's drawn in, not its rest pose (a T-pose for most), for taps in the scene view and clicks while a scene plays. Its skin is worked out again on the CPU only when the scene has changed, and only for characters the ray passes near (about 30 ms each on a desktop).
- **A load that changes only places, paint or fading** keeps the scene and builds nothing again (`loadInPlace`), so the studio can load the set-up after every change without the picture flickering. Another model or backdrop builds the scene again.

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

**On a reference device:** `e2e/harness/device.html`, published as **https://storystage.github.io/storystage2/stage/device.html**, runs the real stage with Backstage's own people, from the commit `backstage.lock.json` pins. One button measures, at low and standard quality, 1 to 16 of MakeHuman's people (about 20,000 triangles each) walking, looking and waving: the frames a second shown live, the stage's own work and the GPU's each frame, loading and working out the walks, and a crossfade. It also measures eight KayKit knights, and what view and occlusion events would cost (decision 0051). The results are text to paste into a chat with S3, and they set 5.6's budget per device and 5.8's cost (#6).
