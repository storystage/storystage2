# The storybook cast: shortlist, sources and brief (WP3.6)

- **Status:** S4, 14 Nov 2026. **The owner's decisions of 14 Nov:** the 20 below, **no budget (£0)**: each character comes from open models or Alice 3's own, not a commission. Section 3 says where each one comes from; section 5 lists the gaps. **Also 14 Nov:** the five KayKit characters go in now (backstage-assets, `sources/storybook.json`); CMU has replied and is taking legal advice, so Alice 3's seven are converted for internal testing only, marked as waiting for CMU (section 3); the owner asked for the Sketchfab finds to be checked (section 3a).
- **Workplan:** 3.6 (C drafts the brief and shortlist; U decides). Every character still needs its **17.8** decision (`docs/legal/storybook-characters.md`, PR #54). With no commission, 17.9's contract (PR #55) is needed only if someone makes a character for us (section 5). The schedule has WP3d at weeks 5 to 9 (forecast 9 Nov to 18 Jan).
- **Specs it relies on:** 17-backstage §2a (the joint map, `packages/backstage/src/joints.ts`), §3 (licences: CC0 and CC BY ship; Alice 3's models and anything made for us ship as `licence: "permission"` with a record in `docs/legal/permissions/`), §4 (budgets) and §5 (the import report); 02-story-api rules 4.6 and 6 (faces are the model's own VRM expressions); the WP4c clip decision (KayKit's walk, run, sit and the rest, retargeted onto VRM bones; wave, nod, shrug, clap, point and fall written in code).

## 1. What the cast is for

The storybook cast is the recognisable hook (design.md): characters a child already knows, so the first film starts with a story rather than a search. The curriculum mapping (WP16a) says where they're used:

- **Traditional tales** (`ARC-TALE`, ages 6–11): retelling a tale is England's Y1–UKS2 and Northern Ireland's KS1–KS2 reading statements.
- **Myths, legends and quests** (`ARC-MYTH`, ages 8–13): 13 statements, 10 of them strong. Greek myths, Beowulf, the Mabinogion, Fionn mac Cumhaill, Anansi, King Arthur.
- **A scene from a play** (`ARC-SCENE`, ages 9–13): 15 statements, 11 strong. Drama and Shakespeare.
- **Stories with characters, settings and plot** (theme 2, every nation): a famous detective or outlaw gives a plot to borrow.

Each nation should find its own stories, not only England's.

## 2. The shortlist (20; the owner, 14 Nov 2026)

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
| 18 | **Anansi** | 2 | To agree with the reviewer (section 8.6) | `ARC-MYTH`; Akan and Caribbean tradition | Include with care: **a cultural review before acceptance** | The oral tradition. Never recent picture books or cartoons |
| 19 | **A selkie** | 2 | Biped (VRM), with a sealskin as the model's own joints | `ARC-MYTH`; **Scotland** | Include | The folklore |
| 20 | **Puck** | 2 | Biped (VRM), child-sized | `ARC-SCENE`; Shakespeare, KS2–3 | Include | Victorian illustrations |

**Balance:** of the 18 two-legged characters, 3 are children or child-sized (Alice, Red Riding Hood, Puck), and 6 are female: Alice, Red Riding Hood, Marian, Branwen, Medusa and the selkie. Skin tones follow the sources: Anansi's tradition, and the Greek and medieval figures, shouldn't all come out pale by default. The MakeHuman people (3.5) cover everyday variety.

**Left off, and why:**
- Odysseus, Perseus, Cú Chulainn, Gelert and the Children of Lir: wave 3 if wanted. Cú Chulainn needs care in Northern Ireland (17.8).
- Long John Silver, Oz, Pinocchio, the Jungle Book, Mr Toad and Dracula: book characters, not the four arcs' core. Several need register checks.
- Macbeth's witches: a strong `ARC-SCENE` choice, and one model could serve all three. Swap it for Puck or Watson if the owner prefers.
- Pooh, Peter Rabbit, Peter Pan and every character still in copyright: out (17.8).

## 3. Where each character comes from

Three places, in order of preference:

- **Alice 3's own models,** which CMU's letter (17.1, sent 8 Nov 2026) asks to convert and ship. **CMU has replied and is taking legal advice internally** (the owner, 14 Nov 2026). Until CMU agrees in writing, they're for **internal testing only**: converted by the converter (3.2), kept out of every public repository and the shipped Backstage, and opened in the studio as a private model pack (17-backstage §5) whose records say "Alice 3 gallery model: CMU's approval outstanding" and whose licence is "not sure", so the studio flags them and the exports refuse them. When CMU agrees, they ship as `licence: "permission"`; if CMU says no, these rows fall back to the next column.
- **CC0 models already in the shipped Backstage,** mostly KayKit's adventurers, which fit a character's type. Each becomes the character by its name, its description for the Prompter, and which of the model's own parts it keeps (King Arthur without the helmet, Fionn without the bear hood and five metres tall). KayKit's textures are one picture per model, so a different colour would mean a new picture; learners can still paint them on the stage. KayKit's weapons stay out, as for the KayKit list.
- **CC BY models found on Sketchfab,** case by case. Each is checked like the museum scans (3.7): its own page says CC BY or CC0; it isn't a copy of a film, game or modern book version (17.8's rules apply to found models too); it's rigged, or can be; and it fits the Cast budget once reduced. Searched 14 Nov 2026: most named storybook characters there are fan copies of films (Disney's 1973 Robin Hood animals, for example), which are out whatever their tag says, or unrigged statues. Generic types (Vikings, knights, medieval women) are easier to find.

