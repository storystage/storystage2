# 0073 Drag posing: hands and feet by inverse kinematics

- **Status:** settled
- **Decided:** 21 Nov 2026, by the owner
- **Source:** the owner's answers in the S8 session, on S8's comparison of StoryStage 2 with Alice 3; confirmed in the S1 session the same day

## Decision

1. **In this version, a learner poses a character by dragging a hand or a foot.** In the scene view's Pose panel, the learner drags a hand or foot handle and the arm or leg follows, by inverse kinematics. One drag is one undo step.
2. **Joints still only turn (0051).** The drag works out each joint's turn; it never moves a joint.

## Who does what

- **S3:** a hand and foot handle on `EditableStage`, and the drag, reusing the two-joint solver in `packages/stage/src/ik.ts` (`reachTurns`, `limitTurn`).
- **S5:** the Pose panel's side: showing the handles, and writing the pose as one undo step through S4's set-up edits.
