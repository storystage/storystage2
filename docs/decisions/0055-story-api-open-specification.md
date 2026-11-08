# 0055 The Story API open specification

- **Status:** settled
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answers on cards in the S6 session, starting WP4d (workplan 4.8: "U approves the licence and governance")

## Decision

| Question | Decision |
|---|---|
| Licence | The text (reference, crosswalk annex, changelog) under **CC BY 4.0**, like the curriculum and website (0041, 0045). The JSON files (`story-api.json`, `story-api.schema.json`, `program.schema.json`) under **Apache-2.0**, like the code (0025), so implementers get its patent grant |
| Version | Published as **0.9, a draft for comment**. It becomes 1.0.0 at the release candidate, and the versioning promise (as 2.6's) holds from then. Before 1.0 anything may change, with each change in the changelog |
| Governance | The StoryStage project maintains it; **the owner edits it and decides every change**, when ready, with **no fixed comment period**. Anyone proposes by GitHub issue ("Story API: …") or, once the site is live, through storystage.org. Accepted changes go in the changelog with a reason; declined ones get a reason on their issue |
| Where | **In the repository** (`docs/story-api/`), with a **GitHub release** for each version (`story-api-v0.9.0`) carrying the files. Schema ids use `storystage.org` addresses, which needn't resolve yet, so they never change if the files are later mirrored there |

## What follows

- The program schema is published as `https://storystage.org/spec/program/1/program.schema.json`, numbered by the program format's own major version. S2's `PROGRAM_SCHEMA.$id` in `packages/ast` still says `storystage.github.io`; S2 aligns it, and the published copy matches S2's in every other respect (a test checks).
- The joint map isn't yet among the published files: the reference points to it in the repository. S4 and S6 add it as a file before 1.0.
