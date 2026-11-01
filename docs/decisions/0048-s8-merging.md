# 0048 S8 merges its own pull requests

- **Status:** settled
- **Decided:** 1 Nov 2026, by the owner
- **Source:** the owner's answers in the S8 session, on #86, #87, #88, #98, #99 and #100, then on #106, #108, #109, #110 and #111

## Decision

The arrangement S1 has under decision 0029 extends to these eleven pull requests: S8 squash-merges them in stack order once the required checks pass, and the owner reviews afterwards. The bypass is never used.

`contract` pull requests (#88, #100) wait for S5's review first, because a contract's owners review it (`docs/spec/00-architecture.md` section 6). WP15k's five stack on #100, so they wait for it too.

The human security review before the pilot still stands, and merging these doesn't replace it.

The answer covers these eleven only. Later S8 pull requests wait for the owner unless the owner says otherwise.
