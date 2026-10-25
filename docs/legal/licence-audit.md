# Backstage licence audit

- **Workplan:** WP3.1 (part of WP3a). **Spec:** `docs/spec/17-backstage.md`, section 3.
- **Owner:** S4 drafts; the owner signs off (WP3 done-when) and asks CMU (WP17.1).
- **Status:** draft for the owner's sign-off, 25 Oct 2026. Licences were checked on the sources' own pages on that date (links below).

Every candidate source for Backstage, with its licence, credit line and verdict. Appendix A lists every model in Alice's gallery. Item-level rows for the other sources are added to `backstage.json` as WP3b picks them: each item records its own licence, credit line and source URL (`packages/backstage/src/manifest.ts`), and the rules in section 2 apply to every one.

Verdicts:

- **Ship:** may go in the shipped catalogue, subject to the conditions given.
- **Ship per item:** only items whose own page shows an allowed licence.
- **Not yet:** may be converted for testing, but not shipped until the condition is met.
- **Don't ship:** not in the shipped catalogue. Learners may still import such files into their class if their teacher allows it (3.11, 3.12).

## 1. Sources

| Source | Licence (as checked) | What we'd take | Credit line in the manifest | Verdict | Conditions |
|---|---|---|---|---|---|
| **Alice's gallery**: 435 models, listed in appendix A | Alice 3 EULA, clause 5: the gallery "is contributed by Electronic Arts Inc." and is for personal, non-commercial and academic use only. CMU has not said which models CMU made or on what terms | Animals, props, scenery, vehicles, storybook characters; the joint vocabulary (which is not an asset, and is used regardless) | Set when CMU replies, for example "Abyssinian cat from Alice 3, Carnegie Mellon University" | **Not yet** | Ship only the models CMU confirms in writing, recorded in `docs/legal/` and given the manifest licence `permission` (WP17.1). Converting for testing and for spike 1.2 is allowed (workplan WP3, "Depends on"). Bamboo's two Sims 2 variants never ship (next row) |
| **The Sims 2 art**: the Alice 3 people, and two Bamboo variants marked `SIMS2` in StoryStage 1's source | Alice 3.0 Art Gallery Licence: use only "without modification" and only with programs written with Alice 3.0 | Nothing | — | **Don't ship** | StoryStage 2 meets neither condition. Only EA's written permission would change this (WP17.7, decision 0008) |
| **[MakeHuman](https://static.makehumancommunity.org/oldsite/faq/can_i_sell_models_created_with_makehuman.html)** | Exported models are CC0. Some assets inside MakeHuman (community add-ons) are CC-BY | Diverse rigged everyday people (3.5) | "<Name>, made with MakeHuman (CC0)" | **Ship** | The export pipeline (3.5) uses only assets that are themselves CC0, and records which assets each person uses. Any CC-BY asset is left out of the shipped set. The owner reviews the first set for respectful, varied representation |
| **Commissioned storybook cast** | Ours: the contract assigns copyright to the project | 12–20 public-domain characters (3.6) | "<Character> designed by <artist> for StoryStage" | **Ship**, once commissioned | Licence `permission`, citing the contract in `docs/legal/`. Designs come from public-domain text and illustrations only, with trade-mark checks (WP17.8) |
| **[Kenney](https://kenney.nl/support)** | CC0. No attribution needed; the Kenney logo is reserved | Rigged characters, props, scenery in glTF (3.7) | "<Model> by Kenney (CC0)" | **Ship** | Check the `License.txt` in each pack as it is downloaded. Don't use the Kenney logo. The Blocky and Mini character packs have no skeleton, so they are props or prop-only characters |
| **[KayKit](https://kaylousberg.itch.io/kaykit-adventurers)** (Kay Lousberg) | CC0, free and paid tiers alike. The page asks that unmodified copies not be resold | Rigged, animated characters (free tier: 5 Adventurers) and the free animation pack | "<Model> by Kay Lousberg, KayKit (CC0)" | **Ship** | Ship only inside StoryStage, never as a separate asset download. Paid tiers only if the owner buys them |
| **[100Avatars](https://github.com/toxsam/open-source-avatars)** (Polygonal Mind) | The 100Avatars series is CC0. The same registry has other CC0 collections and one CC-BY collection (VIPE Heroes) | Rigged humanoids in VRM (3.7) | "<Avatar> by Polygonal Mind, 100Avatars (CC0)" | **Ship** the 100Avatars series only | Leave out the other collections (CC-BY or linked to NFTs) unless the owner decides otherwise. Record each avatar's own licence entry from the registry |
| **[Poly Pizza](https://poly.pizza)** | Per model. The catalogue mixes CC0, CC-BY and other CC licences (SA, ND, NC variants) | Low-poly props and scenery | CC0: "<Model> by <author> (CC0), via Poly Pizza". CC-BY: "<Model> by <author>, CC BY <version>, via Poly Pizza" | **Ship per item**: CC0, or CC-BY 3.0 or 4.0 | Never CC-BY-SA, ND or NC in the shipped catalogue. ND forbids the simplification every model gets (3.9); SA would bind learners' exports; NC blocks distribution. Items are picked offline. The API needs an account and isn't used by the app (any in-app search waits for the DPIA, 3.12) |
| **[Poly Haven](https://polyhaven.com/license)** | CC0 for HDRIs, textures and models. Site logos, renders and text are not CC0; the API has separate terms | Skies, environment images, ground textures for Backdrops | "<Asset> by <author>, Poly Haven (CC0)" | **Ship** | Download the asset files themselves, never site images. Don't scrape; use the API only under its terms |
| **[ambientCG](https://docs.ambientcg.com/license/)** | CC0 | Ground and material textures for Backdrops | "<Asset> from ambientCG.com (CC0)" | **Ship** | None |
| **[Quaternius](https://quaternius.com/license.html)** (optional) | Quaternius Asset License: free for commercial use and needs no credit, but section 3(a) forbids redistributing the assets as an asset pack, stock file or template, or extracting and repackaging them. The version in force when the assets were obtained governs | Animated low-poly characters | — | **Don't ship** | Backstage is a library learners pick models from and export in AR packs and pathway exports (WP20, WP22), which comes close to what 3(a) forbids. Shipping needs Quaternius's written permission, or evidence that a pack was obtained under an earlier CC0 release. Needs the owner (section 3) |
| **Museum scans**: [Science Museum Group, Scottish Maritime Museum, University of Dundee](https://sketchfab.com/blogs/community/sketchfab-launches-public-domain-dedication-for-3d-cultural-heritage) on Sketchfab, and the Smithsonian's Open Access | CC0 per item, through Sketchfab's public-domain dedication for cultural organisations (2020) and Smithsonian Open Access. Other items from the same museums can carry other licences | Historical and scientific objects as props and sets (3.7) | "<Object>, <museum> (CC0)" | **Ship per item** | Only items whose own page shows CC0. Record the item URL and the date. Leave out items that note third-party rights. Usually needs simplifying (3.9) |
| **[Blender Studio](https://studio.blender.org/remixing/)** (optional, 3.8) | CC-BY, copyright Blender Foundation. Each asset page gives its version (older films CC BY 3.0, newer CC BY 4.0) | Two or three open-movie characters, if they simplify to the budget | "<Character> from <film> by Blender Studio, CC BY <version>" | **Ship per item**, only if 3.8 passes | Check each asset page for exceptions. The credit line is required and goes into every film that uses the character (WP11.4) |
| **Mixamo** | Adobe's terms forbid redistributing the raw files, and need an Adobe account | Nothing | — | **Don't ship** | Learners may import their own Mixamo files (3.11). The skeleton mapper reads Mixamo names (spec 17, section 2a) |
| **General Sketchfab** | Varies per model, including non-commercial | Nothing in the shipped catalogue | — | **Don't ship** | As for Mixamo: learner imports only, with the licence recorded (3.12) |

## 2. Rules for every shipped item

These apply to every row WP3b adds to `backstage.json`. They extend what `validateManifest` checks today (a licence, a credit and a source for every item; no "not sure" in a shipped item).

1. **Allowed licences for shipped items:** `CC0-1.0`, `CC-BY-3.0`, `CC-BY-4.0`, or `permission` with its record in `docs/legal/`. Never `CC-BY-SA-4.0`, `CC-BY-NC-4.0`, `not-sure`, or anything not on the list. (`own-work` is for learners' imports.) A follow-up contract change in WP3c makes `validateManifest` refuse SA and NC in shipped items too.
2. **A credit line for every item, CC0 included,** in the forms in section 1, so the About screen and film credits (WP11.4) name every maker.
3. **A source URL for every item,** pointing at the item's own page, not the source's home page, with the date it was retrieved.
4. **One record per item,** never per pack. A pack's licence is checked against each item's own licence file or page as it is added.
5. **Nothing from a "Don't ship" or "Not yet" row,** until the condition in section 1 is met and this audit is updated.

## 3. What the owner needs to do

- **Sign off this audit** (WP3 done-when).
- **Ask CMU** which of Alice's 435 gallery models CMU made and on what terms StoryStage 2 may ship, convert and let learners export them (WP17.1). Appendix A is the list to send. Until CMU replies, Alice models are for testing only.
- **Quaternius:** decide whether to ask Quaternius for written permission to ship in Backstage and allow learners' exports, or to leave it out. The recommendation is to leave it out: Kenney, KayKit and 100Avatars cover the same ground under CC0.
- **100Avatars:** confirm that only the 100Avatars series ships (recommended), or name other CC0 collections from the registry to add.

## Appendix A: Alice's gallery

Generated from a StoryStage 1 checkout by `node tools/convert-alice-models/src/list-gallery-cli.ts <storystage1> --write docs/legal/licence-audit.md`. Sources:

- `core/i18n/.../GalleryNames.properties`, which names every model in the installed gallery;
- the resource classes in `core/models`, which give the variants for the 340 models whose source StoryStage 1 has.

The other 95 come only with an Alice installation. The converter (3.2) reads their files.

- **Key** is provisional (`<class folder>/<name>`). The manifest id adds the gallery's theme folder (`Quadruped/Cat/AbyssinianCat`) when the converter reads the gallery tree (3.2).
- **Home section** follows the rules in workplan WP3: Alice's props are split between Props and Set item by item, with the owner reviewing borderline items (3.10).

<!-- alice-gallery -->

| # | Key | Name in Alice | Class | Home section | Variants | Ship? |
|---|---|---|---|---|---|---|
| 1 | `Aircraft/Biplane` | Biplane | Transport | props | 5 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 2 | `Aircraft/HangGlider` | HangGlider | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 3 | `Aircraft/Helicopter` | Helicopter | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 4 | `Aircraft/HotAirBalloon` | HotAirBalloon | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 5 | `Aircraft/SpaceShip` | SpaceShip | Transport | props | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 6 | `Aircraft/UFO` | UFO | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 7 | `Automobile/Ambulance` | Ambulance | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 8 | `Automobile/BoxTruck` | BoxTruck | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 9 | `Automobile/Bus` | Bus | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 10 | `Automobile/FireEngine` | FireEngine | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 11 | `Automobile/Hatchback` | Hatchback | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 12 | `Automobile/Humvee` | Humvee | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 13 | `Automobile/Limousine` | Limousine | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 14 | `Automobile/PickupTruck` | PickupTruck | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 15 | `Automobile/PoliceCar` | PoliceCar | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 16 | `Automobile/Sedan` | Sedan | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 17 | `Automobile/SportsCar` | SportsCar | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 18 | `Automobile/Taxi` | Taxi | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 19 | `Automobile/Towncar` | Towncar | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 20 | `Automobile/Van` | Van | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 21 | `Biped/Alice` | Alice | Biped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 22 | `Biped/Alien` | Alien | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 23 | `Biped/Bat` | Bat | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 24 | `Biped/BigBadWolf` | BigBadWolf | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 25 | `Biped/BlackCat` | BlackCat | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 26 | `Biped/Bunny` | Bunny | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 27 | `Biped/CheshireCat` | CheshireCat | Biped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 28 | `Biped/Curupira` | Curupira | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 29 | `Biped/Freya` | Freya | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 30 | `Biped/Ghost` | Ghost | Biped | cast | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 31 | `Biped/GoldenMonkey` | GoldenMonkey | Biped | cast | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 32 | `Biped/Hare` | Hare | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 33 | `Biped/IceSkater` | IceSkater | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 34 | `Biped/Loki` | Loki | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 35 | `Biped/MadHatter` | MadHatter | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 36 | `Biped/Mandril` | Mandril | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 37 | `Biped/Mapinguari` | Mapinguari | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 38 | `Biped/MarchHare` | MarchHare | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 39 | `Biped/MonkeyKing` | MonkeyKing | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 40 | `Biped/Odin` | Odin | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 41 | `Biped/Ogre` | Ogre | Biped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 42 | `Biped/Panda` | Panda | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 43 | `Biped/Pig` | Pig | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 44 | `Biped/Pixie` | Pixie | Biped | cast | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 45 | `Biped/PlayingCard` | PlayingCard | Biped | cast | 11 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 46 | `Biped/PumpkinHead` | PumpkinHead | Biped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 47 | `Biped/QueenOfHearts` | QueenOfHearts | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 48 | `Biped/Rakshasa` | Rakshasa | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 49 | `Biped/Skadi` | Skadi | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 50 | `Biped/Skeleton` | Skeleton | Biped | cast | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 51 | `Biped/SnowMan` | SnowMan | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 52 | `Biped/SnowWoman` | SnowWoman | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 53 | `Biped/StuffedTiger` | StuffedTiger | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 54 | `Biped/Thor` | Thor | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 55 | `Biped/Tortoise` | Tortoise | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 56 | `Biped/Troll` | Troll | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 57 | `Biped/Utahraptor` | Utahraptor | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 58 | `Biped/Valkyrie` | Valkyrie | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 59 | `Biped/WhiteRabbit` | WhiteRabbit | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 60 | `Biped/Witch` | Witch | Biped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 61 | `Biped/Yeti` | Yeti | Biped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 62 | `Biped/YetiBaby` | YetiBaby | Biped | cast | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 63 | `Fish/Arapaima` | Arapaima | Swimmer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 64 | `Fish/BlueTang` | BlueTang | Swimmer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 65 | `Fish/Carp` | Carp | Swimmer | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 66 | `Fish/ClownFish` | ClownFish | Swimmer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 67 | `Fish/PajamaFish` | PajamaFish | Swimmer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 68 | `Fish/Piranha` | Piranha | Swimmer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 69 | `Fish/Shark` | Shark | Swimmer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 70 | `Flyer/Bluebird` | Bluebird | Flyer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 71 | `Flyer/Chicken` | Chicken | Flyer | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 72 | `Flyer/Eagle` | Eagle | Flyer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 73 | `Flyer/Falcon` | Falcon | Flyer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 74 | `Flyer/Flamingo` | Flamingo | Flyer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 75 | `Flyer/Ostrich` | Ostrich | Flyer | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 76 | `Flyer/OstrichBaby` | OstrichBaby | Flyer | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 77 | `Flyer/Owl` | Owl | Flyer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 78 | `Flyer/Peacock` | Peacock | Flyer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 79 | `Flyer/Penguin` | Penguin | Flyer | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 80 | `Flyer/Phoenix` | Phoenix | Flyer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 81 | `Flyer/Raven` | Raven | Flyer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 82 | `Flyer/Seagull` | Seagull | Flyer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 83 | `Flyer/Toucan` | Toucan | Flyer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 84 | `MarineMammal/Dolphin` | Dolphin | Swimmer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 85 | `MarineMammal/Manatee` | Manatee | Swimmer | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 86 | `MarineMammal/Orca` | Orca | Swimmer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 87 | `MarineMammal/Walrus` | Walrus | Swimmer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 88 | `MarineMammal/WalrusBaby` | WalrusBaby | Swimmer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 89 | `Prop/AcaciaTree` | AcaciaTree | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 90 | `Prop/AdelaideBust` | AdelaideBust | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 91 | `Prop/AlienHelmet` | AlienHelmet | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 92 | `Prop/AncientTempleArch` | AncientTempleArch | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 93 | `Prop/AncientTempleBlock` | AncientTempleBlock | Prop | props or set | 16 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 94 | `Prop/AncientTempleIvy` | AncientTempleIvy | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 95 | `Prop/AncientTemplePiece` | AncientTemplePiece | Prop | props or set | 28 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 96 | `Prop/AncientTemplePillar` | AncientTemplePillar | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 97 | `Prop/AncientTempleTile` | AncientTempleTile | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 98 | `Prop/AncientTempleTreeStump` | AncientTempleTreeStump | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 99 | `Prop/AncientTempleWall` | AncientTempleWall | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 100 | `Prop/AncientTempleWell` | AncientTempleWell | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 101 | `Prop/Arm` | Arm | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 102 | `Prop/Armoire` | Armoire | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 103 | `Prop/Arrow` | Arrow | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 104 | `Prop/Arrows` | Arrows | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 105 | `Prop/Bamboo` | Bamboo | Prop | props or set | 10 | Never ship the Sims 2 variants (THICKET_DARK_GREEN, THICKET_LIGHT_GREEN; WP17.7). Others: Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 106 | `Prop/Banana` | Banana | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 107 | `Prop/BananaTree` | BananaTree | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 108 | `Prop/BaobabTree` | BaobabTree | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 109 | `Prop/BathSink` | BathSink | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 110 | `Prop/Bathtub` | Bathtub | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 111 | `Prop/BayLaurelTree` | BayLaurelTree | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 112 | `Prop/BedDouble` | BedDouble | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 113 | `Prop/BedSingle` | BedSingle | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 114 | `Prop/Bell` | Bell | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 115 | `Prop/BiotechStation` | BiotechStation | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 116 | `Prop/BirchTree` | BirchTree | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 117 | `Prop/BonePile` | BonePile | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 118 | `Prop/BonsaiTree` | BonsaiTree | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 119 | `Prop/Bookcase` | Bookcase | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 120 | `Prop/Boulder` | Boulder | Prop | props or set | 15 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 121 | `Prop/Bow` | Bow | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 122 | `Prop/BowlingPin` | BowlingPin | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 123 | `Prop/Box` | Box | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 124 | `Prop/Bridge` | Bridge | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 125 | `Prop/Bush` | Bush | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 126 | `Prop/Cake` | Cake | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 127 | `Prop/CandyFactory` | CandyFactory | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 128 | `Prop/CanyonSpires` | CanyonSpires | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 129 | `Prop/CastleGate` | CastleGate | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 130 | `Prop/CastleTowerBase` | CastleTowerBase | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 131 | `Prop/CastleTowerMiddle` | CastleTowerMiddle | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 132 | `Prop/CastleTowerTop` | CastleTowerTop | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 133 | `Prop/CastleWall` | CastleWall | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 134 | `Prop/Cattails` | Cattails | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 135 | `Prop/Cauldron` | Cauldron | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 136 | `Prop/CauldronLid` | CauldronLid | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 137 | `Prop/Cave` | Cave | Prop | props or set | 9 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 138 | `Prop/CedarPole` | CedarPole | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 139 | `Prop/CedarTree` | CedarTree | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 140 | `Prop/CedarTreeLog` | CedarTreeLog | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 141 | `Prop/CedarTreeStump` | CedarTreeStump | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 142 | `Prop/CenturyPlant` | CenturyPlant | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 143 | `Prop/Chair` | Chair | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 144 | `Prop/CircusBleachers` | CircusBleachers | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 145 | `Prop/CircusGround` | CircusGround | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 146 | `Prop/CircusPost` | CircusPost | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 147 | `Prop/CircusPoster` | CircusPoster | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 148 | `Prop/CircusRing` | CircusRing | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 149 | `Prop/CircusTent` | CircusTent | Prop | props or set | 15 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 150 | `Prop/CircusTrampoline` | CircusTrampoline | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 151 | `Prop/CircusTrapeze` | CircusTrapeze | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 152 | `Prop/CircusWagon` | CircusWagon | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 153 | `Prop/CliffWall` | CliffWall | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 154 | `Prop/ClothingRack` | ClothingRack | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 155 | `Prop/Cloud` | Cloud | Prop | props or set | 5 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 156 | `Prop/Coal` | Coal | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 157 | `Prop/CoatRack` | CoatRack | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 158 | `Prop/Coconut` | Coconut | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 159 | `Prop/CoconutPalm` | CoconutPalm | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 160 | `Prop/CoffeeMaker` | CoffeeMaker | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 161 | `Prop/CoffeeTable` | CoffeeTable | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 162 | `Prop/CoinPile` | CoinPile | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 163 | `Prop/CoinStack` | CoinStack | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 164 | `Prop/ColaBottle` | ColaBottle | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 165 | `Prop/Computer` | Computer | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 166 | `Prop/ConiferTree` | ConiferTree | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 167 | `Prop/CoralShelf` | CoralShelf | Prop | props or set | 6 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 168 | `Prop/Crib` | Crib | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 169 | `Prop/CypressTree` | CypressTree | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 170 | `Prop/DaffodilVase` | DaffodilVase | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 171 | `Prop/Desk` | Desk | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 172 | `Prop/Diamond` | Diamond | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 173 | `Prop/DiningTable` | DiningTable | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 174 | `Prop/Dishwasher` | Dishwasher | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 175 | `Prop/Docks` | Docks | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 176 | `Prop/Dollhouse` | Dollhouse | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 177 | `Prop/Dresser` | Dresser | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 178 | `Prop/Easel` | Easel | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 179 | `Prop/ElephantStable` | ElephantStable | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 180 | `Prop/Emerald` | Emerald | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 181 | `Prop/EndTable` | EndTable | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 182 | `Prop/EspressoMachine` | EspressoMachine | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 183 | `Prop/EstherBust` | EstherBust | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 184 | `Prop/Femur` | Femur | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 185 | `Prop/Fern` | Fern | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 186 | `Prop/Ficus` | Ficus | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 187 | `Prop/FigTree` | FigTree | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 188 | `Prop/Fireplace` | Fireplace | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 189 | `Prop/FirTreeMountain` | FirTreeMountain | Prop | props or set | 8 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 190 | `Prop/FirTreeTrunk` | FirTreeTrunk | Prop | props or set | 8 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 191 | `Prop/FishingBasket` | FishingBasket | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 192 | `Prop/FishingBasketLid` | FishingBasketLid | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 193 | `Prop/FishingBoatCanopy` | FishingBoatCanopy | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 194 | `Prop/FishingLantern` | FishingLantern | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 195 | `Prop/FishingLanternPole` | FishingLanternPole | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 196 | `Prop/FishingNet` | FishingNet | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 197 | `Prop/FishingPole` | FishingPole | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 198 | `Prop/Flames` | Flames | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 199 | `Prop/FlatRocks` | FlatRocks | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 200 | `Prop/FoodProcessor` | FoodProcessor | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 201 | `Prop/Foot` | Foot | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 202 | `Prop/GardenGnome` | GardenGnome | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 203 | `Prop/GideonBust` | GideonBust | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 204 | `Prop/Gong` | Gong | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 205 | `Prop/GongMallet` | GongMallet | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 206 | `Prop/GopherHole` | GopherHole | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 207 | `Prop/GrandfatherClock` | GrandfatherClock | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 208 | `Prop/Grill` | Grill | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 209 | `Prop/Hand` | Hand | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 210 | `Prop/HatOfSkeleton` | HatOfSkeleton | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 211 | `Prop/HauntedHouse` | HauntedHouse | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 212 | `Prop/HeadOfPumpkin` | HeadOfPumpkin | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 213 | `Prop/Hedge` | Hedge | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 214 | `Prop/HibiscusTree` | HibiscusTree | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 215 | `Prop/Hogan` | Hogan | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 216 | `Prop/HookAndBobber` | HookAndBobber | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 217 | `Prop/HotTub` | HotTub | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 218 | `Prop/Iceberg` | Iceberg | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 219 | `Prop/IceBlock` | IceBlock | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 220 | `Prop/IceBlockHalf` | IceBlockHalf | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 221 | `Prop/IceFloe` | IceFloe | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 222 | `Prop/IceMountain` | IceMountain | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 223 | `Prop/IceRamp` | IceRamp | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 224 | `Prop/IceSkate` | IceSkate | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 225 | `Prop/Island` | Island | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 226 | `Prop/JadeHouseplant` | JadeHouseplant | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 227 | `Prop/JapaneseCypress` | JapaneseCypress | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 228 | `Prop/JapaneseMapleTree` | JapaneseMapleTree | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 229 | `Prop/JoshuaTree` | JoshuaTree | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 230 | `Prop/JungleHill` | JungleHill | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 231 | `Prop/JungleLog` | JungleLog | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 232 | `Prop/JunglePlant` | JunglePlant | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 233 | `Prop/JungleTree` | JungleTree | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 234 | `Prop/KitchenCounter` | KitchenCounter | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 235 | `Prop/KitchenCounterCorner` | KitchenCounterCorner | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 236 | `Prop/Kite` | Kite | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 237 | `Prop/KiteSpool` | KiteSpool | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 238 | `Prop/Lamp` | Lamp | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 239 | `Prop/LeatherBook` | LeatherBook | Prop | props or set | 38 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 240 | `Prop/Leg` | Leg | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 241 | `Prop/Lightning` | Lightning | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 242 | `Prop/LilyPads` | LilyPads | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 243 | `Prop/Logs` | Logs | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 244 | `Prop/LogWall` | LogWall | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 245 | `Prop/Loveseat` | Loveseat | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 246 | `Prop/MagicSpoon` | MagicSpoon | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 247 | `Prop/MagicStaff` | MagicStaff | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 248 | `Prop/MagicStone` | MagicStone | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 249 | `Prop/MagicWand` | MagicWand | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 250 | `Prop/Mango` | Mango | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 251 | `Prop/MangoTree` | MangoTree | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 252 | `Prop/MarsOutpostBunker` | MarsOutpostBunker | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 253 | `Prop/MarsOutpostCompound` | MarsOutpostCompound | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 254 | `Prop/MarsOutpostComputer` | MarsOutpostComputer | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 255 | `Prop/MarsOutpostFloor` | MarsOutpostFloor | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 256 | `Prop/MarsOutpostSatellite` | MarsOutpostSatellite | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 257 | `Prop/MarsOutpostStage` | MarsOutpostStage | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 258 | `Prop/MarsOutpostStairs` | MarsOutpostStairs | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 259 | `Prop/MarsOutpostWall` | MarsOutpostWall | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 260 | `Prop/Mausoleum` | Mausoleum | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 261 | `Prop/MausoleumPieces` | MausoleumPieces | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 262 | `Prop/Microwave` | Microwave | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 263 | `Prop/Mjolnir` | Mjolnir | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 264 | `Prop/MoonFace` | MoonFace | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 265 | `Prop/Mushroom` | Mushroom | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 266 | `Prop/NavajoBlanket` | NavajoBlanket | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 267 | `Prop/NicholasBust` | NicholasBust | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 268 | `Prop/NordicHouse` | NordicHouse | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 269 | `Prop/NordicOutpost` | NordicOutpost | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 270 | `Prop/Oar` | Oar | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 271 | `Prop/OldShipWheel` | OldShipWheel | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 272 | `Prop/Orchid` | Orchid | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 273 | `Prop/OvenMitts` | OvenMitts | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 274 | `Prop/PaintBrush` | PaintBrush | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 275 | `Prop/PaintingCanvas` | PaintingCanvas | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 276 | `Prop/PaintPalette` | PaintPalette | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 277 | `Prop/PalmTree` | PalmTree | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 278 | `Prop/PaperLantern` | PaperLantern | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 279 | `Prop/PeabodyGarage` | PeabodyGarage | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 280 | `Prop/PeridexionTree` | PeridexionTree | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 281 | `Prop/Philodendron` | Philodendron | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 282 | `Prop/Pillow` | Pillow | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 283 | `Prop/PillowSitting` | PillowSitting | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 284 | `Prop/PinballMachine` | PinballMachine | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 285 | `Prop/PineTree` | PineTree | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 286 | `Prop/PlankHouse` | PlankHouse | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 287 | `Prop/Plateau` | Plateau | Prop | props or set | 6 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 288 | `Prop/PocketWatch` | PocketWatch | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 289 | `Prop/Pond` | Pond | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 290 | `Prop/Potion` | Potion | Prop | props or set | 16 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 291 | `Prop/PrayerFlags` | PrayerFlags | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 292 | `Prop/PricklyPearCactus` | PricklyPearCactus | Prop | props or set | 5 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 293 | `Prop/Pumpkin` | Pumpkin | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 294 | `Prop/Quilt` | Quilt | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 295 | `Prop/Quiver` | Quiver | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 296 | `Prop/RailroadTrack` | RailroadTrack | Prop | props or set | 5 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 297 | `Prop/RattlerCottage` | RattlerCottage | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 298 | `Prop/RedRover` | RedRover | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 299 | `Prop/Refrigerator` | Refrigerator | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 300 | `Prop/RibCage` | RibCage | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 301 | `Prop/RingmasterCoat` | RingmasterCoat | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 302 | `Prop/RiverPiece` | RiverPiece | Prop | props or set | 24 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 303 | `Prop/RiverRock` | RiverRock | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 304 | `Prop/RockyOutcrop` | RockyOutcrop | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 305 | `Prop/Rose` | Rose | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 306 | `Prop/RoyalHotel` | RoyalHotel | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 307 | `Prop/Ruby` | Ruby | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 308 | `Prop/SaguaroCactus` | SaguaroCactus | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 309 | `Prop/Sandcastle` | Sandcastle | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 310 | `Prop/Saucer` | Saucer | Prop | props or set | 6 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 311 | `Prop/SavanaGrass` | SavanaGrass | Prop | props or set | 10 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 312 | `Prop/ScubaHelmet` | ScubaHelmet | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 313 | `Prop/Seashell` | Seashell | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 314 | `Prop/SeaSponge` | SeaSponge | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 315 | `Prop/Seaweed` | Seaweed | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 316 | `Prop/Shovel` | Shovel | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 317 | `Prop/Shower` | Shower | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 318 | `Prop/ShowerBath` | ShowerBath | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 319 | `Prop/Shrine` | Shrine | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 320 | `Prop/ShrineLantern` | ShrineLantern | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 321 | `Prop/Ski` | Ski | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 322 | `Prop/Skull` | Skull | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 323 | `Prop/Sled` | Sled | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 324 | `Prop/SnailHouse` | SnailHouse | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 325 | `Prop/Snowboard` | Snowboard | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 326 | `Prop/SoccerBall` | SoccerBall | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 327 | `Prop/SoccerGoal` | SoccerGoal | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 328 | `Prop/Sofa` | Sofa | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 329 | `Prop/SpaceStation` | SpaceStation | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 330 | `Prop/Spear` | Spear | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 331 | `Prop/SpellBook` | SpellBook | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 332 | `Prop/SpiralShell` | SpiralShell | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 333 | `Prop/Staff` | Staff | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 334 | `Prop/StaircaseDown` | StaircaseDown | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 335 | `Prop/StaircaseUp` | StaircaseUp | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 336 | `Prop/Starfish` | Starfish | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 337 | `Prop/Stereo` | Stereo | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 338 | `Prop/StoneBridge` | StoneBridge | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 339 | `Prop/Stove` | Stove | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 340 | `Prop/Suitcase` | Suitcase | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 341 | `Prop/SunFace` | SunFace | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 342 | `Prop/SunflowerHouseplant` | SunflowerHouseplant | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 343 | `Prop/Teacup` | Teacup | Prop | props or set | 6 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 344 | `Prop/Teapot` | Teapot | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 345 | `Prop/TeaTable` | TeaTable | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 346 | `Prop/TeaTray` | TeaTray | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 347 | `Prop/Television` | Television | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 348 | `Prop/TelevisionRemote` | TelevisionRemote | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 349 | `Prop/Tent` | Tent | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 350 | `Prop/TermiteMound` | TermiteMound | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 351 | `Prop/Terrain` | Terrain | Prop | props or set | 120 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 352 | `Prop/ThistlePatch` | ThistlePatch | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 353 | `Prop/Toilet` | Toilet | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 354 | `Prop/Track` | Track | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 355 | `Prop/TrackFinish` | TrackFinish | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 356 | `Prop/TrackHurdle` | TrackHurdle | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 357 | `Prop/TrainStation` | TrainStation | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 358 | `Prop/Trashcan` | Trashcan | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 359 | `Prop/TrashPile` | TrashPile | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 360 | `Prop/TreasureChest` | TreasureChest | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 361 | `Prop/Treehouse` | Treehouse | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 362 | `Prop/TreeTrunk` | TreeTrunk | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 363 | `Prop/Trestle` | Trestle | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 364 | `Prop/TrestleTriangle` | TrestleTriangle | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 365 | `Prop/Tumbleweed` | Tumbleweed | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 366 | `Prop/Tunnel` | Tunnel | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 367 | `Prop/UpperArm` | UpperArm | Prop | props or set | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 368 | `Prop/Volleyball` | Volleyball | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 369 | `Prop/WackAMole` | WackAMole | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 370 | `Prop/WackAMoleHammer` | WackAMoleHammer | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 371 | `Prop/WagonBed` | WagonBed | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 372 | `Prop/WagonDesk` | WagonDesk | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 373 | `Prop/WateringHole` | WateringHole | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 374 | `Prop/WaterTank` | WaterTank | Prop | props or set | 8 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 375 | `Prop/WaterTankPillar` | WaterTankPillar | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 376 | `Prop/WaterTankShrine` | WaterTankShrine | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 377 | `Prop/WaterTankTower` | WaterTankTower | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 378 | `Prop/WaterTankWall` | WaterTankWall | Prop | props or set | 8 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 379 | `Prop/WaterTankWell` | WaterTankWell | Prop | props or set | 8 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 380 | `Prop/WaterTower` | WaterTower | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 381 | `Prop/WillowTree` | WillowTree | Prop | props or set | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 382 | `Prop/WonderlandBush` | WonderlandBush | Prop | props or set | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 383 | `Prop/WonderlandTree` | WonderlandTree | Prop | props or set | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 384 | `Prop/WychElm` | WychElm | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 385 | `Prop/ZumaRock` | ZumaRock | Prop | props or set | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 386 | `Quadruped/AbyssinianCat` | AbyssinianCat | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 387 | `Quadruped/AlienRobot` | AlienRobot | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 388 | `Quadruped/Bear` | Bear | Quadruped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 389 | `Quadruped/BearCub` | BearCub | Quadruped | cast | 3 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 390 | `Quadruped/BillyGoat` | BillyGoat | Quadruped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 391 | `Quadruped/Bison` | Bison | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 392 | `Quadruped/Caiman` | Caiman | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 393 | `Quadruped/Camel` | Camel | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 394 | `Quadruped/Cow` | Cow | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 395 | `Quadruped/Coyote` | Coyote | Quadruped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 396 | `Quadruped/Dalmatian` | Dalmatian | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 397 | `Quadruped/DesertTortoise` | DesertTortoise | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 398 | `Quadruped/Dragon` | Dragon | Quadruped | cast | 10 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 399 | `Quadruped/DragonBaby` | DragonBaby | Quadruped | cast | 10 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 400 | `Quadruped/Elephant` | Elephant | Quadruped | cast | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 401 | `Quadruped/Elk` | Elk | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 402 | `Quadruped/Fox` | Fox | Quadruped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 403 | `Quadruped/Gopher` | Gopher | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 404 | `Quadruped/Hippo` | Hippo | Quadruped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 405 | `Quadruped/HornedLizard` | HornedLizard | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 406 | `Quadruped/Horse` | Horse | Quadruped | cast | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 407 | `Quadruped/Hyena` | Hyena | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 408 | `Quadruped/Jaguar` | Jaguar | Quadruped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 409 | `Quadruped/Lioness` | Lioness | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 410 | `Quadruped/ManxCat` | ManxCat | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 411 | `Quadruped/Moose` | Moose | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 412 | `Quadruped/Peccary` | Peccary | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 413 | `Quadruped/Poodle` | Poodle | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 414 | `Quadruped/Rhino` | Rhino | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 415 | `Quadruped/RiverOtter` | RiverOtter | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 416 | `Quadruped/ScottyDog` | ScottyDog | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 417 | `Quadruped/ShortHairCat` | ShortHairCat | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 418 | `Quadruped/Skunk` | Skunk | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 419 | `Quadruped/Squirrel` | Squirrel | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 420 | `Quadruped/StuffedZombieKitten` | StuffedZombieKitten | Quadruped | cast | 15 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 421 | `Quadruped/Tiger` | Tiger | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 422 | `Quadruped/Wolf` | Wolf | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 423 | `Quadruped/Yak` | Yak | Quadruped | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 424 | `Quadruped/Yali` | Yali | Quadruped | cast | 2 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 425 | `Slitherer/HermitSnail` | HermitSnail | Slitherer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 426 | `Slitherer/LongNeckSnail` | LongNeckSnail | Slitherer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 427 | `Slitherer/Nagi` | Nagi | Slitherer | cast | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 428 | `Train/TrainCar` | TrainCar | Transport | props | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 429 | `Train/TrainCarFlat` | TrainCarFlat | Transport | props | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 430 | `Train/TrainEngine` | TrainEngine | Transport | props | 4 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 431 | `Watercraft/FishingBoat` | FishingBoat | Transport | props | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 432 | `Watercraft/PirateShip` | PirateShip | Transport | props | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 433 | `Watercraft/Sailboat` | Sailboat | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 434 | `Watercraft/Submarine` | Submarine | Transport | props | 1 | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |
| 435 | `Watercraft/WoodenBoat` | WoodenBoat | Transport | props | not in source | Not yet: convert for testing only; ship only if CMU confirms (WP17.1) |

<!-- /alice-gallery -->
