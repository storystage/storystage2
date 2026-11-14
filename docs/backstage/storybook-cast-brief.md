# The storybook cast: shortlist, design brief and budget (WP3.6)

- **Status:** draft by S4, 14 Nov 2026. **The owner decides** the shortlist, the budget and how to commission (section 5). Nothing is commissioned yet.
- **Workplan:** 3.6 (C drafts the brief and shortlist; U decides the budget and commissions). It needs **17.8**, the rights check (`docs/legal/storybook-characters.md`, PR #54, a decision per character), and **17.9**, the contract template (PR #55, which needs legal advice). The schedule has WP3d at weeks 5 to 9 (forecast 9 Nov to 18 Jan).
- **Specs it relies on:** 17-backstage §2a (the joint map, `packages/backstage/src/joints.ts`), §3 (licences: a commissioned character ships as `licence: "permission"` with a record in `docs/legal/permissions/`), §4 (budgets) and §5 (the import report); 02-story-api rules 4.6 and 6 (faces are the model's own VRM expressions); the WP4c clip decision (KayKit's walk, run, sit and the rest, retargeted onto VRM bones; wave, nod, shrug, clap, point and fall written in code).

## 1. What the cast is for

The storybook cast is the recognisable hook (design.md): characters a child already knows, so the first film starts with a story rather than a search. The curriculum mapping (WP16a) says where they're used:

- **Traditional tales** (`ARC-TALE`, ages 6–11): retelling a tale is England's Y1–UKS2 and Northern Ireland's KS1–KS2 reading statements.
- **Myths, legends and quests** (`ARC-MYTH`, ages 8–13): 13 statements, 10 of them strong. Greek myths, Beowulf, the Mabinogion, Fionn mac Cumhaill, Anansi, King Arthur.
- **A scene from a play** (`ARC-SCENE`, ages 9–13): 15 statements, 11 strong. Drama and Shakespeare.
- **Stories with characters, settings and plot** (theme 2, every nation): a famous detective or outlaw gives a plot to borrow.

Each nation should find its own stories, not only England's.

## 2. The proposed shortlist (20)

From the Include and Include-with-care rows of the rights check. **Wave 1** (12) is enough for every arc template and every nation. **Wave 2** (8) fills each story out to a full scene.

| # | Character | Wave | Class and joints | For | Rights (17.8) | Notes for the design |
|---|---|---|---|---|---|---|
| 1 | **Alice** | 1 | Biped (VRM) | Stories; KS2 | Include with care; register check on "Alice in Wonderland" | Tenniel's *Nursery "Alice"* colours (a yellow dress, blue stockings), never Disney's blue dress, white pinafore and black hairband |
| 2 | **The White Rabbit** | 1 | Biped (VRM), with ears | Stories | Include | Tenniel: waistcoat, pocket watch |
| 3 | **Little Red Riding Hood** | 1 | Biped (VRM), child | `ARC-TALE`, ages 6–9 | Include with care | Walter Crane's illustrations |
| 4 | **The Wolf** | 1 | Quadruped | `ARC-TALE`; also Peter and the Wolf, Aesop | Include with care | Crane; a wolf that walks on four legs, so it fits the quadruped clips. Speaks, so it needs a mouth |
| 5 | **Robin Hood** | 1 | Biped (VRM) | Stories; England | Include | Howard Pyle's illustrations. Never Disney's fox |
| 6 | **Sherlock Holmes** | 1 | Biped (VRM) | Stories; mystery plots | Include, **subject to the register check** | Paget's *Strand* drawings: deerstalker, Inverness cape |
| 7 | **King Arthur** | 1 | Biped (VRM) | `ARC-MYTH`; England and Wales | Include | Medieval sources, Rackham |
| 8 | **Merlin** | 1 | Biped (VRM), older | `ARC-MYTH`; Wales | Include; check MERLIN in class 41 | Beardsley or Rackham. Never Disney's or the BBC's |
| 9 | **Beowulf** | 1 | Biped (VRM) | `ARC-MYTH`, KS2–3 | Include | Sutton Hoo helmet and Anglo-Saxon objects |
| 10 | **Fionn mac Cumhaill** | 1 | Biped (VRM), a giant (scaled) | `ARC-MYTH`; **Northern Ireland and Scotland** | Include | The Giant's Causeway legend |
| 11 | **Branwen** | 1 | Biped (VRM) | `ARC-MYTH`; **Wales** | Include | The Mabinogion; Lady Charlotte Guest's translation |
| 12 | **The dragon** | 1 | Quadruped with wings | St George (**England**), Beowulf's dragon, the red dragon of Wales | Include | Medieval art. Wings from the extra joints, so it walks like a quadruped and flies |
| 13 | **The Mad Hatter** | 2 | Biped (VRM) | Stories | Include with care | Tenniel. Never the 2010 film's look |
| 14 | **Dr Watson** | 2 | Biped (VRM) | Mystery plots (Holmes needs someone to explain to) | As Holmes | Paget |
| 15 | **Maid Marian** | 2 | Biped (VRM) | Stories | Include | Pyle |
| 16 | **Grendel** | 2 | Biped (VRM), large | `ARC-MYTH` | Include | From the poem only. Frightening enough for a story, not for a seven-year-old |
| 17 | **Medusa** | 2 | Biped (VRM), with snake hair on hair joints | `ARC-MYTH`; Greek myths, KS2 | Include | Ancient pottery and sculpture |
| 18 | **Anansi** | 2 | To agree with the reviewer (section 3.6) | `ARC-MYTH`; Akan and Caribbean tradition | Include with care: **a cultural review before acceptance** | The oral tradition. Never recent picture books or cartoons |
| 19 | **A selkie** | 2 | Biped (VRM), with a sealskin as the model's own joints | `ARC-MYTH`; **Scotland** | Include | The folklore |
| 20 | **Puck** | 2 | Biped (VRM), child-sized | `ARC-SCENE`; Shakespeare, KS2–3 | Include | Victorian illustrations |

**Balance:** of the 18 two-legged characters, 3 are children or child-sized (Alice, Red Riding Hood, Puck), and 6 are female: Alice, Red Riding Hood, Marian, Branwen, Medusa and the selkie. Skin tones follow the sources: Anansi's tradition, and the Greek and medieval figures, shouldn't all come out pale by default. The MakeHuman people (3.5) cover everyday variety.

**Left off, and why:**
- Odysseus, Perseus, Cú Chulainn, Gelert and the Children of Lir: wave 3 if wanted. Cú Chulainn needs care in Northern Ireland (17.8).
- Long John Silver, Oz, Pinocchio, the Jungle Book, Mr Toad and Dracula: book characters, not the four arcs' core. Several need register checks.
- Macbeth's witches: a strong `ARC-SCENE` choice, and one model could serve all three. Swap it for Puck or Watson if the owner prefers.
- Pooh, Peter Rabbit, Peter Pan and every character still in copyright: out (17.8).

## 3. The design brief (for the artist)

This section is what the artist receives, with the character list and the contract (17.9).

### 3.1 The style

- **One style for the whole cast,** so Alice and Beowulf can stand in the same scene. It should be stylised and readable, not realistic:
  - clear silhouettes, slightly large heads and hands, simple shapes;
  - hand-painted or flat colour textures, with no photo textures;
  - faces that read from across a classroom on a 1366 × 768 Chromebook screen.
- **It sits beside what's already in Backstage:**
  - KayKit's CC0 characters;
  - the 100Avatars VRMs;
  - the MakeHuman people.

  The cast doesn't have to match them, but shouldn't look like a different game.
- **Ages 6 to 14.** Villains (the Wolf, Grendel, the dragon, Medusa) are story-frightening, not horror. No blood, no weapons drawn in the rest pose.
- **The style is agreed first, on two characters** (section 4): one biped and one quadruped, before the rest are made.

### 3.2 Originality and sources

From 17.8's rules, which the contract's warranty repeats:

- **Work only from the sources named for each character:** the original text, and illustrations whose illustrator died before 1956.
- **Keep a reference log** of every picture used, with its source and date. It's part of the delivery.
- **Never look at, trace or "refer to"** a film, TV, game or modern book version. If a design ends up close to a famous version anyway, change it (for example, Alice in a blue dress with a white pinafore and black hairband).
- **No logos, real brands or text** on clothes or props.

### 3.3 Files

| | Two-legged characters (17, and Anansi if agreed) | Animals (the Wolf, the dragon) |
|---|---|---|
| **Format** | **VRM 1.0** (`.vrm`), made in Blender with the VRM add-on (MIT) | **glTF 2.0 binary** (`.glb`) |
| **Skeleton** | The VRM humanoid bones. All 15 required ones; also the fingers, `jaw`, `leftEye` and `rightEye` | Our joint names (17-backstage §2a): `spineBase`, `spineMiddle`, `spineUpper`, `neck`, `head`, `jaw`, `leftEye` and `rightEye`; `frontLeftShoulder`, `frontLeftKnee` and so on to `backRightKnee`, with ankles, feet and toes; `pelvis`, then `tail` to `tail4`. The dragon adds `leftWingShoulder`, `leftWingElbow`, `leftWingWrist` and `leftWingTip`, and the same on the right |
| **Face** | **VRM expressions:** `happy`, `angry`, `sad`, `relaxed`, `surprised`, `blink`, `blinkLeft` and `blinkRight`, and the mouth shapes `aa`, `ih`, `ou`, `ee` and `oh`. **The `jaw` bone also opens the mouth,** for AR exports that can't carry morph targets and for later lip sync driving the mouth joint (14.4) | The `jaw` bone opens the mouth; eyelid bones (`leftEyelid`, `rightEyelid`) close the eyes |
| **Extra parts** | Hair, a cape, the selkie's skin or Medusa's snakes may have their own bones, named plainly (`capeBase`, `snake1`) | Ears (`leftEar`), a tongue (`tongue`) if wanted |

- **The rest pose:** a T pose or A pose, facing +Z (glTF's forward), feet on the ground at the origin, in metres at a believable height. Fionn and Grendel can be taller, and the stage can scale them.
- **Skinning:** at most 4 bone influences a vertex, and weights that bend cleanly at the elbows, knees and shoulders.
- **No animation is needed.** StoryStage plays its own shared clips on every humanoid (walk, run, sit, lie, stand up, pick up, idle, plus wave, nod, shrug, clap, point and fall, written in code). So the proportions must look right in them; section 4 checks this.

### 3.4 Budget per character

From 17-backstage §4, the Cast section. The figures are provisional until the reference devices are measured.

- **At most 20,000 triangles,** including hair, clothes and props held in the rest pose. Aim for 10,000–15,000: we can reduce a model, but a model built to budget looks better.
- **One texture set,** at most **1,024 × 1,024** px. We convert textures to WebP, so deliver PNG. Base colour is required; a normal map is optional.
- **At most 3 materials,** metal-roughness (glTF's standard).
- **A hand-held prop** (Holmes's pipe, a sword, the watch) is either part of the model or a separate `.glb` prop of at most 8,000 triangles. Separate is better if it should be put down.

### 3.5 What to deliver for each character

1. The `.vrm` or `.glb` file.
2. The Blender source (`.blend`) and the textures at full size.
3. A turnaround (front, side, back, three-quarter) and a sheet showing each expression.
4. The reference log (3.2).
5. A one-line credit, as the contract sets it ("Alice, designed by A. Artist for StoryStage").

### 3.6 Anansi, and figures from living traditions

Anansi is designed with a reviewer from the Akan or Caribbean tradition, chosen before work starts. The reviewer agrees:
- the form: a spider who acts as a man, a man with spider features, or a spider, which would need its own skeleton, since none of ours has eight legs;
- the clothes and setting.

The reviewer is paid and credited. The design isn't accepted without their sign-off (17.8). The teacher guide says how to tell a story from a living tradition with respect.

## 4. How a character is accepted

1. **The automatic checks:** S4 imports the file into Backstage. The report must show:
   - all the required joints mapped (a humanoid's 15; a quadruped's spine base, head, shoulders, knees and hips);
   - within budget, with no reduction needed;
   - for a VRM, the expressions listed in 3.3.

   Anything less goes back to the artist with the report's own words.
2. **On stage:** S4 records the character standing, walking, running, sitting, waving and pointing, with each expression and the mouth open, from three sides. The owner looks at the recordings.
3. **The owner approves the art** against the brief and the reference log. Anansi also needs the reviewer's sign-off.
4. **Rights:** the contract is signed and its permission record is filed (`docs/legal/permissions/`, by D). Only then does the character enter the shipped Backstage, as `licence: "permission"`, with its credit line.

**The two-character test first.** Alice (biped) and the Wolf (quadruped) are commissioned first, as a paid test of the style, the files and these checks. They also show how long a character really takes. The other 18 follow only when both pass.

## 5. Budget and commissioning: the owner's decisions

**What a character costs.** I found no independent benchmark. Marketplace listings for a rigged, stylised game character (2026) run from about $100 to over $1,300. Custom VRM models with expressions run from about $300 to $1,600, and full commercial rights or an assignment of copyright often costs more. These are listing prices, not a survey. For one consistent style, an assignment of copyright and the checks above, I'd plan around:

| | Per character | 20 characters | Notes |
|---|---|---|---|
| **Lower** | £400 | £8,000 | One freelancer, simple stylised shapes, few revisions |
| **Middle** (recommended for planning) | £700 | £14,000 | One experienced freelancer or a small studio, two rounds of revisions |
| **Higher** | £1,200 | £24,000 | A studio, more detail and polish |

Plus:
- the Anansi reviewer's fee;
- legal advice on the contract (17.9).

Paying wave 1 (12) first spreads the cost.

**What the owner decides:**

1. **The shortlist:** the 20 above, or changes. Each character also needs its 17.8 decision (PR #54), including the register checks for Alice, Holmes and Merlin.
2. **The budget:** a figure for wave 1 and one for wave 2.
3. **Who makes them:**
   - one artist or studio for all of them (one style, recommended);
   - or several, with a style guide.
4. **When:** the two-character test can start once the contract (17.9) has had its legal advice, the two characters' 17.8 decisions are made, and an artist is chosen.

## 6. What S4 does next

- Turn the decisions into the brief's final character list. This file is the brief; section 3 goes to the artist as it stands.
- Accept each delivery (section 4), add it to `storystage/backstage-assets` with its credit and permission record, and update the lock.
- If 17.8 or 17.9 change a design rule, update section 3.2 to match.

Sources for section 5's prices: Fiverr's 2026 3D artist cost guide and character listings; VRM artists' published commission pages; VIVERSE's 2026 VTuber model pricing article. All were checked on 14 Nov 2026.
