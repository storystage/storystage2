# 0051 Joint moves and Alice's optional events

- **Status:** settled, except occlusion events, which wait for a measurement
- **Decided:** 1 Nov 2026, by the owner
- **Source:** the owner's review of five choices in spec 02, on cards in the S6 session, after #105

## Decision

| Choice | Decision | Why |
|---|---|---|
| Joints | **Turn only.** `Joint` extends `Turnable`, so a joint can't `move` | Shared animations, gestures and the stage's `joint` command all work by rotation. Adding `move` later breaks nothing; removing it after the open specification (4.8) would |
| View events | **Added to the first release:** `viewEnter`, `viewExit`, in workplan 6.2 | They're the most film-like of the optional events, and the owner chose to keep them |
| Occlusion events | **Measure first.** Out of the catalog for now. S3 measures their per-frame cost on the reference devices once the stage exists (WP5a), and the owner then decides | Each pair of objects is tested from the camera on every frame, and nobody has measured that |
| Point-of-view event | **Left out** | It fires on every frame while an object moves, which is hard for a young programmer to reason about. Other events and the `follow` shot cover most uses |
| Drag while playing (`addDefaultModelManipulation`) | **Left out** | It would share the screen with the scene view's drag handles (7.1) and the Rehearse controls, and it's pointer-only, so it needs a keyboard equivalent (rule 7). Arrow-key movement covers play |

## What the owner was told

- None of the 34 starter worlds or the 47 TR1 evaluation requests uses any of these. That's weak evidence: the starter worlds are templates that use no event except the scene starting, and none of their 17,086 calls targets a joint.
- Spec 02's first reasons for joints and dragging were weak, and are replaced above. That a moved bone distorts a skinned character is general knowledge, not tested here. Alice's scene editor can save a moved joint, so a teacher's own world might use one, and the `.a3p` import (WP9.2) reports it.
- View events' cost isn't measured either, so rule 6 applies to them too.
