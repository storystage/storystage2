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
| `src/catalog/program-check.ts` | The check on a whole program, from `@storystage/story-api/program-check`, so only what needs it depends on `ast` |
| `src/alice/palette.json` | What Alice's palette offers, the list the catalog is checked against. Tests only; it never ships |
| `src/alice/inventory.ts` | Reads that list from Alice's Java source |
| `src/alice/compiled-alice.json` | The same list from a compiled Alice, from one CI run, which a test compares. Tests only |
| `src/catalog/open-spec.ts`, `open-spec-reference.ts` | The open specification (WP4.8): `story-api.json`, its schema, and the reference tables in `docs/story-api/` |
| `scripts/` | Node tools, outside this package's `tsconfig` because the package runs in a worker |

## Commands

```
pnpm --filter @storystage/story-api open-spec     # rewrite docs/story-api/ from the metadata
pnpm --filter @storystage/story-api spec          # rewrite the spec's tables from the metadata
node packages/story-api/scripts/inventory-cli.ts <checkout>   # rewrite palette.json, by hand
```

A test fails if the spec's tables are out of date, or if anything in `palette.json` is neither in the catalog nor listed as dropped.
