# 0053 S3 merges the WP5a stack

- **Status:** settled
- **Decided:** 1 Nov 2026, by the owner
- **Source:** the owner's answer in the S3 session, on a card, once #114, #115, #117 and #118 were green

## Decision

S3 squash-merges #114, #115, #117 and #118, in stack order, once the required checks pass, and the owner reviews afterwards. These four only. The bypass is never used.

#119 changes `tools/repo`, so it still waits for S1's review. Later S3 pull requests wait for the owner unless the owner says otherwise.

## Why

WP5a is on the critical path, and S1, S4 and S5 are waiting for the stage. Decisions 0050 and 0052 did the same for S2 and S6.
