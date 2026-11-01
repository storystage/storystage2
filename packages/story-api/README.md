# @storystage/story-api

The StoryStage 2 Story API: classes, procedures, functions, details and joints, using Alice's vocabulary.

- **Owner:** S6 (spec and types), S3 (procedures and character actions)
- **Workplan:** WP4
- **Status:** metadata in place (WP4.1, 4.2, 4.7). The procedures themselves are WP4.3 to 4.6.
- **Spec:** `docs/spec/02-story-api.md`

## What's here

| Path | What it is |
|---|---|
| `src/vocabulary.ts`, `src/stage-commands.ts` | The WP0.8 contracts: time, space, names, and what a program asks of the stage |
| `src/catalog/` | The metadata: every block, detail, event and value, with display words in `src/strings/en-GB.json` |
| `src/alice/palette.json` | What Alice's palette offers, the list the catalog is checked against. Tests only; it never ships |
| `src/alice/inventory.ts` | Reads that list from Alice's Java source |
| `scripts/` | Node tools, outside this package's `tsconfig` because the package runs in a worker |

## Commands

```
pnpm --filter @storystage/story-api spec          # rewrite the spec's tables from the metadata
node packages/story-api/scripts/inventory-cli.ts <checkout>   # rewrite palette.json, by hand
```

A test fails if the spec's tables are out of date, or if anything in `palette.json` is neither in the catalog nor listed as dropped.
