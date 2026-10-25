# tools/convert-alice-models

Offline converter: Alice .a3r and .a3t models to glTF, using StoryStage 1's Java loader. Not shipped.

- **Owner:** S4
- **Workplan:** WP3.2 (the converter, with WP3b); WP3.1 (the gallery list)
- **Status:**
  - `src/gallery.ts` and `src/list-gallery-cli.ts` list Alice's gallery for the licence audit (`docs/legal/licence-audit.md`, appendix A);
  - the converter itself comes with WP3b.

```
node tools/convert-alice-models/src/list-gallery-cli.ts <storystage1 checkout> --write docs/legal/licence-audit.md
```
