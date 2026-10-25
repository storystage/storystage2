# tools/convert-alice-models

Offline converter: Alice 3 gallery models (.a3r and .a3t) to glTF. Not shipped.

- **Owner:** S4
- **Workplan:** WP3.2 (the converter); WP3.1 (the gallery list for the licence audit)
- **Spec:** `docs/spec/17-backstage.md`, section 3

## The converter

`java/ConvertAliceModels.java` drives Alice 3.9's own loader and glTF exporter. That is the model-loading code StoryStage 1 forked, so StoryStage 1 need not be built.

It runs from an Alice 3.9 installation with Alice's bundled Java 21, which includes the compiler the source launcher needs:

```
"C:\Program Files\Alice 3\jre\bin\java.exe" -Djava.awt.headless=true "-Dorg.alice.ide.rootDirectory=C:\Program Files\Alice 3\application" -cp "C:\Program Files\Alice 3\lib\*" tools/convert-alice-models/java/ConvertAliceModels.java --names <storystage1>/core/i18n/src/main/resources/org/lgna/story/resources/GalleryNames.properties --out <folder> [--only Biped/Alice,Quadruped/AbyssinianCat] [--list]
```

- It writes `<Folder>/<Name>/<Name>_<VARIANT>.glb` and `conversion-report.json`.
- Variants Alice marks `SIMS2` (The Sims 2's art) are never converted.
- `--list` lists every model and variant without converting anything, for the licence audit.
- It names each mesh uniquely before exporting. Alice's exporter finds a mesh's skin by its name, so unnamed meshes would all get the last skin and fall apart.

Then finish the output:

```
node tools/convert-alice-models/src/finish-cli.ts <folder>
```

- It turns every model to face +Z (Alice's face -Z), once, however often it runs.
- It writes `alice-models.json` and `conversion-report.md`: each variant's class, home section, triangles, largest texture, and whether its skeleton maps onto the joint map.

Converted models are for testing until the licence audit clears them (WP17.1). Don't publish them or commit them to a public repository.

## The gallery list (licence audit, appendix A)

```
node tools/convert-alice-models/src/list-gallery-cli.ts <storystage1> --jars <--list report> --write docs/legal/licence-audit.md --csv docs/legal/letters
```

`--csv` also writes the two spreadsheets attached to the CMU letter: `cmu-models.csv` (the 340 Alice models) and `cmu-sims2-models-left-out.csv` (the 95 Sims 2 models).
