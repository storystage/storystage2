# @storystage/a3p-import

Alice 3 worlds (`.a3p`) into StoryStage (WP9).

- **Owner:** S6
- **Workplan:** WP9 (9.1 is built; 9.2 and 9.3 come with WP9b)
- **Spec:** `docs/spec/15-security.md`, section 3 (the rules for imported files)

## Reading a file: `readA3p` (9.1)

`readA3p(bytes)` reads an Alice 3 world, or a class saved on its own (`.a3c`, with `type.xml`), and gives its version, the program as Alice's own XML tree (`programType.xml`), its pictures and sounds with their bytes (`resources.xml` and `resources/`), and its thumbnail. Or it says in plain words why it can't, never quoting the file.

It's written for untrusted files, to run in the import worker:

- **One archive reader:** `readArchive` from `@storystage/production` (WP8.4), with spec 15's limits on sizes, names and unpacking. Only the entries Alice's format names are unpacked.
- **Its own XML reader** (`xml.ts`), since a worker has no `DOMParser`. A `<!DOCTYPE` or any other declaration is refused before parsing, so no entity can be declared and none expands (threat model F3, the billion laughs). Nesting stops at 256. It's linear in the length of the text, and fetches nothing.
- **Text:** UTF-8 before Alice 3.7, UTF-16 from 3.7, either byte order. The encoding is read from the bytes, not from what the file says about itself.

## Alice's starter projects

WP9's done-when names Alice's 34 starter projects. They're Carnegie Mellon's files, so they aren't kept here while the licence audit (WP17.1) is open. `starters.json` pins them in StoryStage 1 (`storystage/storystage`) by commit and SHA-256, and CI fetches them before the tests:

```bash
node packages/a3p-import/scripts/fetch-starters.ts <folder>
```

With `ALICE_STARTERS=<folder>` set, `src/starters.test.ts` reads all 34; without it, that test is skipped.