| # | Character | Alice 3 (when CMU agrees) | Shipped CC0 today | Found CC BY (to check) | Status |
|---|---|---|---|---|---|
| 1 | Alice | `Alice` (Wonderland variant) | — | — | **Alice 3.** Check its dress against 17.8's rule (not Disney's blue dress, white pinafore and black hairband) |
| 2 | The White Rabbit | `WhiteRabbit` | — | — | **Alice 3** |
| 3 | Little Red Riding Hood | — | A MakeHuman child, without the hood (the CC0 pack has no headwear) | **leafar112's**, CC BY, made for a children's AR app, 11,596 triangles, **not rigged** (section 3a) | **Gap** until it's rigged |
| 4 | The Wolf | `BigBadWolf` (on two legs, the storybook wolf) and `Wolf` (on four) | — | — | **Alice 3** |
| 5 | Robin Hood | — | **KayKit `rogue-hooded`**, in its own green hood and cloak (`storybook/Biped/robin-hood`) | — | **CC0, in now** |
| 6 | Sherlock Holmes | — | — | None usable: statues, a teddy, a cartoon dog, and a blank grey figure | **Gap** |
| 7 | King Arthur | — | **KayKit `knight`**, without the helmet (`storybook/Biped/king-arthur`) | — | **CC0, in now** |
| 8 | Merlin | — | **KayKit `mage`**, a young wizard (`storybook/Biped/merlin`) | — | **CC0, in now** |
| 9 | Beowulf | — | **KayKit `barbarian`**, in the bear hood (`storybook/Biped/beowulf`) | "Viking (lowpoly)", slagperch3d, CC BY, rigged (section 3a) | **CC0, in now** |
| 10 | Fionn mac Cumhaill | — | **KayKit `barbarian`**, without the hood, 5 m tall (`storybook/Biped/fionn-mac-cumhaill`) | — | **CC0, in now** |
| 11 | Branwen | `Freya` would do in a pinch, but she's a Norse goddess | — | None suitable (section 3a) | **Gap** |
| 12 | The dragon | `Dragon` (10 colours) | — | — | **Alice 3** |
| 13 | The Mad Hatter | `MadHatter` | — | — | **Alice 3** |
| 14 | Dr Watson | — | A MakeHuman man in a suit, without the bowler | — | **Gap** |
| 15 | Maid Marian | — | — | The ones found are copies of Disney's 1973 film: out | **Gap** |
| 16 | Grendel | `Troll` or `Ogre` | KayKit's skeletons are the wrong story | — | **Alice 3** (a stand-in design) |
| 17 | Medusa | — | — | None: the Medusas found are statues or game skins, and "Greek Woman" (JoseGP3D, CC BY) has no snakes and is realistic | **Gap** |
| 18 | Anansi | — | — | None | **Gap**, and the cultural review stays (section 8.6) |
| 19 | A selkie | — | — | None | **Gap** |
| 20 | Puck | `Pixie` (3 variants) | — | — | **Alice 3** |

