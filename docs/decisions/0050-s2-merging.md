# 0050 S2 merges its WP2 and WP8.1 pull requests

- **Status:** settled
- **Decided:** 1 Nov 2026, by the owner
- **Source:** the owner's answer in the S2 session, on #90, #92, #94, #96, #97 and #101

## Decision

The arrangement S1 has under decision 0029 extends to these six pull requests: S2 squash-merges them in stack order once the required checks pass, and the owner reviews afterwards. The bypass is never used.

The owner was told that #92, #94 and #101 carry small contract changes, and that #92 and #94 touch S1's test fixtures. So these three don't wait for another session's review, as `contract` pull requests otherwise do; S1 and S4 can raise anything they find afterwards.

The answer covers these six only. Later S2 pull requests wait for the owner unless the owner says otherwise.
