# tools/backstage-sources

Builds a Backstage folder from its source lists. Not shipped.

- **Owner:** S4
- **Workplan:** WP3.7 (CC0 characters, props, sets and backdrops)
- **Spec:** `docs/spec/17-backstage.md`, section 3 (pipelines)

```
node tools/backstage-sources/src/cli.ts <backstage folder>
```

The folder is normally the [storystage/backstage-assets](https://github.com/storystage/backstage-assets) repository, built by its **Build Backstage** workflow so nothing large is downloaded locally. For each item in `sources/*.json`, the tool:

1. fetches the item, pinned: a GitHub commit, a SHA-256, or an Arweave address;
2. writes it to `models/`, packing a `.gltf` and its files into one `.glb` and keeping `.glb` and `.vrm` files byte for byte;
3. maps its skeleton onto the joint map, using a VRM's own bone table where there is one;
4. measures it and writes its `backstage.json` item, with the licence, credit line and source from the list;
5. draws its sketches (`@storystage/make-sketches`);
6. writes `provenance.json` and `sources-report.md` for the reviewer.

The lists accept only licences the audit allows to ship (CC0, CC BY 3.0 or 4.0).

## Rigging a found character (`blender/autorig.py`)

A character found with no skeleton, or one the joint map can't read, is rigged first by the assets repository's **Rig found characters** workflow. It runs this script in Blender, headless. Blender is a GPL build tool, never linked into the app.

```
blender -b --python-exit-code 1 --python tools/backstage-sources/blender/autorig.py -- \
  <assets>/originals/autorig/rigs.json <assets>/generated/autorig <assets>/previews/autorig
```

- **What it does:** it finds the joints from the model's shape, as a person standing in a T-pose. It makes a skeleton with our joint names, binds the mesh with automatic weights, and renders the model at rest and posed.
- **What it writes:** `rig-report.json`, giving each joint found and how it was found.
- **Using the result:** the item's source list fetches it as `generated: "autorig/<name>.glb"`.

Spec 17, section 3, has the rules.

## Blender Studio's characters (`blender/studio.py`)

The assets repository's **Blender Studio characters** workflow fetches each character listed in `originals/blender-studio/studio.json`, checks its sha256, and runs this script in Blender, headless:

```
blender -b <file.blend> --python-exit-code 1 --python tools/backstage-sources/blender/studio.py -- \n  export <assets>/originals/blender-studio/studio.json <name> <assets>/generated/blender-studio <assets>/previews/blender-studio
```

- **What it does:** it reduces the character to the cast's budget, bakes its look (hair and fur included) into one picture, makes our skeleton where the file's own bones are (`bones` names them), binds it, and renders it at rest and posed.
- **Looking first:** `inspect <report.json> <picture.png>` lists what a file holds (collections, meshes before and after their modifiers, skeletons and their deforming bones, materials, hair), so its `studio.json` entry can be written.
- **What it writes:** `<name>-report.json`, giving the triangles before and after, the joints and the meshes used.
- **Using the result:** the item's source list (`sources/blender-studio.json`) fetches it as `generated: "blender-studio/<name>.glb"`.