**Totals:**
- 5 go in now from CC0 KayKit models: Robin Hood, Arthur, Merlin, Beowulf, and Fionn on Beowulf's model.
- 7 come from Alice 3: internal testing now, shipping if CMU agrees. They are Alice, the White Rabbit, the Wolf, the dragon, the Mad Hatter, Grendel and Puck.
- 8 are gaps: Red Riding Hood, Holmes, Branwen, Watson, Marian, Medusa, Anansi and the selkie.

**Alice 3 has more storybook characters** than the shortlist, and they'd come with the same yes from CMU: the Queen of Hearts, the Cheshire Cat, the March Hare and the playing cards (the rest of Wonderland); a Witch (Macbeth's three, for `ARC-SCENE`); a Pig (the three little pigs); and Thor, Odin, Loki, Freya, Skadi and a Valkyrie (Norse myths, which KS2 teaches with the Vikings). The Monkey King, the Rakshasa, the Curupira and the Mapinguari come from living traditions, so each would need the same cultural review as Anansi.

## 3a. The Sketchfab finds, checked (14 Nov 2026)

Each from its own page through Sketchfab's public API, and its picture. Downloading needs a Sketchfab sign-in, so it goes through the owner's Chrome, with the owner's go for each file (as for the museum scans).

| Model | Licence | Size and rig | For | Verdict |
|---|---|---|---|---|
| "Old Village Granny", Imagineis (2025) | CC BY | 617 triangles, hand-painted, low-poly cartoon. **Its own rig maps none of the required joints** (unnamed bones, no feet, IK handles), so it needs Mixamo too | **Red Riding Hood's grandmother** (not on the shortlist) | **Take it,** once rigged: child-friendly, its own design. Downloaded 14 Nov (the original GLB) |
| "Capuchinho Vermelho (Little Red Riding Hood)", leafar112 (2023) | CC BY, and Sketchfab's **NoAI** flag (not to be used to train or feed generative AI; StoryStage does neither with models, and the Prompter is sent only the catalogue's words) | 11,596 triangles, **not rigged** | Red Riding Hood | **The best Red Riding Hood found,** made for a children's AR app. Downloaded 14 Nov (the original FBX). Needs a skeleton first (section 5) |
| "Viking (lowpoly)", slagperch3d (2024) | CC BY | 2,520 triangles, rigged with Mixamo, 7 clips | A second Viking or Beowulf | **Optional.** KayKit's Beowulf already covers it; its horned helmet is a later invention |
| "Red riding hood #StorybookChallenge", ahmed_jlil_ | CC BY | 11,151 triangles, a whole scene, not rigged | Red Riding Hood | Out: the character is small in a forest scene, and unrigged |
| "Red Riding Hood", iamjohnhult; "Red Riding Hood and iWolf", berkgedik | CC BY | 30,670 and 27,550 triangles | Red Riding Hood | Out: an older Red out for revenge, and one the wolf has taken over. Not for 6 to 9 year olds |
| "Little Red Riding Hood", "Robin Hood", "Maid Marian" and others, ThisIsntAPerson | Tagged CC BY | — | — | **Out:** taken from the *Disney Magic Kingdoms* game, so not the uploader's to license |
| "Medieval warrior girl" 1 and 2, asset_for_games | CC BY | 18,384 and 15,983 triangles, rigged (FBX) | Branwen | Out: one has anime cat ears and swords, the other is dressed for adults |
| "Greek Woman", JoseGP3D | CC BY | 32,524 triangles, rigged (FBX), realistic | Medusa | Out for Medusa (no snakes); a realistic style beside cartoon casts |
| "Celt, rigged", Andywoodhead | CC BY | 124,012 triangles, FBX, realistic, bare-chested with a sword | Fionn | Out: KayKit's giant covers Fionn in the cast's style |
| "Stylized viking (rigify rig)", slagperch3d | CC BY | 45,888 triangles | Beowulf | Out: it bundles another maker's course assets, whose licence isn't stated |
| "Sherlock", doctorholmes | CC BY | 3,958 triangles | Holmes | Out: a blank grey figure |

