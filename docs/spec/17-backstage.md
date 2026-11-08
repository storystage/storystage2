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
    - It writes the manifest items, `provenance.json` (every file fetched, with its SHA-256) and the sketches.
    - **VRM 0.x avatars face -Z.** The sketches turn them; the stage's loader must too (S3).
    - Before a build is merged, a person looks at each new item's sketches for respectful, age-appropriate representation.
- **Everyday people** (3.5, `tools/makehuman-export`):
    - `people.json` lists them, checked against MakeHuman's CC0 system pack. The owner reviews the list and then the renders.
    - A workflow in the assets repository runs Blender with MPFB2, headless. These are GPL build tools, never linked into the app; the people they make from CC0 assets are CC0.
    - Each person is rigged to the `game_engine` skeleton, which the joint map reads by its `unreal` convention.
    - **Colours change the texture's pixels,** because a shader tint would not survive glTF. An outfit's shirt and jeans share one texture, so denim is told apart by being blue and left alone.
    - **Only hair, eyebrows and eyelashes are see-through.** MPFB2's game material marks everything see-through; the script makes the rest solid.
    - Textures are shrunk to 1024 pixels here. Triangles (33,000 to 47,000 each) are reduced in WP3c.
- **Where Backstage's files live** (owner's decision, 25 Oct 2026): the public repository `storystage/backstage-assets`. It holds the shipped glTF files, `backstage.json`, the sketches and each item's provenance. A GitHub Actions job there downloads the CC0 sources, converts them and commits the results, so nothing large is fetched to a developer's PC. The MakeHuman people are made there too, headless, with MPFB2 in Blender (owner's decision, 25 Oct 2026). Both tools are GPL and are build tools only (CLAUDE.md, rule 8).

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
    - drop what nothing uses;
    - replace a texture of one solid colour with a plain colour on its material;
    - join duplicate corners;
    - only if the model is over its triangle budget, simplify its meshes with meshoptimizer. Simplifying starts gently (the surface moves at most 0.5% of the model's size) and allows more (up to 10%) only as far as the budget needs. It keeps a subset of the original corners, so a character's joints and weights carry over unchanged.
3. **Textures are shrunk to the budget and made WebP** (owner, 7 Nov 2026), and the file then requires `EXT_texture_webp`. Babylon.js and every target browser read it.
4. **The encoder is passed in.** The build tools use sharp, as a devDependency only, because sharp bundles libvips under the LGPL (CLAUDE.md, rule 8). A pnpm override keeps sharp out of the app's dependencies (`pnpm-workspace.yaml`). The import worker will use the browser's own canvas (WP3i). Without an encoder, textures are left as they are and the model is reported as not fitting.
5. **VRM files are measured, not reduced,** because they are kept byte for byte (section 1). The build report flags any over budget.
6. **A scene over budget gets a plain-words warning** for the learner (`checkScene`): "This scene may be slow on a school Chromebook: it has a lot of detail. Try fewer models, or simpler ones." Nothing is refused.

## 5. The import pipeline

_To be written._

## 6. Licence capture

_To be written._

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
| 4: the figures in one place and provisional; the scene check, counting every copy, estimating picture memory, warning in plain words | `packages/backstage/src/budget.test.ts` | Unit (Vitest) |
| 4.2–4.4: reduction to the budget keeping shape; skinned characters keep joints and weights; within budget left alone; textures shrunk to WebP with the encoder given, reported as not fitting without one; unused data dropped | `packages/backstage/src/optimize.test.ts` | Unit (Vitest) |
| 4.1–4.5: the build reduces a 40,000-triangle, 2,048 px model to a prop's budget with real sharp, records before and after, and reports it; a solid-colour texture becomes a plain colour; sharp's WebP shrinks to fit without enlarging, keeping see-through parts | `tools/backstage-sources/src/reduce.test.ts`, `sharp-encoder.test.ts` | Unit (Vitest) |
| 4.4: sharp is not among the app's dependencies | `pnpm licences` (CI): sharp's libvips is LGPL, so it would fail as linked | CI |
| 4: models within budget run at 30 fps on the reference Chromebook | Device run of spike 1.2 (#6), which also replaces the provisional figures | Device |
| 7.2–7.3: facings and their directions; a cube with no inner lines from the front and one fold at three-quarters; hidden lines; holes in the white shape; mirrored back; same SVG every time | `packages/sketches/src/render.test.ts` | Unit (Vitest) |
| 7.3: see-through cards drawn as one shape; short inner lines left out; cards read from glTF, unless the whole model is see-through | `packages/sketches/src/render.test.ts`, `gltf.test.ts` | Unit (Vitest) |
| 7.5: every limb points where its pose says, bone lengths kept; only full humanoids posed | `packages/sketches/src/pose.test.ts` | Unit (Vitest) |
| 7.1, 7.4, 7.6, 7.7: which sketches each item gets; file names and titles; marks and backdrop sketches; empty, thin and busy flags | `packages/sketches/src/library.test.ts` | Unit (Vitest) |
| Reading glTF: placed meshes, rigged models in their rest pose, binary glTF | `packages/sketches/src/gltf.test.ts` | Unit (Vitest) |
| 7.4, 7.7 and the tool: sketches written and recorded in a manifest that still validates; touch-up list; hand-drawn replacements; dry run | `tools/make-sketches/src/make-sketches.test.ts` | Unit (Vitest) |
| 7.9: 16 sketches in under 10 s on the reference Chromebook | Device run with the first imported character (WP3i) | Device |
| Every shipped model loads in Babylon.js with its mapped joints (WP3 done-when) | With the first shipped models (WP3b) | Integration, in CI |
