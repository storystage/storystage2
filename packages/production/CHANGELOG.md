# Production format changelog

The versions of the `.storystage` file (`formatVersion` in `manifest.json`), newest first. The promise behind them is in `docs/spec/03-production-format.md`, section 1.2. The program inside has its own versions: `packages/ast/CHANGELOG.md`.

## 1.7.0

In Plan only, a frame's plan keeps the steps code ticked off as the learner built them (S7's ask, WP13.9; spec 04 section 6.6; spec 03 section 6). Optional, so an older file opens, is migrated, and keeps its original.

- On a frame's plan: `done`, the ticked steps by number from 1, ascending, each once, none past `agreed`, and may be empty. It follows the code, so undoing a block takes its tick back. Present, even empty, it marks a plan the learner built; a plan the Prompter built has none. A plan whose `done` breaks these rules is dropped whole when the file opens, as any misshapen plan is.
- `ProductionSession.keepPlans` keeps plans on their frames outside the history, as `annotate` keeps check results (the owner's choice of 20 Nov): no undo step, and undo and redo leave them. A learner's own step that changes a frame's plan takes over from it.

## 1.6.0

A frame keeps the plan the learner agreed with the Prompter (S5's ask; spec 04 section 6.7; spec 03 section 6). Optional, so an older file opens, is migrated, and keeps its original.

- On a frame: `plan`, `{ agreedAt, shown, agreed }` (`FramePlan`), each step a `PlanStep`, within `PLAN_LIMITS`. Written with `withFramePlan` in the same undo step as the build; one that doesn't fit is dropped whole when the file opens, never the file.

## 1.5.0

A set-up object can start posed (S3's #424, for S5's Pose panel; 07-ux section 7.2; spec 03 section 2.2). Optional, so an older file opens, is migrated, and keeps its original.

- On a set-up object: `joints`, each joint's turn from its rest pose, in the joint's own axes, as a unit quaternion (`{ x, y, z, w }`). A joint left out stays at rest.
- Only the learner's choices: when the file opens (`keptJoints`, `pose.ts`), a name that isn't a well-formed joint id (`JOINT_ID`, never Object's member names), a turn more than 1e-3 off unit length (`POSE_TOLERANCE`) or not four finite numbers, joints that aren't an object, joints past 256 (`POSE_JOINTS_MAX`), and the whole pose of a declared stand-in or of a class with no joints are dropped, never refused. A pose with nothing left is left out. Kept turns are as written. Whether the model has a joint is the stage's to judge.
- `setObject` carries a pose (`ObjectChange.joints`) in one undo step, and refuses one the file would drop.
- An opened production lists what was dropped in `dropped`, for developers: a pose's entries, and now voices and frame checks too.

## 1.4.0

A production keeps its characters' speak-line voices (S1, WP14b; spec 06 section 4.3). Optional, so an older file opens, is migrated, and keeps its original.

- On the manifest: `voices`, each character's `CastVoice` by the name of its set-up objects, within `VOICE_LIMITS` and `BASE_VOICES` (`voices.ts`, which `@storystage/speech` now imports). Only learners' choices: a voice that doesn't fit, or whose character is gone, is dropped when the file opens, never refused.
- Renaming a scene object in code carries its voice to the new name in the same undo step.

## 1.3.0

A frame can keep its latest automatic check against the storyboard (S2, WP11c; spec 08 section 9.6). Optional, so an older file opens, is migrated, and keeps its original.

- On a frame: `check`, `{ basis, items, kept }` (`FrameCheck`, `CheckItem`, `CHECK_KINDS`, `CHECK_OUTCOMES`), within `CHECK_LIMITS`. Only a cached result: one that doesn't fit is dropped when the file opens, never refused.
- `ProductionSession.annotate` saves results outside the undo history; a frame's `kept` changes through the history as before.

## 1.2.0

A stand-in can carry its size (S6, for imported Alice worlds; spec 19). Optional, so a 1.1.0 or 1.0.0 file opens, is migrated, and keeps its original.

- Wherever a stand-in can be (a set-up's objects, a scene card's cast, a frame's sketches): `size`, its box in metres at scale 1 (`x`, `y`, `z`), each more than 0 and at most 1,000 (`STAND_IN_SIZE_MAX`). Only the set-up uses it: the stage draws the box from it.

## 1.1.0

What the Screening room keeps (WP11b, asked for by S2). Both fields are optional, so a 1.0.0 file opens, is migrated, and keeps its original (spec section 1.2).

- `storyboard.json`: `cards[].retakeNotes`, a learner's notes for retakes of a scene (WP11.2).
- `manifest.json`: `credits.names`, the names learners chose for the end credits (WP11.4).

A file with a note over 200 characters, a name over 40, or more than 40 names is refused (`TEXT_LIMITS`).

## 1.0.0

The first version.