## 4. What a found model must meet

1. **Licence:** CC0 or CC BY 3.0 or 4.0, from the model's own page, recorded with its URL (17-backstage §3). Never CC BY-SA, NC or ND, and never a page that says nothing. Alice 3's models need CMU's permission record.
2. **Rights:** 17.8's rules, as for a made character. A model that copies a film, game or modern illustration is out, whatever its tag says. The uploader can't license what isn't theirs.
3. **Skeleton:** the import report maps all the required joints (17-backstage §2a). A model that maps fewer is prop only, which isn't enough for a cast member.
4. **Budget:** within the Cast budget once reduced (20,000 triangles, a 1,024 px texture). The build's renders show whether reduction spoiled it.
5. **Faces:** a VRM's expressions, or a `jaw` bone, are a bonus, not a requirement. A model without them doesn't change expression (02-story-api rule 6).
6. **Style:** close enough to the rest of the cast that they can share a scene. With no commission, one style isn't possible. Alice 3's models share one style, and KayKit's share another.

## 5. The gaps, at no cost

There were eight gaps: Red Riding Hood, Holmes, Branwen, Watson, Marian, Medusa, Anansi and the selkie. Red Riding Hood was rigged (item 5), and the other seven are made from parts (item 6). The ways to fill a gap, cheapest first:

