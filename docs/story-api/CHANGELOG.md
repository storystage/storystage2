# Changelog: the StoryStage Story API

Part of [the StoryStage Story API](README.md). CC BY 4.0. Newest first.

## 0.12.0

23 November 2026. A detail added, so a minor version.

- `keys` ("which keys"), a list of `Key`, on `keyPress`, `arrowKeyPress` and `numberKeyPress`: the listener runs only for a key in the list. Without it, it runs for every key the event is for, as before, so no program changes meaning. An empty list never runs.
- Each key event takes only its own keys, now listed on the event as `keys`: `arrowKeyPress` the four arrows, `numberKeyPress` `digit0` to `digit9`. `keyPress` takes any key. A program check refuses another.
- Alice has no such setting: it's StoryStage's own, as `viewEnter` is.

## 0.11.0

21 November 2026. A value type and a detail added, so a minor version.

- `LineId` joins the references written as text: a line of the film's script, by its id.
- `speakLine` takes the details `duration` (how long the line takes; without it, as long as its words need) and `line` ("script line": the script line the words come from, set only from the script, so never offered as a detail to add).
- Section 8 says how a scene's code starts: a scene is a class extending `Scene`, and its `myFirstMethod` runs when the scene starts, with no listener needed, as in Alice. A `sceneStart` handler runs at the same time as it. Editors may call that method "When the scene starts", as StoryStage's do; programs keep the name.

## 0.10.0

8 November 2026. A value added, so a minor version.

- `Expression` gains `neutral` ("plain"), which takes a face back to plain: every expression off. Without it, a face stayed until the next one and no block could take it away.

## 0.9.0

8 November 2026. **The first publication, a draft for comment.**

- Alice 3's palette, checked against Alice's own source and a compiled Alice: what's kept, under Alice's names and parameter names, and what's left out, with reasons.
- Added by StoryStage: scene changes (`goToScene`, `fadeToBlack`, `crossfade`), `speakLine`, shot types (`frameShot`), joints by name (`getJoint`, `getJointChain`), clips (`playAnimation`), character actions for bipeds (`walkTo` and others), faces (`showExpression`, `lookAt`) and gestures, and the events `viewEnter` and `viewExit`.
- Directions in glTF's axes rather than Alice's.
- Still open before 1.0: the parameters of the added character, animation and face blocks; whether occlusion events join; and the joint map as part of the published files.
