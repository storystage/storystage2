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

## The gallery list (licence audit, appendix A)

```
node tools/convert-alice-models/src/list-gallery-cli.ts <storystage1> --jars <--list report> --write docs/legal/licence-audit.md
```
