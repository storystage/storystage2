# @storystage/a3p-import

Alice 3 worlds (`.a3p`) into StoryStage (WP9).

- **Owner:** S6
- **Workplan:** WP9 (9.1, 9.2 and 9.3 are built)
- **Spec:** `docs/spec/15-security.md`, section 3 (the rules for imported files)

## Reading a file: `readA3p` (9.1)

`readA3p(bytes)` reads an Alice 3 world, or a class saved on its own (`.a3c`, with `type.xml`), and gives its version, the program as Alice's own XML tree (`programType.xml`), its pictures and sounds with their bytes (`resources.xml` and `resources/`), and its thumbnail. Or it says in plain words why it can't, never quoting the file.

It's written for untrusted files, to run in the import worker:

- **One archive reader:** `readArchive` from `@storystage/production` (WP8.4), with spec 15's limits on sizes, names and unpacking. Only the entries Alice's format names are unpacked.
- **Its own XML reader** (`xml.ts`), since a worker has no `DOMParser`. A `<!DOCTYPE` or any other declaration is refused before parsing, so no entity can be declared and none expands (threat model F3, the billion laughs). Nesting stops at 256. It's linear in the length of the text, and fetches nothing.
- **Text:** UTF-8 before Alice 3.7, UTF-16 from 3.7, either byte order. The encoding is read from the bytes, not from what the file says about itself.

## Importing a world: `importAliceWorld` (9.2, 9.3)

`importAliceWorld(bytes, { fileName, findModel, modelHeight })` gives a one-scene production marked `origin: 'alice'`, and a report of every gap in plain words, counted by kind (spec 19, sections 7 and 8; decision 0069). Or it says why it can't, never quoting the file. The production always passes `checkReferences`, so it saves and opens again. The caller passes Backstage's lookups (`findModel` by Alice's gallery key, `modelHeight`); grounds come from `@storystage/backstage`'s `ALICE_GROUNDS`. In a worker, which can't call back to the page, pass Backstage's models as data instead: `models`, a map from Alice gallery key (or key and variant, `Prop/MangoTree/DEFAULT`) to `{ id, height }`. The import reads untrusted files, so it runs in a worker (`./worker`, started by `./worker-client`'s `importAliceInWorker`, spec 15 §3). For `models`, `aliceModelsFrom(backstage)` (`@storystage/a3p-import/models`, which loads nothing) keys every Backstage item that is an Alice gallery model the way the import asks, `Quadruped/Cat/AbyssinianCat` as `Quadruped/AbyssinianCat`, with its `defaultSize.height`.

In steps, for the tests and anything that needs one part: `readA3p` (9.1), `decodeAlice` (Alice's XML as one graph), `importSetUp` (the scene, objects and start), `buildProgram` (the code), and `importDecodedWorld` (the production).

## Alice's starter projects

WP9's done-when names Alice's 34 starter projects. They're Carnegie Mellon's files, so they aren't kept here while the licence audit (WP17.1) is open. `starters.json` pins them in StoryStage 1 (`storystage/storystage`) by commit and SHA-256, and CI fetches them before the tests:

```bash
node packages/a3p-import/scripts/fetch-starters.ts <folder>
```

With `ALICE_STARTERS=<folder>` set, `src/starters.test.ts` reads all 34; without it, that test is skipped.

A file already in the folder with the right SHA-256 is kept rather than fetched again, so CI caches the folder by `starters.json` and a cache hit needs no network, with every hash still checked.

## A real `.a3p` for other tests

The starters can't be committed, so `@storystage/a3p-import/testing` writes Alice files instead: `smallAliceWorld()` is the bytes of a small world (a camera, the ground and a cat that says Hello, turns and moves) that imports with three gaps, one each of model, value and block, and saves and opens again. `encodeAlice` writes any decoded graph back as Alice's XML (the inverse of `decodeAlice`), and `aliceArchive` packs it as an `.a3p`. For tests only: the studio's tests and e2e use it.
