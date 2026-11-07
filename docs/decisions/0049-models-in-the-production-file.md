# 0049 Imported models travel in the production file

- **Status:** settled
- **Decided:** 1 Nov 2026, by the owner
- **Source:** the owner's answer in the S2 session, on #101

## Decision

A `.storystage` file holds a copy of every class-imported model the production uses, with its Backstage record, so a film looks right wherever it's opened. Shipped models stay out: every copy of StoryStage has them. This adds `models/` to the zip layout in decision 0011. `docs/spec/03-production-format.md`, section 1.3, has the detail.
