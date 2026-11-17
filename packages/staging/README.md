# @storystage/staging

Set the stage from the storyboard (WP10.10; `docs/spec/07-ux.md` section 7.2): what a scene's storyboard shows that its stage doesn't have yet, and the one step that places it. The studio's **Set up from storyboard** and the Prompter's `stage_scene` (spec 04 section 3.2) both call it, so the two always agree.

- **Owner:** S5
- **Why a package of its own:** S7's evaluation harness runs the Prompter outside the studio, in plain Node, and needs the same step. It can't live in `@storystage/production`, because it uses `@storystage/check`'s geometry and `@storystage/sketches`, which both depend on production (S4's review, 17 Nov).
- **Loads in plain Node:** no DOM, canvas or WebGL is touched when it loads (`scene.test.ts`).

| Use | Gives |
|---|---|
| `storyboardPlan(p, scene, backstage)` | What frame N.1 and the scene's heading ask for that the stage hasn't got: cast and props placed as the sketches show them, backdrop parts, and a camera move when something would break the shot |
| `placeFromStoryboard(p, scene, plan, label)` | One scene step placing the plan. Each object goes through `@storystage/production`'s `addObject`, so a placement the Prompter makes is refused in plain words, as a learner's own add would be (a `SceneRefusal`, with the object's name). The backdrop parts and the camera are set on the scene's set-up. It never moves an object already on the stage |
| `chosenPlan(…)` | The plan narrowed to what the learner ticked in Choose what to place |
| `sceneFrames`, `STANDARD_HEIGHT` | A scene's frames in order; a sketch's height on its frame at size 1 |
| `backdropPartOf`, `withBackdrop`, `withCamera`, `withSetup` | A scene's ground, sky or lighting, and its camera, as pure changes to a production |