1. **A stand-in until a source turns up** (WP10.9). A learner's storyboard can still name Holmes, and the stage shows a stand-in. This is what happens by default.
2. **Keep looking.** S4 checks new CC0 and CC BY uploads against section 4 with each Backstage refresh, and the owner can suggest finds.
3. **A college or university course takes the brief** (section 8) as a student project. Students get a real client and a credit in every film; the project gets characters under 17.9's contract. It costs nothing but the owner's time to find a course and review the work. It's the only free way to one consistent style.
4. **Make them in MakeHuman** once its community has CC0 costumes (hoods, hats, long dresses). It hasn't today (searched 10 Nov 2026).
5. **Rig a good unrigged find.** Mixamo didn't work, so the assets repository's **Rig found characters** workflow does it in Blender, headless (`tools/backstage-sources/blender/autorig.py`; #401, backstage-assets#14): it finds the joints from a T-pose model's shape, makes a skeleton with our joint names and binds it. Blender is a GPL build tool, never linked into the app. Red Riding Hood and the Granny (section 3a) were the first two, shipped 15 Nov (#403).
6. **Make them from KayKit's parts** (the owner's choice of 15 Nov 2026, after Sketchfab, the 300 100Avatars and Alice 3's gallery had none of them): the build recolours a KayKit character and hangs simple shapes on it (`kitbash`, spec 17 §3). Maid Marian, Branwen, Medusa, the selkie, Holmes, Watson and Anansi are made this way, in the cast's own style. Anansi follows the owner's reference photo of an Anansi costume: a man in orange, red, purple and blue, with a striped headwrap, a beaded collar and eight striped spider legs arching from his back to the ground (the owner: "Spider people must have eight legs!"). His cultural review (17.8) still comes before he ships.

## 6. What S4 does next

- **Done (#386, backstage-assets#13; shipped by #403, 15 Nov):** Robin Hood, King Arthur, Merlin, Beowulf and Fionn in the shipped Backstage, under the `storybook` source, each credited to KayKit, with the theme `storybook`.
- **Done 15 Nov, for internal testing:** the Alice 3 characters, converted (3.2) with Alice 3.9 and imported as a class import would be, in a private model pack kept outside every repository: Alice, the White Rabbit, the Big Bad Wolf, the Wolf, the dragon, the Mad Hatter, the Troll, the Ogre and the Pixie. Each has licence "not sure" and the note "Alice 3 gallery model: CMU's approval outstanding", so the studio flags them and films using them stay in school. The owner opens the pack from Settings, **Open models**. Each is checked against 17.8 before it ships, Alice's dress especially.
- **Done (#401, backstage-assets#14; shipped by #403, 15 Nov):** the Sketchfab finds (section 3a), Red Riding Hood and her Grandmother, downloaded through the owner's Chrome with the owner's go and rigged in Blender.
- **15 Nov, in review:** Maid Marian (a long crimson dress and a gold circlet; no earring and thinner eyebrows, as the owner asked), Branwen, Medusa, the selkie, Sherlock Holmes, Dr Watson and Anansi, made from KayKit's parts (section 5, item 6).
- **Done 15 Nov, for internal testing:** nine more Alice 3 characters in the private pack: the Queen of Hearts, the Cheshire Cat, the March Hare, the Monkey King, the Witch, Thor, Odin, Freya and Loki.
- **Every refresh:** look again for better models of any character.

## 7. Still for the owner

- **Alice 3.9 on a PC** for the converter, and where the private test pack is kept.
- **The Sketchfab downloads** in section 3a, and whether to rig Red Riding Hood with Mixamo.
- **CMU's answer,** when its legal advice is done, filed by D in 17.1's correspondence.
- **The seven made from parts:** whether each one ships, from its thumbnail and sketches in the assets pull request; Anansi's cultural review (17.8).
- **17.8's decisions** (PR #54), for every character that ships, including the register checks for Alice, Holmes and Merlin.

Sources searched on 14 Nov 2026: Sketchfab's public search (downloadable models, CC0 and CC BY); Alice 3's model list (`docs/legal/letters/cmu-models.csv`); the shipped Backstage (`backstage.json` in `storystage/backstage-assets`).

## 8. The brief, for anyone who makes a character for us

With no budget, nobody is commissioned. This section is for a volunteer, a college course or a later budget (section 5), and it's also the standard a found model is measured against (section 4). Whoever makes a character signs 17.9's contract, so the project can ship it.

### 8.1 The style

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
- **The style is agreed first, on two characters** (section 8.7): one biped and one quadruped, before the rest are made.

### 8.2 Originality and sources

From 17.8's rules, which the contract's warranty repeats:

- **Work only from the sources named for each character:** the original text, and illustrations whose illustrator died before 1956.
- **Keep a reference log** of every picture used, with its source and date. It's part of the delivery.
- **Never look at, trace or "refer to"** a film, TV, game or modern book version. If a design ends up close to a famous version anyway, change it (for example, Alice in a blue dress with a white pinafore and black hairband).
- **No logos, real brands or text** on clothes or props.

### 8.3 Files

| | Two-legged characters (17, and Anansi if agreed) | Animals (the Wolf, the dragon) |
|---|---|---|
| **Format** | **VRM 1.0** (`.vrm`), made in Blender with the VRM add-on (MIT) | **glTF 2.0 binary** (`.glb`) |
| **Skeleton** | The VRM humanoid bones. All 15 required ones; also the fingers, `jaw`, `leftEye` and `rightEye` | Our joint names (17-backstage §2a): `spineBase`, `spineMiddle`, `spineUpper`, `neck`, `head`, `jaw`, `leftEye` and `rightEye`; `frontLeftShoulder`, `frontLeftKnee` and so on to `backRightKnee`, with ankles, feet and toes; `pelvis`, then `tail` to `tail4`. The dragon adds `leftWingShoulder`, `leftWingElbow`, `leftWingWrist` and `leftWingTip`, and the same on the right |
| **Face** | **VRM expressions:** `happy`, `angry`, `sad`, `relaxed`, `surprised`, `blink`, `blinkLeft` and `blinkRight`, and the mouth shapes `aa`, `ih`, `ou`, `ee` and `oh`. **The `jaw` bone also opens the mouth,** for AR exports that can't carry morph targets and for later lip sync driving the mouth joint (14.4) | The `jaw` bone opens the mouth; eyelid bones (`leftEyelid`, `rightEyelid`) close the eyes |
| **Extra parts** | Hair, a cape, the selkie's skin or Medusa's snakes may have their own bones, named plainly (`capeBase`, `snake1`) | Ears (`leftEar`), a tongue (`tongue`) if wanted |

- **The rest pose:** a T pose or A pose, facing +Z (glTF's forward), feet on the ground at the origin, in metres at a believable height. Fionn and Grendel can be taller, and the stage can scale them.
- **Skinning:** at most 4 bone influences a vertex, and weights that bend cleanly at the elbows, knees and shoulders.
- **No animation is needed.** StoryStage plays its own shared clips on every humanoid (walk, run, sit, lie, stand up, pick up, idle, plus wave, nod, shrug, clap, point and fall, written in code). So the proportions must look right in them; section 4 checks this.

### 8.4 Budget per character

From 17-backstage §4, the Cast section. The figures are provisional until the reference devices are measured.

- **At most 20,000 triangles,** including hair, clothes and props held in the rest pose. Aim for 10,000–15,000: we can reduce a model, but a model built to budget looks better.
- **One texture set,** at most **1,024 × 1,024** px. We convert textures to WebP, so deliver PNG. Base colour is required; a normal map is optional.
- **At most 3 materials,** metal-roughness (glTF's standard).
- **A hand-held prop** (Holmes's pipe, a sword, the watch) is either part of the model or a separate `.glb` prop of at most 8,000 triangles. Separate is better if it should be put down.

### 8.5 What to deliver for each character

1. The `.vrm` or `.glb` file.
2. The Blender source (`.blend`) and the textures at full size.
3. A turnaround (front, side, back, three-quarter) and a sheet showing each expression.
4. The reference log (8.2).
5. A one-line credit, as the contract sets it ("Alice, designed by A. Artist for StoryStage").

### 8.6 Anansi, and figures from living traditions

Anansi is designed with a reviewer from the Akan or Caribbean tradition, chosen before work starts. The reviewer agrees:
- the form: a spider who acts as a man, a man with spider features, or a spider, which would need its own skeleton, since none of ours has eight legs;
- the clothes and setting.

The reviewer is paid and credited. The design isn't accepted without their sign-off (17.8). The teacher guide says how to tell a story from a living tradition with respect.

### 8.7 How a made character is accepted

1. **The automatic checks:** S4 imports the file into Backstage. The report must show:
   - all the required joints mapped (a humanoid's 15; a quadruped's spine base, head, shoulders, knees and hips);
   - within budget, with no reduction needed;
   - for a VRM, the expressions listed in 8.3.

   Anything less goes back to the artist with the report's own words.
2. **On stage:** S4 records the character standing, walking, running, sitting, waving and pointing, with each expression and the mouth open, from three sides. The owner looks at the recordings.
3. **The owner approves the art** against the brief and the reference log. Anansi also needs the reviewer's sign-off.
4. **Rights:** the contract is signed and its permission record is filed (`docs/legal/permissions/`, by D). Only then does the character enter the shipped Backstage, as `licence: "permission"`, with its credit line.

Alice and the Wolf would come first, as a test of the style, the files and these checks.
