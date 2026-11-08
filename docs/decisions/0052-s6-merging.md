# 0052 S6 merges its WP4 pull requests

- **Status:** settled
- **Decided:** 1 Nov 2026, by the owner
- **Source:** the owner's answers in the S6 session, on #105 and #57

## Decision

The arrangement S1 has under decision 0029 extends to S6's WP4 pull requests: S6 squash-merges them once the required checks pass, and the owner reviews afterwards. The bypass is never used. A pull request that changes the contract files (`vocabulary.ts`, `stage-commands.ts`) still waits for the other owner's review.

The owner also let S6 merge S4's #57 once its checks passed on current `main`, which it did. That was for #57 only.

Auto-merge isn't allowed on this repository, so S6 merges by hand, pinned to the commit that passed.
