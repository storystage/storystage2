# Changelog: the StoryStage Story API

Part of [the StoryStage Story API](README.md). CC BY 4.0. Newest first.

## 0.10.0

8 November 2026. A value added, so a minor version.

- `Expression` gains `neutral` ("plain"), which takes a face back to plain: every expression off. Without it, a face stayed until the next one and no block could take it away.

## 0.9.0

8 November 2026. **The first publication, a draft for comment.**

- Alice 3's palette, checked against Alice's own source and a compiled Alice: what's kept, under Alice's names and parameter names, and what's left out, with reasons.
- Added by StoryStage: scene changes (`goToScene`, `fadeToBlack`, `crossfade`), `speakLine`, shot types (`frameShot`), joints by name (`getJoint`, `getJointChain`), clips (`playAnimation`), character actions for bipeds (`walkTo` and others), faces (`showExpression`, `lookAt`) and gestures, and the events `viewEnter` and `viewExit`.
- Directions in glTF's axes rather than Alice's.
- Still open before 1.0: the parameters of the added character, animation and face blocks; whether occlusion events join; and the joint map as part of the published files.
