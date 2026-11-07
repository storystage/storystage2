# tools/makehuman-export

The everyday people in Backstage's Cast, made with MakeHuman's CC0 assets. Not shipped.

- **Owner:** S4
- **Workplan:** WP3.5
- **Spec:** `docs/spec/17-backstage.md`, section 3 (pipelines)

## The list

`people.json` is the list; `people.md` describes it in plain words, with the owner's decisions and what the free pack can't show yet.

```
node tools/makehuman-export/src/people-cli.ts
```

This checks every asset against MakeHuman's CC0 system pack, refuses retired outfits, and rewrites the table in `people.md`.

## The build

The **Build MakeHuman people** workflow in [storystage/backstage-assets](https://github.com/storystage/backstage-assets) makes them in CI, so nothing large lands on a developer's PC. It runs three steps:

1. `src/export-cli.ts` turns each person into MPFB2's character dict and writes `sources/makehuman.json`. The decisions are in `src/human-info.ts`, which is tested.
2. `blender/make_people.py` runs in Blender, headless, with MPFB2. For each person it builds the character, bakes their shape, tints hair, recolours the outfit, makes everything but hair, eyebrows and eyelashes solid, shrinks textures to 1024 pixels and exports a rigged `.glb`. It then imports that file and renders it, so a preview shows what ships.
3. `tools/backstage-sources --only makehuman` adds them to Backstage with the same manifest items, joint mapping, provenance and sketches as every other model.

Blender and MPFB2 are GPL build tools and are never linked into the app (CLAUDE.md, rule 8). The people they make from MakeHuman's CC0 assets are CC0.
