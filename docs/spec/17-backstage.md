# 17 Backstage

- **Covers:** Manifest, sections, sources and licences, budgets, the import pipeline, licence capture, in-app sketches
- **Work package:** WP3
- **Owner:** S4
- **Status:** sections 2a (the joint map, WP3.3), 3 (sources and licences, WP3.1; pipelines, WP3b, growing with each source) and 7 (sketches, WP10.5) written 25 Oct 2026; sections 1 (the manifest) and 4 (budgets) written with WP3c, 7 Nov 2026. The other sections are written before the code they govern: 2 with 3.10, 5 and 6 with WP3i.

## 0. Decisions this spec relies on

[0007 3D](../decisions/0007-3d.md), [0008 Models](../decisions/0008-models.md), [0013 Backstage](../decisions/0013-backstage.md), [0025 Licence](../decisions/0025-licence.md); and from the settled table in `docs/decisions.md`: Backstage sources, Import into Backstage, Storyboard sketches (all 18 Oct 2026).

## 1. Manifest

`backstage.json` lists every model in a Backstage folder: the shipped catalogue (built in [storystage/backstage-assets](https://github.com/storystage/backstage-assets)) or a class's imports (3.11). The code is the source of truth: `packages/backstage/src/manifest.ts`, a WP0.8 contract. A change to it is a `contract` pull request, reviewed by S3 (the stage), S5 (the Storyboard), S7 (the Prompter's catalogue) and the export's owner (film credits).

### Each item

| Field | What it holds |
|---|---|
| `id` | The Alice gallery path where there is one (`Quadruped/Cat/AbyssinianCat`), else `source/Class/name` (`kaykit/Biped/knight`). Unique, and never reused for another model |
| `section`, `class` | Its one home section (section 2) and its Story API class |
| `displayName`, `themes` | The name learners see, and words to browse by |
| `description` | Optional. What it looks like in plain words, one line of at most 120 characters, for the Prompter's catalogue, search and screen readers (rule 5) |
| `files.model` | Binary glTF (`.glb`), or VRM (`.vrm`, kept byte for byte) |
| `files.thumbnail` | A colour picture of its front (WebP), or its front sketch until one is made |
| `vrm` | For a VRM file, its version: `"0"` or `"1"` |
| `joints` | Its mapped joints in map order (section 2a), or `prop-only` |
| `defaultSize.height` | Metres at scale 1 |
| `budget` | What it costs as shipped or imported, after any reduction (section 4): `triangles`, and `textureMaxPx`, the longer side of its largest texture (0 if none) |
| `licence`, `credit`, `source`, `permission` | Section 3 |
| `origin` | `shipped` or `imported` |
| `sketches` | Its storyboard sketches (section 7) |

### Rules

1. **Every item has a section, a licence, a credit line, a budget and its sketches.** Every item but `own-work` has a source URL; a `permission` licence names its record in `docs/legal/`.
2. **Shipped items carry only CC0, CC BY 3.0 or 4.0, or `permission`** (`SHIPPED_LICENCES`; licence audit, section 2, rule 1). A class may import share-alike, non-commercial, own-work or "not sure" models (3.12); `mayDistribute` then keeps films that use them in school.
3. **Every model faces +Z.** The pipelines turn models that don't (Alice's, section 3), except VRM files, which are kept byte for byte: **a VRM 0.x avatar faces -Z, and whatever shows it (the stage, sketches, the AR baker) turns it half a turn.** `vrm` says which files need it.
4. **The manifest is generated,** by `tools/backstage-sources` for the shipped catalogue and by the import pipeline for a class. Its `manifestVersion` must match the code's exactly; an older manifest is rebuilt, not read. Version 2.0.0 (WP3c) added `budget` as required, `vrm`, and the shipped-licence rule; 2.1.0 added `description`.
5. **Descriptions say what a learner would see.** A person is described by age, hair, glasses, clothes and anything they use, such as a wheelchair: "a child of 7 with an afro, in a mustard suit". **Never by skin colour or ancestry** (owner, 8 Nov 2026). A shipped item's description comes from its source list and is reviewed with it. An imported item's is typed by the learner or teacher, so the Prompter reads it as data in the user turn, never in `system` (spec 04, section 2.1).

## 2. Sections

_To be written._

### Grounds, skies and lighting (Backdrops)

The grounds, skies and lighting are built into the stage (`packages/stage/src/backdrops.ts`, S3), with ids `storystage/Ground/<name>`, `storystage/Sky/<name>` and `storystage/Lighting/<name>`. They follow Alice's ground appearances and starting templates, as flat colours, because Alice's textures are CMU's.

**CC0 textures** (WP3b, workplan 3.7; agreed by S3 and S4, 10 Nov 2026) come as ordinary Backstage items in the `backdrops` section, so the manifest's format doesn't change. The stage finds them through the same `ModelSource` as any model (`find(id)`), under the backdrop's own id. Where there's no item, or the shipped Backstage isn't there, the stage draws the flat colour as before.

**Grounds**, under the existing ids `storystage/Ground/<name>`:

1. **The item:** a `.glb` holding one square in the XZ plane, centred on the origin, facing +Y (two triangles), with texture coordinates 0 to 1 across it. Its X extent is the size of one tile in metres, the texture's real-world size, about 2 to 4 m.
2. **One material, and only its base-colour texture:** WebP, sRGB, seamless, at most 1,024 pixels, with no alpha channel. No normal or roughness maps, because the stage doesn't use them. The ground's opacity stays the stage's (swamp and ice are 0.7).
3. **Its average colour matches the flat colour,** the hex in the stage's ground table (`GROUND_LIST`, `packages/stage/src/backdrops.ts`), within 10% on each channel in sRGB. That hex is how the ground looks on screen, so a scene looks the same family with or without textures. The build shifts a texture's colour to match, and reports each one's average. The colour comes from the stage's own table through `groundLook` (S3), so the two can't drift apart: a source list may leave `look` out, one it gives must agree, and a ground the stage doesn't have is refused.
4. **Which grounds:**
    - first, those the starter templates use: grass, darkGrass, dryGrass, oceanFloor, moon, mars, snow, desert, sandyDesert, rockyBrown, forestFloor, jungle, swamp, ice, and the room's floor (`room`, a wooden floor);
    - then the rest of `ALICE_GROUNDS`;
    - then the others.
    - **goldCoins and the open water** (ocean, islandOcean, oceanNight, water) **stay colours,** with no item.
5. **What the stage does with it** (S3):
    - It puts the texture on the stage's own ground material, not the glTF's, so Alice's lights colour it as they colour a flat ground.
    - It tiles it, with `uScale` and `vScale` the ground's size divided by the tile's, on the 600 m ground and on the room's floor alike. Walls and ceiling stay colours.
    - It uses mipmaps and anisotropic filtering, up to 8 or the device's limit, so distant ground doesn't shimmer.
    - `load()` and `preload` wait for the texture, so the first frame is the same every time.
    - **A missing item is normal and isn't reported.** An item that's found but fails to load falls back to the colour and is reported as `{ kind: 'backdrop', id }`, so a broken Backstage shows.
    - **`paint` keeps the colours:** painting a model "grass" tints it, it doesn't texture it.

**Picture skies** (the owner's choice, 10 Nov 2026: a few new picture skies, with the 20 template skies staying colours, because code sets the atmosphere colour and fog fades to it):

1. **New ids,** `storystage/Sky/<name>`, that don't clash with the templates' (for example `storystage/Sky/clearDay`): a clear day, a cloudy day, a sunset and a night sky to start with.
2. **The item:** a `.glb` sky dome, an inward-facing sphere centred on the origin with a radius of 200 m (inside the 256 m far clip), about 1,000 triangles. It has one unlit material with an equirectangular picture of at most 2,048 pixels, WebP and sRGB. The middle of the picture (u = 0.5) faces +Z, the way the default camera looks, with +Y up.
3. **Its atmosphere colour** is the average of the picture's horizon band. The build reports it, and the stage's sky table (`SKIES`) gets an entry for each picture sky with that colour, so fog fades distant things into the picture rather than against it.
4. **Its lighting:** each picture sky comes with a lighting of the same name (`storystage/Lighting/clearDay` for `storystage/Sky/clearDay`), which the stage adds with its `SKIES` entry, as each template pairs a sky with a lighting. Its colours from above and below suit the picture: warm for the sunset, dim and blue for the night. The build suggests a pair with each sky, so a sunset doesn't light a scene like noon.
5. **What the stage does with it** (S3):
    - It keeps the dome on the camera, as if infinitely far, and draws it unlit, without fog, behind everything. It's in pictures, crossfades and fades like everything else.
    - Fog and the background colour follow the atmosphere colour, as for any sky.
    - **Setting the atmosphere colour tints the picture** (the owner's choice, 10 Nov 2026): by the new colour divided by the sky's own, capped at 1. A program that darkens the sky at dusk sees it darken, and setting it back shows the picture unchanged.
    - **A picture sky without its item is reported,** unlike a ground. It has nothing to fall back to but its atmosphere colour, so when its id is in `SKIES` but Backstage has no item (the web build without a shipped Backstage, or an older Backstage), the stage draws that colour, the scene plays on, and it's reported as `{ kind: 'backdrop', id }`, the same as an item that fails to load.

**Sources:** ambientCG and Poly Haven, both CC0, checked item by item as in section 3. The files are kept in the assets repository, pinned like the other sources' originals. Poly Haven's API asks for a User-Agent naming the client; the tools send a generic one. Each item's credit names its maker and the site, although CC0 doesn't ask for it.

**Sketches and the Prompter:** each item gets the backdrop sketch of section 7 (rule 6), and the Prompter's catalogue lists it under Backdrops with its description, as for any item.

**Alice's grounds** (`ALICE_GROUNDS`, `@storystage/backstage`): each `SGround.SurfaceAppearance` an Alice world uses, mapped to its ground, so an imported world keeps its ground (spec 19, S6). It covers the ten that Alice's 34 starter worlds use, in Alice's own spelling (`BROWN_SAVANA_GRASS`). Any other gives the default ground, and the import reports it. A test checks every id against the stage's `GROUND_TYPES`.

## 2a. The joint map

The joint map (workplan 3.3) is the list of joints every model is mapped onto, so one block, gesture, walk cycle or "look at" works on every character of a class. The code is the source of truth: `packages/backstage/src/joints.ts` (the map) and `skeleton-map.ts` (mapping a model's bones onto it). `docs/spec/10-crosswalk.md`, section 2, is the background.

### Rules

1. **One joint set per jointed class.** `biped` (Biped), `quadruped` (Quadruped), `flyer` (Flyer), `swimmer` (Swimmer) and `slitherer` (Slitherer). Props, transports, text and billboards have no joint set. A transport's moving parts (propeller, axle, rudder) are the model's own joints (rule 6).
2. **Humanoids use VRM 1.0 bone names as ids.** All 55 VRM humanoid bones are in the map, from `hips` to `rightLittleDistal`. Each has an H-Anim 2.0 (ISO/IEC 19774) joint, so the map can be exported to the standard. The 15 bones VRM requires (hips, spine, head, and the upper arm, lower arm, hand, upper leg, lower leg and foot on each side) are **required**. A character without all 15 is **prop only**: it can move and turn, but not walk or gesture.
3. **Alice's words are the words on the blocks.** For example, `leftLowerArm` shows as "left elbow" and `jaw` shows as "mouth". Alice's naming trap is kept for learners: Alice's "shoulder" is VRM's upper arm (`leftUpperArm`), and VRM's `leftShoulder` is the "left collarbone". The words are display names, so the Story API (S6) may change them without changing any id.
4. **Alice's extra humanoid joints fold onto the standard.** Alice's wrist and hand map to `leftHand` ("left wrist"), and Alice's ankle and foot map to `leftFoot` ("left ankle"). When a model has both, the wrist and the ankle are used. The ring finger, missing from Alice's biped class, is added (`leftRingProximal`, "left ring finger"). Alice's eyelids are kept as StoryStage joints (`leftEyelid`), which are not VRM bones. A VRM model blinks with its expression instead.
5. **Animals use Alice's joint sets, published as StoryStage's open extension.** No standard covers animals. Ids are Alice's names in camel case (`backLeftHock`, `leftWingTip`, `frontLeftFin`). A numbered chain counts from the base: Alice's `TAIL_0` to `TAIL_3` become `tail` to `tail4`. Every class shares the face joints with humanoids (`head`, `jaw` for the mouth, `leftEye`, `rightEye`, `leftEyelid`, `rightEyelid`), so "look at", "speak line" and lip sync work on every class. Required joints:
    - quadruped: spine base, head, and the front shoulders and knees and back hips and knees;
    - flyer: spine base, head and both wing shoulders;
    - swimmer: spine base, head and tail;
    - slitherer: spine base and head.
6. **Extra joints are optional on every class.** Many Alice models add the same joints beyond their class's set: lower lip (94 models), ears and ear tips (40), tails on bipeds, hair, horns, trunk, tongue, eyebrows, wings on quadruped dragons, and fin tips. These are listed once (`EXTRA_JOINTS`) with words, so they mean the same on every model. Where a class already has a joint with the same id, the class's own is used. Any other joint a model has (a skirt, a cloak, plumage) is the **model's own joint**, named from its Alice name (`SKIRT_BASE` becomes `skirtBase`, "skirt base"). It works with the joint blocks, but no shared gesture uses it.
7. **The manifest lists a model's mapped joints** (`joints` in `backstage.json`, section 1) in map order, then the model's own joints, or `prop-only`.

### Mapping a model's bones

`mapSkeleton(boneNames, skeleton)` maps a model's bones onto the map. The converter (3.2), the MakeHuman and CC0 pipelines (3.5, 3.7) and the import pipeline (3.11) all use it.

- **Names are normalised** before matching: lower case, with no namespace (`mixamorig:`, `Armature|`), rig prefix (`DEF-`, UniVRM's `J_Bip_C_`) or separators.
- **Each naming convention is tried on its own,** because the same word means different bones in different tools. Alice's "shoulder" is Mixamo's "arm", and Rigify's first `spine` is the hips. The conventions are:

    | Convention | Where it comes from | Example: left upper arm |
    |---|---|---|
    | `storystage` | Our ids (VRM 1.0 names for humanoids), as our pipelines write them | `leftUpperArm` |
    | `alice` | Alice's `JointId` names, from the converter (3.2) | `LEFT_SHOULDER` |
    | `mixamo` | Mixamo, common in files learners bring in (3.11) | `mixamorig:LeftArm` |
    | `unreal` | The Unreal mannequin, and MakeHuman's "game engine" skeleton (3.5) | `upperarm_l` |
    | `rigify` | Blender Rigify deform bones | `DEF-upper_arm.L` |
    | `generic` | A plain name with a side before or after: UniVRM 0.x, Kenney, KayKit and hand-made rigs | `upperarm.l`, `L_UpperArm` |

    Animals are matched by `storystage` and `alice` names only. An animal from elsewhere imports as prop only until a later version adds a mapping step for the teacher (WP3i).
- **The convention that finds the most required joints wins.** A tie goes to the one that maps more joints, then to the order in the table.
- **Within a convention,** the preferred name wins (wrist over hand, ankle over foot), then the bone nearer the root. A spine numbered from the hips (`spine_01` to `spine_05`) is spread over `spine`, `chest` and `upperChest`: the first, middle and last bones.
- **No bone maps to two joints, and no joint to two bones.** The result lists the bones left unmapped and the required joints missing. The import report (3.11) turns these into plain words ("skeleton mapped (20 of 22 joints)").

The bone-name fixtures in the tests are written from each tool's documented naming. WP3b checks them against real files from each source, and adds a fixture for every source it ships.

## 3. Sources and licences

The licence audit, `docs/legal/licence-audit.md` (workplan 3.1), lists every candidate source with its licence as checked, the credit line, and a verdict: ship, ship per item, not yet, or don't ship. Its appendix A lists every model in Alice's gallery. In short:

1. **Shipped licences:** CC0, CC BY 3.0 or 4.0, or `permission` with a written record in `docs/legal/` (Alice's models if CMU agrees; the commissioned cast). Never CC BY-SA, NC or ND, and never "not sure", in the shipped catalogue. Learners' imports may use any licence on the short list (section 6), with the limits in `mayDistribute`.
2. **A credit line for every item, CC0 included,** so the About screen and film credits name every maker (WP11.4).
3. **A source URL for every item,** pointing at the item's own page, with the date retrieved. The licence is checked item by item, never per pack.
4. **Not shipped:**
    - Alice's models, until CMU confirms (WP17.1). They may still be converted for testing.
    - Anything drawn from The Sims 2's art (WP17.7). That includes 95 of the 435 models in Alice's own gallery and two Bamboo variants; Alice's jars mark them `SIMS2`.
    - Quaternius, whose licence forbids redistribution as an asset pack, unless Quaternius gives written permission (the owner is asking).
    - Mixamo and general Sketchfab.

A change to a source's verdict changes the audit first, then the manifest.

### Pipelines

Each source reaches Backstage through a pipeline that reads its files, maps skeletons (section 2a), measures size and writes manifest items with the licence, credit line and source from the audit. Models are simplified to the device budget in WP3c (section 4), not here.

- **Alice's models** (3.2, `tools/convert-alice-models`):
    - A Java program drives Alice 3.9's own loader and glTF exporter from an Alice installation. It never converts a variant Alice marks `SIMS2`.
    - It names meshes uniquely, because the exporter finds each mesh's skin by name.
    - A finishing step turns each model to face +Z (Alice's models face -Z), maps its joints with the Alice convention, and reports triangles and texture sizes.
    - The output is for testing until the audit clears a model; it is not committed to a public repository.
- **CC0 sources** (3.7, `tools/backstage-sources`):
    - Each source has a list in the assets repository (`sources/*.json`). Every item gives its name, class, section, licence, credit line and own page, and is pinned: a GitHub commit, a SHA-256, or an Arweave address, which names fixed content. Only the licences the audit allows to ship are accepted.
    - The build fetches each item. It packs a `.gltf` into a `.glb`, keeps `.glb` and `.vrm` files byte for byte (a VRM's expressions and look-at serve later blocks), and maps the skeleton (a VRM by its own bone table).
    - **Real sizes:** an item may give its real `height` in metres. The build scales a glTF model to it under one new root node, since models from galleries such as Poly Pizza come at every scale their makers used (a kite of 6 km, an aeroplane of 30 cm). The manifest's `defaultSize.height` is then that height. VRM files are kept as they are.
    - **Facing:** an item may give a `turn` in whole degrees (`x` first, to stand it up, then `y`), so a glTF model faces +Z and stands up as every Backstage model does (section 1). It's applied before the height is measured. Galleries' models face every way their makers chose. A turn is usually a quarter turn, but a model that leans in its own data takes whatever stands it up: Poly Pizza's crutches take `x: -34`.
    - **Copies are dropped:** a mesh placed twice in the same place, as some converted models carry it, is removed before reduction (`dropDuplicateInstances`, in `reduceModel`, so imports get it too). It costs triangles, and its sketches would show nothing clean.
    - **Backdrops are made from pictures** (section 2, `backdrops.ts`):
        - An item in the `backdrops` section gives `backdrop: { kind: 'ground', tile, look? }` or `{ kind: 'sky', exposure?, tint?, ahead? }`, and fetches its picture (`.jpg`, `.png` or `.webp`), pinned like a model. A sky's `exposure` (0.05 to 1) scales its light in linear light and its `tint` (`rrggbb`, what white becomes) colours it, because a gallery's tonemapped pictures are each exposed to look bright, so a night sky comes as bright and grey as noon. Its `ahead` (0 to 1) is the picture's column that faces straight ahead (+Z), so a sunset's sun is in front of the default camera, not off to one side.
        - Its id is the stage's: `storystage/Ground/<name>` with the class `Ground`, or `storystage/Sky/<name>` with the class `Scene`, since a sky belongs to the scene and the Story API has no sky class. It takes no `height`, `turn` or `exclude`.
        - The build makes the ground's tile, colour-matched to `look` in linear light, or the sky's dome. The thumbnail is the picture itself, since a flat tile seen from the front shows nothing.
        - `sources-report.md` and `provenance.json` give each ground's average colour as fetched and as shipped, and each sky's horizon colour with a suggested lighting, for the stage's tables.
        - The Prompter's catalogue lists backdrops without a size or joints, and says they're set as a scene's backdrop, not added.
    - It writes the manifest items, `provenance.json` (every file fetched, with its SHA-256) and the sketches.
    - **VRM 0.x avatars face -Z.** The sketches turn them; the stage's loader must too (S3).
    - Before a build is merged, a person looks at each new item's sketches for respectful, age-appropriate representation.
- **Everyday people** (3.5, `tools/makehuman-export`):
    - `people.json` lists them, checked against MakeHuman's CC0 system pack. The owner reviews the list and then the renders.
    - A workflow in the assets repository runs Blender with MPFB2, headless. These are GPL build tools, never linked into the app; the people they make from CC0 assets are CC0.
    - Each person is rigged to the `game_engine` skeleton, which the joint map reads by its `unreal` convention.
    - **Colours change the texture's pixels,** because a shader tint would not survive glTF. An outfit's shirt and jeans share one texture, so denim is told apart by being blue and left alone.
    - **Only hair, eyebrows and eyelashes are see-through,** and glasses' lenses. MPFB2's game material marks everything see-through, and the script makes the rest solid. Glasses are written as glTF's MASK, so their frames are solid and their lenses clear (the community's CC0 `glasses01` pack, 10 Nov 2026).
    - Textures are shrunk to 1024 pixels here. Triangles (33,000 to 47,000 each) are reduced in WP3c.
- **Where Backstage's files live** (owner's decision, 25 Oct 2026): the public repository `storystage/backstage-assets`. It holds the shipped glTF files, `backstage.json`, the sketches and each item's provenance. A GitHub Actions job there downloads the CC0 sources, converts them and commits the results, so nothing large is fetched to a developer's PC. The MakeHuman people are made there too, headless, with MPFB2 in Blender (owner's decision, 25 Oct 2026). Both tools are GPL and are build tools only (CLAUDE.md, rule 8).

## 3a. Credits

Credits come from the manifest (workplan 3.4): the About screen lists every shipped model, and a film's end credits (WP11.4) list the models it uses. The code is `packages/backstage/src/credits.ts`. The About screen itself is S5's (the Studio), and the film credits are the export's (spec 08, section 5); both build on `creditsBySection`.

### Rules

1. **Grouped as everywhere else:** Cast, Props, Set and Backdrops, in that order, with empty sections left out.
2. **Each model once,** alphabetically within its section, with its credit line exactly as the manifest gives it.
3. **Each line carries its licence and its page:** a Creative Commons licence's short name and deed link (`LICENCE_LINKS`), and the model's own page. CC BY asks for both. A screen shows them as links; a film shows the name.
4. **A changed CC BY model says so** (owner, 8 Nov 2026): its credit line ends ", changed for StoryStage" (`creditFor`), as CC BY 4.0 asks (section 3(a)(1)(B)). The build changes every glTF model it ships (textures re-encoded, perhaps simplified), and the import pipeline will too, so both write the credit with `creditFor`. VRM files are kept byte for byte, so they aren't changed. CC0 and `permission` credits are left as written.
5. **Notices a source requires,** such as an acknowledgement CMU may ask for its Alice models, are added here when the permission that requires them is recorded in `docs/legal/`.

## 4. Budgets

Every model is reduced to a budget, and every scene is checked against one, so a production runs smoothly on the reference 4 GB Chromebook (CLAUDE.md, rule 6). The code is `packages/backstage/src/budget.ts` (the figures and the scene check) and `optimize.ts` (the reduction, `@storystage/backstage/optimize`).

### The figures

**Provisional** (owner, 7 Nov 2026): spike 1.2's working assumption, used until the spike has been measured on the reference devices (#6). They live in `budget.ts` and nowhere else, and `BUDGETS_ARE_PROVISIONAL` is true until then.

| Per model, by section | Triangles | Largest texture |
|---|---|---|
| Cast | 20,000 | 1,024 px |
| Props | 8,000 | 1,024 px |
| Set | 20,000 | 1,024 px |
| Backdrops | 4,000 | 2,048 px |

**Per scene:** 100,000 triangles, and about 64 MB of pictures. The picture memory is an estimate: each model's largest texture, uncompressed at 4 bytes a pixel, plus a third for its smaller copies (mipmaps). Every object on the stage counts, so two cats cost twice one cat.

### Rules

1. **Every glTF model is reduced to its section's budget** when it enters Backstage: by `tools/backstage-sources` for the shipped catalogue, and in a Web Worker for imports (section 5). It's the same code in both. The manifest's `budget` records the result (section 1).
2. **The reduction, in order:**
    - make materials in glTF's older specular-glossiness workflow ordinary base-colour ones, which every renderer reads, our thumbnails and sketches included: the diffuse picture and colour become the base colour, and roughness is one less glossiness (MV Spartan's scan, 11 Nov 2026);
    - drop what nothing uses;
    - replace a texture of one solid colour with a plain colour on its material;
    - join duplicate corners;
    - only if the model is over its triangle budget, simplify its meshes with meshoptimizer. Simplifying starts gently (the surface moves at most 0.5% of the model's size) and allows more (up to 10%) only as far as the budget needs. It keeps a subset of the original corners, so a character's joints and weights carry over unchanged.
    - only if the gentle steps stall above the budget, as scans do whose pictures are cut into many small pieces (museum scans, 11 Nov 2026), a last step: meshoptimizer's attribute-aware simplifier in its Permissive mode, which may collapse edges across a picture's seams while weighing the texture coordinates, so the picture still lands where it should. Each primitive takes its share of the budget, and it too keeps a subset of the original corners. The build's renders show the result, so a model it spoils (a thin, strutted one such as the Wright Flyer) can be left out or kept over budget for review.
3. **Textures are shrunk to the budget and made WebP** (owner, 7 Nov 2026), and the file then requires `EXT_texture_webp`. Babylon.js and every target browser read it.
4. **The encoder is passed in.** The build tools use sharp, as a devDependency only, because sharp bundles libvips under the LGPL (CLAUDE.md, rule 8). A pnpm override keeps sharp out of the app's dependencies (`pnpm-workspace.yaml`). The import worker will use the browser's own canvas (WP3i). Without an encoder, textures are left as they are and the model is reported as not fitting.
5. **VRM files are measured, not reduced,** because they are kept byte for byte (section 1). The build report flags any over budget.
6. **A scene over budget gets a plain-words warning** for the learner (`checkScene`): "This scene may be slow on a school Chromebook: it has a lot of detail. Try fewer models, or simpler ones." Nothing is refused.

## 4a. The Prompter's catalogue

The Backstage catalogue in the Prompter's system prompt (workplan 13.3; spec 04, section 2.1). The code is `packages/backstage/src/catalogue.ts`; the Prompter passes its text as `SystemCatalogs.backstage` (`packages/prompter`).

```text
Joint sets
  J1: hips, spine, chest, head, leftUpperArm, ...

Cast
  Biped
    makehuman/Biped/p01: Alfie, a boy of 6 with short brown hair, in a blue shirt and jeans [everyday, children] 1 m, joints J2
Props
  Prop
    kaykit/Prop/mug: Mug [fantasy, food] 0.55 m, no joints
```

### Rules

1. **Shipped models only.** Imported models are a class's, named and described by learners and teachers, so they go in the user turn as data (spec 04, section 2.1), never among the instructions.
2. **Each line gives what Claude needs to choose and use a model:** its id exactly as `add_model` takes it, its name and description, its themes, its height at scale 1, and its joints. Licences, credits, files and budgets are left out.
3. **Joint sets are listed once** and each model names its set, because models of one class differ (a KayKit character has 18 joints, a MakeHuman person 52). Claude uses only the joints in a model's set; a model with none can move and turn, but not walk or gesture.
4. **The same manifest always gives the same text,** whatever order it lists its items in, sorted in code-point order rather than the machine's locale. The native layer pins the system prompt's hash for a release (spec 04, section 1.8), so the catalogue a release ships is fixed with it.
5. **It fits 12,000 tokens,** counted at three characters a token (spec 04, section 2.1). The build (`tools/backstage-sources`) stops before writing anything if it doesn't, writes the text to `prompter-catalogue.txt` for the reviewer, and puts its size in the build report. The 50 models shipped on 8 Nov 2026 take about 3,100.

## 4b. Loading

How the app gets its models (workplan 3.9). The code is `packages/backstage/src/loader.ts`, and, for the bundle, `tools/backstage-sources/src/bundle.ts`.

### Rules

1. **The shipped Backstage is bundled** (decision 0062): the apps carry `backstage.json`, the models, thumbnails, sketches and `prompter-catalogue.txt`, about 85 MB on 8 Nov 2026. The Tauri apps bundle the folder as resources (S8); the browser version serves it from its own origin (S1). Models are never downloaded, so Backstage works offline from the first launch.
2. **A release ships one pinned catalogue.** `backstage.lock.json` names the assets commit and the SHA-256 of its `backstage.json` and `prompter-catalogue.txt`. `pnpm backstage:fetch` fetches exactly those files into `.backstage/` and checks them (`checkBundle`): both hashes, a valid manifest of this code's version, every file it names, each under a name the apps' `backstage` protocol serves (`servedPath`: letters, digits, `.`, `_` and `-` between `/`; spec 05, section 7), and a Prompter catalogue that is exactly what `catalogueText` makes of it. The release workflows run it before bundling. Updating Backstage means rebuilding the assets, then updating the lock in a pull request.
3. **Opening:** `openBackstage(folder)` reads `backstage.json` once a session and checks it. If it's missing, damaged or of another manifest version, it fails with a plain-words `BackstageError` ("Backstage couldn't be opened: its list of models is missing. Try installing StoryStage again.") and tries again next time.
4. **What it answers:** `find(id)` gives the stage a model's address, joints and VRM version, matching the stage's `ModelSource`, so a 0.x avatar can be turned (section 1, rule 3); `thumbnail(id)`, `items` and `item(id)` serve Backstage's browse views; `credits()` the About screen (section 3a); `catalogue()` the Prompter (section 4a). Addresses are the folder plus the manifest's path, each segment escaped.
5. **A film's packed models and the class's imports join the shipped ones** with `combineBackstages(shipped, film, classes)`, the one model source an App passes to every stage. The shipped Backstage answers first, so an import can't stand in for a shipped model's id. The film's copy of an imported model comes before the class's: an id is never reused, so they're the same model, and the film's is in memory already. Imports are credited, but never put in the Prompter's catalogue.
    - **A film's models** (`filmBackstage(manifest.models, files.models)`, decision 0049) give `blob:` URLs made on first use from the open production's files, so a film from another device shows its imported models even where this device's class Backstage lacks them.
    - **The class Backstage** (`openClassBackstage(ClassFolders.backstage())`, decision 0066) lists its records at once, but reads a model's files only when `prepare(ids)` asks for them: the stage's mount prepares the class models a film uses and doesn't carry before it loads them. Until then, they're not found, and show as stand-ins.
    - Both have `dispose()`, which revokes every URL they made, when the film closes or the class Backstage changes.
6. **Models load lazily:** the stage fetches a model only when a scene places it, and shares one copy across the scene (`packages/stage`, WP5.3). The scene budget (section 4) warns when a scene holds too much.

## 5. The import pipeline

Workplan 3.11, decision 0066. A teacher, or a learner when `backstage.import` is `learners` (spec 05, section 3.3), brings a model into the class Backstage. Everything runs on the device, in the import worker (`00-architecture.md`, section 3; `importInWorker`, a fresh worker for each import): with no network, stopped after 60 seconds (`IMPORT_TIME_LIMIT_MS`) with a refusal in plain words, and never trusting the file (`15-security.md`, sections 3 and 3.4). The code is the new package `@storystage/backstage-import`, which uses `@storystage/backstage` (reduction, budgets, joints, the manifest) and `@storystage/sketches` (sketches, thumbnails).

### What can be imported

- **One `.glb` or `.vrm` file.**
- **A `.gltf` file with its `.bin` and pictures,** picked together. Each `uri` must be embedded data or one of the picked files, by plain name (F9): no paths, no addresses.
- **An `.obj` file with its `.mtl` and pictures,** read by our own reader (decision 0066): geometry, normals, texture coordinates, basic materials (colour, picture, see-through) and their pictures. Groups and objects become nodes, and polygons become triangles, as a fan from the first corner. Anything else in the file is left out, and the report says so (`readObj`'s `leftOut`). A picture is found among the picked files by the last part of the name the `.mtl` gives, since exporters often write a path there (`texturesskin.png`); so still nothing but a picked file is read. The reader stops as soon as the file passes the triangle or node ceiling.
- **Not FBX.** The teacher guide shows how to convert it with Blender. Anything else is refused in plain words.

### Steps

1. **Read and check, before anything heavy** (`15-security.md`, section 3.4):
    - the file sizes (`FILE_LIMIT`);
    - each picture's width and height from its header, before it's decoded: 8,192 pixels on a side and 40 million pixels at most;
    - any **required** glTF extension the stage doesn't use refuses the file. `IMPORT_EXTENSIONS` are the ones accepted: `EXT_meshopt_compression`, `EXT_texture_webp`, `KHR_materials_emissive_strength`, `KHR_materials_unlit`, `KHR_mesh_quantization` and `KHR_texture_transform`. Extensions that are only used, not required, are dropped on reading. Draco compression is refused in its own plain words, which say how to export again from Blender without it;
    - every accessor inside its buffer view, and every view inside its buffer, so a count the file claims falsely can't read past its own data (F8);
    - ceilings that keep the worker safe before it reduces anything: 2,000,000 triangles, 256 joints, 10,000 nodes and 64 pictures. Over any of them, the file is refused, with which limit in plain words.
2. **A VRM avatar** has its bones named from its own VRM table, as the sketch reader does. A 0.x avatar is turned to face +Z in the file itself. So what's saved is an ordinary glTF facing +Z, and the item has no `vrm` field.
3. **Reduce it to its section's budget** (section 4) with `reduceModel`, the same code the shipped build uses. Pictures are shrunk with the browser's own canvas (`OffscreenCanvas`): as WebP where the browser can encode it, and otherwise as PNG, which Safari makes. The texture encoder therefore says which it made.
4. **Map its skeleton** for a class that has one (`mapSkeleton`). If the required joints aren't all there, it's **prop only**: it can move and turn, but not walk or gesture.
5. **Draw its sketches and thumbnail** (sections 7 and 7a), with the browser's picture decoder.
6. **Make its record:**
    - its id is `class/<Class>/<name>`, made from its name (lower case, hyphens, at most 40 characters; `model` if nothing is left) and unique in the class Backstage, with `-2`, `-3` and so on (`classModelId`). The caller passes the ids the class Backstage has had, live and in the bin;
    - the section, class, name and an optional description, as the person chose;
    - the licence, credit and source from section 6;
    - `origin: "imported"`, its measured `budget` and its height.
7. **The report, in plain words, before anything is saved.** For example: "Reduced from 180,000 to 12,000 triangles; textures from 4K to 1K; skeleton mapped (20 of 22 joints); credit: 'Robot by A. Maker, CC BY 4.0, changed for StoryStage'". The person saves or cancels.

A model that still doesn't fit its budget after the gentlest simplifying that reaches it, or whose pictures can't be shrunk, is refused in plain words: it would slow every scene it's in (`CLAUDE.md` rule 6).

**The files** sit at paths relative to the item, as a packed model's do (`03-production-format.md`, section 1.3): `model.glb`, `thumbnail.webp` (or `.png`) and `sketches/<facing>[-<pose>].svg`.

`importModel` returns the record, its files (model, thumbnail and sketches) and the report, or a refusal. The licence step is checked first, before anything is read, so the person can fix it straight away. It's pure: the caller saves into the class Backstage.

### The class Backstage (decision 0066)

- **On each device,** beside the pupil folders. Its storage is the host's (S8, `@storystage/host`).
- Each item records **who it belongs to:** the class (a teacher's import, or a promoted one) or one pupil (a learner's own import). A pupil sees the class's items and their own. On a device with no class list (`ClassFolders.openDevice`), the person imports as the class: they are their own teacher (spec 05, section 6.2).
- **Promote:** the teacher moves a pupil's item to the class.
- **Remove:** to the bin, like a production (decision 0065).
- **Opening the Backstage** is the loader's `backstageFrom`, with the shipped Backstage first (`combineBackstages`, section 4b). A class item can't stand in for a shipped id, and an id is never reused.
- **A production carries every imported model it uses** (decision 0049, `03-production-format.md` section 1.3). Opening a production on a device whose class Backstage lacks the model still shows it, from the production.

### The model pack

The teacher saves the class's models to one file, and opens it on another device, through the system's file picker (decision 0066).
- **It's a zip,** read and written by the archive reader and writer (`03-production-format.md`, section 1), with the same layout as a production's packed models: `backstage.json` (a manifest of the items) and each item's files under `models/<folder>/`.
- **The file** is `<class name> models.storystage-models` (`MODEL_PACK_EXTENSION`). Writing one is light enough for the page (`@storystage/backstage-import/pack`); opening one runs in the import worker (`openModelPackInWorker`), where the time limit is per model: each model the worker begins gives it a fresh 60 seconds, so a big pack finishes, but no one model can hang.
- **It holds the class's own models,** not pupils' own imports (`modelPackFromClass`). `backstage.json` says `format: "storystage-models"` and its `formatVersion` (1.0.0), and lists each model's `folder` and record. A pack from a newer major version is refused in plain words.
- **Opening a pack checks every model as an import** (`openModelPack`, through `buildModel`): the steps in section 5, except that a model already within budget isn't reduced again. Its sketches and thumbnail are drawn again from the model, never taken from the pack: a pack is a file anyone could have made, and the studio shows sketches. Each record keeps its id, name, section, class, licence, credit and source.
- **A model is left out, with the reason in plain words,** if it fails a check, if its record isn't a class's imported model, or if the class Backstage already has its id (ids are never reused, and it's most likely the same model).

## 6. Licence capture

Workplan 3.12. Licences and credits are part of what learners learn, as they are in industry.

1. **On import, the person picks the licence** from a short list:
    - CC0;
    - CC BY, with its version: 4.0 by default, or 3.0;
    - CC BY-SA;
    - CC BY-NC;
    - I made it;
    - not sure.

   These are the manifest's `LICENCES`, plus `permission`, which only shipped items have.
2. **They give where it came from:** the model's own page (`source.url`), required except for "I made it". For any CC BY licence, they also give **who made it**, for the credit.
3. **The credit line is made from these.**
    - CC0: "<Name> by <maker> (CC0)", or "<Name> (CC0)" with no maker.
    - CC BY, BY-SA and BY-NC: "<Name> by <maker>, CC BY 4.0", for example. The import changes the model, so `creditFor` adds ", changed for StoryStage" (section 3a, rule 4).
    - I made it: "<Name>, made by our class". A learner's name is never put in a credit by default (WP11.4 lets learners choose their names).
    - Not sure: "<Name>, source not checked".
4. **"Not sure" and CC BY-NC stay in the class and are flagged.** Films that use them can be shown in school, but not shared outside it, and they can't go into the pathway exports (WP20). `mayDistribute` gives the reason in plain words.
5. **CC BY credits go into the film's credits automatically** (`creditsBySection`, section 3a; WP11.4).
6. **No in-app browsing of open galleries.** Backstage search (decision 0058) is Poly Pizza's CC0 models only, for teachers. It screens out models about guns, and every result still goes through the import report.

## 7. Sketches

The Storyboard's frames use sketches only (decision 0014). Every sketch is generated from a Backstage model, or hand-made for backdrops and storyboard marks (workplan 10.5; decision of 18 Oct 2026, "Storyboard sketches"). The code is `packages/sketches` (the renderer, used offline and in the app) and `tools/make-sketches` (the offline run over a Backstage folder).

### Rules

1. **What each item gets.**
    - Every model gets four **facings**: front, three-quarter, side and back.
    - A **Cast** member whose skeleton maps onto the joint map (section 2a) also gets each standard **pose** in each facing: walk, point and sit. That makes 16 sketches. Its plain facings are drawn standing, with arms down, whatever pose the model rests in.
    - Cast that can't be posed, and all Props and Set items, get the four facings of the model as it is.
    - **Backdrops** get one hand-made sketch (section 7, rule 6).
2. **Facing on the page.** A model faces +Z. Front shows its face, and back its back. Side and three-quarter show it **facing the sketch's left**. A placed sketch's `flipped` (`PlacedSketch` in `@storystage/production`) turns it to face right. Setting the stage (10.10) reads facing and flip together.
3. **Style.** Black lines on a white shape, as a storyboard artist draws:
    - outer and silhouette lines 3 units wide; inner folds 1.5 units wide;
    - an inner fold is drawn where faces meet at more than 45°;
    - hidden lines are never drawn;
    - the white shape covers the model's whole outline, holes left open, so a sketch in front hides one behind on a frame;
    - see-through cards (hair, eyebrows, eyelashes) are drawn as one shape with one line around it, not edge by edge;
    - inner lines shorter than 4 units are left out, because on dense models they read as dirt.

    The longer side is 320 units, with a margin of 4 units.
4. **Each sketch carries its model's Backstage id** (`data-backstage-id` in the SVG), its facing and pose (`data-facing`, `data-pose`), and a title for screen readers in plain words ("Robot, side, walking"). Files sit at `sketches/<id>/<facing>[-<pose>].svg` in the Backstage folder. A backdrop's sketch is at `sketches/<id>/backdrop.svg`. Each item's `sketches` list in `backstage.json` records them.
5. **Poses** are set as directions for each limb segment in model space, not as joint turns, so one pose works on any rig, whether it rests in a T-pose or an A-pose. The skin follows on the CPU. Only the arms and legs move. The pose names are `POSES` in `@storystage/sketches`, and `pose: null` on a placed sketch means standing.
6. **Hand-made sketches** in the same style:
    - storyboard marks: speech bubble, thought bubble, movement arrow, camera move, text;
    - backdrop sketches: open ground, hills, trees, buildings, sea, room, night sky, day sky.

    A backdrop's sketch is chosen from words in its name and themes ("Forest floor" gives trees), unless `touch-up.json` names another.
7. **The touch-up list.** Each run writes `sketches/touch-up.md`. It flags sketches a person should look at:
    - **empty:** nothing shows;
    - **thin:** under 12 units across, such as a sign seen edge-on;
    - **busy:** lines more than 14 times the length of the sketch's outline box.

    It also lists Cast drawn without poses. A hand-drawn SVG in the same style can replace any sketch through `sketches/touch-up.json` (`overrides`: sketch file → replacement file). Later runs keep it.
8. **The renderer runs on the CPU, in plain TypeScript, with no GPU or browser API** (owner's decision, 25 Oct 2026, replacing "Babylon offscreen" in workplan 10.5). It projects the model, fills a depth buffer at twice the sketch's resolution, and draws open edges, silhouettes and folds where the depth buffer shows them, as vector lines. The same code runs in Node for `tools/make-sketches` and in a Web Worker for imports (section 5, 3.11). It gives the same SVG for the same model on every machine, so sketches can be tested and committed.
9. **Speed.** About 0.2 s per sketch on the owner's 4 GB development PC, for small models; models are reduced to the device budget first (section 4). A posable character's 16 sketches must take under 10 s on the reference Chromebook. That is checked in the device run with the first imported character (WP3i).

### How the tool is run

```
node tools/make-sketches/src/cli.ts <backstage folder> [--dry-run]
```

It reads `backstage.json`, which must validate, and every model it names. It writes the sketches, each item's `sketches` list and the touch-up list. It is re-run whenever WP3b adds models.

## 7a. Colour thumbnails

Each model's colour picture for Backstage's browse views (`files.thumbnail`, section 1). The code is `renderThumbnail` in `packages/sketches/src/thumbnail.ts`. Like the sketches, it is drawn on the CPU in TypeScript (owner, 25 Oct 2026), so the same code runs in the build and, for imports, in a Web Worker (section 5).

### Rules

1. **Front view, standing,** as the manifest says: a model that can be posed stands in the sketches' standing pose, arms down; anything else as modelled. Looked at square on, fitted to a 320-pixel square (a sketch's default size) with a small margin, on a clear background.
2. **Its own colours,** softly lit from the front, above and to the left, never darker than half its colour, so it reads on light and dark themes alike. The material's base colour, picture and vertex colours are used; unlit materials (`KHR_materials_unlit`, many VRM avatars) are drawn as they are. Masked parts are cut out, and see-through parts are drawn last, back to front.
3. **Smooth edges:** each pixel is the average of nine samples.
4. **The caller decodes pictures:** sharp in the build tools, as a devDependency only (section 4, rule 4), and the browser's own decoder in the app. A picture that can't be decoded is left out, and its material's plain colour stands in.
5. **The same model always gives the same picture.**
6. **The build writes it** as `thumbnails/<id>.webp` (`tools/backstage-sources`), about 5 to 7 KB each, and points `files.thumbnail` at it. Items not yet rebuilt keep their front sketch until they are.

## 8. Tests

How each rule in this spec is tested, and at which level (`09-testing.md`).

| Rule | Test | Level |
|---|---|---|
| 2a.1–2a.6: unique ids and words; parents in the same set; every VRM bone and only those flagged VRM; VRM's required set; an H-Anim joint for each humanoid joint; every joint Alice defines per class has a place; wrist and hand, ankle and foot folding; ring finger; shared face joints; extras and the model's own joints | `packages/backstage/src/joints.test.ts` | Unit (Vitest) |
| 2a.7 and mapping: normalising names; each convention maps its fixture with every required joint; the shoulder trap; numbered spines; Rigify's hips; wrist over hand; prop only with the missing joints listed; one bone per joint | `packages/backstage/src/skeleton-map.test.ts` | Unit (Vitest) |
| 3, pipelines: source lists refuse unshippable licences and unpinned sources; GitHub, .gltf packing, SHA-256 and Arweave fetching; models, a valid manifest, provenance and sketches built; other items kept | `tools/backstage-sources/src/sources.test.ts` | Unit (Vitest) |
| 3, pipelines: VRM bone tables read and VRM 0.x turned to face +Z | `packages/sketches/src/vrm.test.ts` | Unit (Vitest) |
| 3, pipelines: the people list checks assets, retired outfits and colours; MPFB2's dict and the source list | `tools/makehuman-export/src/people.test.ts`, `human-info.test.ts` | Unit (Vitest) |
| 3, pipelines: the Blender script | Run in the assets repository's CI; every person's render reviewed by eye, then by the owner | CI, manual |
| 3, pipelines: Alice's output turned to face +Z once, however often the step runs; class, section, triangles, textures and skeleton reported; prop only with the missing joints | `tools/convert-alice-models/src/finish.test.ts` | Unit (Vitest) |
| 3: the gallery list in the audit's appendix A comes from Alice's jars (the converter's `--list`) and StoryStage 1's names, with Sims 2 models and variants marked | `tools/convert-alice-models/src/gallery.test.ts` | Unit (Vitest) |
| 1 and 3.1–3.3: every item has a section, licence, credit, source and budget; shipped items carry only `SHIPPED_LICENCES`; `vrm` is "0" or "1"; a `description` is one line of at most 120 characters; the version must match | `validateManifest` (`packages/backstage/src/manifest.test.ts`) | Unit (Vitest) |
| 1: the shipped catalogue's builder writes each item's budget and VRM version | `tools/backstage-sources/src/sources.test.ts` | Unit (Vitest) |
| 3a.1–3a.4: credits grouped by section, empty ones left out; each model once, in order; licence name, deed link and page on each line; every Creative Commons licence linked; "changed for StoryStage" on changed CC BY models only, once | `packages/backstage/src/credits.test.ts` | Unit (Vitest) |
| 3a.4: the build marks a CC BY glTF model changed, and leaves a CC BY VRM file's credit as written | `tools/backstage-sources/src/sources.test.ts` | Unit (Vitest) |
| 4b.3–4b.5: a model's address, joints and VRM version; thumbnails, credits and catalogue from one manifest; escaped addresses; the manifest read once a session; plain errors when missing, damaged or out of date, retried next time; a class's imports after the shipped ones, credited but not in the catalogue | `packages/backstage/src/loader.test.ts` | Unit (Vitest) |
| 4b.2: the bundle check passes a matching folder, and refuses changed files, missing files, a stale Prompter catalogue and another manifest version; the lock is valid and pins this code's version | `tools/backstage-sources/src/bundle.test.ts` | Unit (Vitest) |
| 4b.1–4b.2: `pnpm backstage:fetch` fetches the pinned commit and it passes the check | Run by hand on 8 Nov 2026 (Windows); the release workflows run it | Manual, then CI |
| 4: the figures in one place and provisional; the scene check, counting every copy, estimating picture memory, warning in plain words | `packages/backstage/src/budget.test.ts` | Unit (Vitest) |
| 4.2–4.4: reduction to the budget keeping shape; skinned characters keep joints and weights; within budget left alone; textures shrunk to WebP with the encoder given, reported as not fitting without one; unused data dropped | `packages/backstage/src/optimize.test.ts` | Unit (Vitest) |
| 4.1–4.5: the build reduces a 40,000-triangle, 2,048 px model to a prop's budget with real sharp, records before and after, and reports it; a solid-colour texture becomes a plain colour; sharp's WebP shrinks to fit without enlarging, keeping see-through parts | `tools/backstage-sources/src/reduce.test.ts`, `sharp-encoder.test.ts` | Unit (Vitest) |
| 4.4: sharp is not among the app's dependencies | `pnpm licences` (CI): sharp's libvips is LGPL, so it would fail as linked | CI |
| 4a.1–4a.4: shipped models only, by section and class with exact ids; joint sets listed once; every section named; the same text whatever the order; three characters a token; 200 described people fit | `packages/backstage/src/catalogue.test.ts` | Unit (Vitest) |
| 1.5, 4a.5: descriptions are one line, at most 120 characters, with no skin colour or ancestry words, in source lists and `people.json`; the build writes them, `prompter-catalogue.txt` and its size | `packages/backstage/src/catalogue.test.ts`, `tools/backstage-sources/src/sources.test.ts`, `tools/makehuman-export/src/people.test.ts` | Unit (Vitest) |
| 7a.1–7a.5: square, centred, clear background; unlit colours exact in sRGB; soft light; pictures multiplied in, left out without a decoder or when they can't be decoded; masked parts cut out, see-through parts blended once; characters standing and fitted; the same picture every time; the reader's materials, pictures, UVs and vertex colours | `packages/sketches/src/thumbnail.test.ts` | Unit (Vitest) |
| 7a.4, 7a.6: sharp decodes pictures and writes WebP with alpha; the build writes `thumbnails/<id>.webp` and points `files.thumbnail` at it | `tools/backstage-sources/src/sharp-encoder.test.ts`, `sources.test.ts` | Unit (Vitest) |
| 7a: thumbnails of the shipped models look right | The owner's review of the assets pull request that adds them | Manual |
| 4: models within budget run at 30 fps on the reference Chromebook | Device run of spike 1.2 (#6), which also replaces the provisional figures | Device |
| 7.2–7.3: facings and their directions; a cube with no inner lines from the front and one fold at three-quarters; hidden lines; holes in the white shape; mirrored back; same SVG every time | `packages/sketches/src/render.test.ts` | Unit (Vitest) |
| 7.3: see-through cards drawn as one shape; short inner lines left out; cards read from glTF, unless the whole model is see-through | `packages/sketches/src/render.test.ts`, `gltf.test.ts` | Unit (Vitest) |
| 7.5: every limb points where its pose says, bone lengths kept; only full humanoids posed | `packages/sketches/src/pose.test.ts` | Unit (Vitest) |
| 7.1, 7.4, 7.6, 7.7: which sketches each item gets; file names and titles; marks and backdrop sketches; empty, thin and busy flags | `packages/sketches/src/library.test.ts` | Unit (Vitest) |
| Reading glTF: placed meshes, rigged models in their rest pose, binary glTF | `packages/sketches/src/gltf.test.ts` | Unit (Vitest) |
| 7.4, 7.7 and the tool: sketches written and recorded in a manifest that still validates; touch-up list; hand-drawn replacements; dry run | `tools/make-sketches/src/make-sketches.test.ts` | Unit (Vitest) |
| 7.9: 16 sketches in under 10 s on the reference Chromebook | Device run with the first imported character (WP3i) | Device |
| Every shipped model loads in Babylon.js with its mapped joints (WP3 done-when) | With the first shipped models (WP3b) | Integration, in CI |
