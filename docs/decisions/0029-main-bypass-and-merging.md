# 0029 Main branch bypass and merging

- **Status:** settled
- **Decided:** 21 Oct 2026, by the owner
- **Source:** the owner's answers in the S1 session

## Decision

The owner, as organisation admin, may bypass the `main` ruleset in an emergency; nobody else can, and sessions acting through the owner's account never use it. S1 squash-merges its own WP0 contract and WP1 spike pull requests once the required checks pass, in stack order, and the owner reviews afterwards; other pull requests wait for the owner unless they say otherwise.
