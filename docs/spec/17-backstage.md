# 17 Backstage

- **Covers:** Manifest, sections, sources and licences, budgets, the import pipeline, licence capture, in-app sketches
- **Work package:** WP3
- **Owner:** S4
- **Status:** sections 2a (the joint map, WP3.3) and 3 (sources and licences, WP3.1) written 25 Oct 2026. The other sections are written before the code they govern: 1 and 4 with WP3c, 2 with 3.10, 5 to 7 with WP3i.

## 0. Decisions this spec relies on

[0007 3D](../decisions/0007-3d.md), [0008 Models](../decisions/0008-models.md), [0013 Backstage](../decisions/0013-backstage.md), [0025 Licence](../decisions/0025-licence.md); and from the settled table in `docs/decisions.md`: Backstage sources, Import into Backstage, Storyboard sketches (all 18 Oct 2026).

## 1. Manifest

_To be written._

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
    - Anything drawn from The Sims 2's art (WP17.7), including two Bamboo variants in Alice's own gallery.
    - Quaternius, whose licence forbids redistribution as an asset pack.
    - Mixamo and general Sketchfab.

A change to a source's verdict changes the audit first, then the manifest.

## 4. Budgets

_To be written._

## 5. The import pipeline

_To be written._

## 6. Licence capture

_To be written._

## 7. In-app sketches

_To be written._

## 8. Tests

How each rule in this spec is tested, and at which level (`09-testing.md`).

| Rule | Test | Level |
|---|---|---|
| 2a.1–2a.6: unique ids and words; parents in the same set; every VRM bone and only those flagged VRM; VRM's required set; an H-Anim joint for each humanoid joint; every joint Alice defines per class has a place; wrist and hand, ankle and foot folding; ring finger; shared face joints; extras and the model's own joints | `packages/backstage/src/joints.test.ts` | Unit (Vitest) |
| 2a.7 and mapping: normalising names; each convention maps its fixture with every required joint; the shoulder trap; numbered spines; Rigify's hips; wrist over hand; prop only with the missing joints listed; one bone per joint | `packages/backstage/src/skeleton-map.test.ts` | Unit (Vitest) |
| 3: the gallery list in the audit's appendix A comes from StoryStage 1's sources, with Sims 2 variants marked | `tools/convert-alice-models/src/gallery.test.ts` | Unit (Vitest) |
| 3.1–3.3: every shipped item has an allowed licence, a credit and a source | `validateManifest` (`packages/backstage/src/manifest.test.ts`); refusing SA and NC in shipped items comes with WP3c | Unit (Vitest) |
| Every shipped model loads in Babylon.js with its mapped joints (WP3 done-when) | With the first shipped models (WP3b) | Integration, in CI |
