# tools/make-sketches

Offline renderer: Backstage glTF models to black-and-white storyboard sketches. Not shipped.

- **Owner:** S4
- **Workplan:** WP10.5
- **Spec:** `docs/spec/17-backstage.md`, section 7

```
node tools/make-sketches/src/cli.ts <backstage folder> [--dry-run]
```

It reads `backstage.json` and every model it names, and writes three things:

- the sketches, to `sketches/<id>/<facing>[-<pose>].svg`;
- each item's `sketches` list in `backstage.json`;
- the touch-up list, `sketches/touch-up.md`.

Hand-drawn replacements go in `sketches/touch-up.json`. Re-run it whenever models are added (WP3b).
