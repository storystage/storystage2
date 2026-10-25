# Everyday people from MakeHuman: first set, for review

- **Workplan:** WP3.5. **Spec:** `docs/spec/17-backstage.md`, section 3 (pipelines).
- **Status:** draft for the owner's review of respectful, varied representation (WP3 done-when), 25 Oct 2026. Nothing has been made yet.
- **Source of truth:** `people.json` in this folder. The table below is generated from it by `node tools/makehuman-export/src/people-cli.ts`, which also checks every asset against MakeHuman's CC0 system pack.

Thirty people in Backstage's Cast, made with MakeHuman's CC0 assets: MPFB2 in Blender, run headless in the assets repository's CI (owner, 25 Oct 2026). Each one is rigged to the game-engine skeleton, so it walks, gestures and poses with the same blocks as every other character (joint map, spec 17 section 2a). Their credit line is "<Name>, made with MakeHuman (CC0)".

## How the list was chosen

- **Ages:**
    - 10 children aged 6 to 12, the learners' own ages;
    - 6 teenagers;
    - 9 adults from 26 to 55;
    - 5 older people from 68 to 85.
- **Bodies:**
    - heights from shorter to taller;
    - builds from slight to larger, and some muscular;
    - female, male and in-between bodies. Three people (Kai, Sam, Morgan) sit at the middle of MakeHuman's gender slider.
- **Ancestry:** MakeHuman has three sliders: African, Asian and Caucasian. People of mixed heritage, and British South Asian people, can only be approximated by mixing them. For example, Aisha, Priya, Fatima, Yusuf, Ravi and Hamza mix all three. The aim is a spread that looks like a UK classroom, not a census.
- **Names:** common in the UK today across its communities, and across England, Scotland, Wales and Northern Ireland (Rhys, Isla, Niamh, Siân). Names are what learners see in Backstage. They can be changed without remaking anyone.
- **Clothes:** MakeHuman labels its outfits "female" and "male". They are given out regardless of body.

## What MakeHuman's free pack can't do yet

The CC0 system pack is small, so some people StoryStage should show can't be made from it yet:

| Missing | Effect | Possible remedy |
|---|---|---|
| Headscarves (hijab), turbans, kippahs | No one can be shown wearing them | Commission CC0 or ours-licensed headwear (with WP3.6), or find community CC0 assets and add them through the audit |
| Glasses, hearing aids | None shown | As above; small props attached to the head |
| Wheelchairs, walking aids | No disabled people shown using them | Model a wheelchair as a Prop a character can sit in (Story API "sit on") |
| Grey or white hair | Older people keep their hair's built-in colour | Tint the hair in the pipeline (MPFB2 hair material), or bald (Tunde, Winston) |
| Children's clothes | Children wear adult outfits refitted to their bodies | Check the first build; commission if they look wrong |
| Only 10 hairstyles | Some repetition | Community CC0 hair through the audit |

## The people

<!-- people -->

| # | Name | Age | Build | MakeHuman ancestry | Skin | Hair | Eyes | Clothes |
|---|---|---|---|---|---|---|---|---|
| 1 | Alfie | 6 | average | Caucasian 100% | young_caucasian_male | short02 | blue | male_casualsuit01, shoes01 |
| 2 | Amara | 7 | average | African 100% | young_african_female | afro01 | brown | female_casualsuit01, shoes02 |
| 3 | Kai | 8 | average | Asian 100% | young_asian_male | short03 | brown | male_casualsuit02, shoes03 |
| 4 | Aisha | 9 | average | Asian 40%, Caucasian 40%, African 20% | young_asian_female | braid01 | brown | female_casualsuit02, shoes01 |
| 5 | Rhys | 10 | larger | Caucasian 100% | young_caucasian_male | short01 | green | male_casualsuit03, shoes04 |
| 6 | Niamh | 11 | taller, slight | Caucasian 100% | young_caucasian_female | ponytail01 | green | female_sportsuit01, shoes05 |
| 7 | Zain | 12 | average | African 50%, Caucasian 50% | young_african_male | short04 | brown | male_casualsuit04, shoes02 |
| 8 | Mei | 6 | average | Asian 100% | young_asian_female | bob01 | brown | female_casualsuit01, shoes06 |
| 9 | Kofi | 11 | average | African 100% | young_african_male | short01 | brown | male_casualsuit05, shoes03 |
| 10 | Isla | 9 | larger | Caucasian 100% | young_caucasian_female | long01 | blue | female_casualsuit02, shoes04 |
| 11 | Jayden | 14 | taller | African 70%, Caucasian 30% | young_african_male | short03 | brown | male_casualsuit06, shoes01 |
| 12 | Priya | 15 | average | Asian 50%, Caucasian 30%, African 20% | young_asian_female | long01 | brown | female_casualsuit01, shoes02 |
| 13 | Oskar | 13 | slight | Caucasian 100% | young_caucasian_male | bob02 | lightblue | male_casualsuit01, shoes05 |
| 14 | Leah | 16 | larger | Caucasian 80%, African 20% | young_caucasian_female | ponytail01 | brown | female_sportsuit01, shoes06 |
| 15 | Hamza | 17 | muscular | Caucasian 50%, Asian 40%, African 10% | young_caucasian_male | short02 | brown | male_casualsuit02, shoes03 |
| 16 | Sam | 15 | average | African 50%, Asian 50% | young_african_male | short04 | grey | male_casualsuit03, shoes04 |
| 17 | Grace | 28 | average | African 100% | young_african_female | afro01 | brown | female_elegantsuit01, shoes02 |
| 18 | Tom | 32 | taller | Caucasian 100% | young_caucasian_male | short02 | blue | male_worksuit01, shoes03 |
| 19 | Yusuf | 40 | larger | Asian 40%, Caucasian 40%, African 20% | middleage_asian_male | short01 | brown | male_elegantsuit01, shoes01 |
| 20 | Hannah | 36 | larger | Caucasian 100% | middleage_caucasian_female | bob01 | green | female_casualsuit02, shoes06 |
| 21 | Chen | 45 | average | Asian 100% | middleage_asian_male | short03 | brown | male_casualsuit04, shoes05 |
| 22 | Tunde | 50 | larger, muscular | African 100% | middleage_african_male | none | brown | male_casualsuit05, shoes04 |
| 23 | Fatima | 30 | average | Asian 50%, Caucasian 30%, African 20% | young_asian_female | braid01 | brown | female_casualsuit01, shoes02 |
| 24 | Morgan | 26 | average | Caucasian 60%, African 40% | young_caucasian_male | short04 | brownlight | male_casualsuit06, shoes01 |
| 25 | Siân | 55 | average | Caucasian 100% | middleage_caucasian_female | bob02 | blue | female_elegantsuit01, shoes05 |
| 26 | Margaret | 72 | average | Caucasian 100% | old_caucasian_female | bob02 | grey | female_casualsuit02, shoes06 |
| 27 | Winston | 78 | average | African 100% | old_african_male | none | brown | male_elegantsuit01, shoes03, fedora01 |
| 28 | Lin | 68 | shorter | Asian 100% | old_asian_female | bob01 | brown | female_casualsuit01, shoes02 |
| 29 | Ravi | 70 | average | Asian 50%, Caucasian 30%, African 20% | old_asian_male | short02 | brown | male_casualsuit03, shoes04 |
| 30 | Eileen | 85 | shorter, slight | Caucasian 100% | old_caucasian_female | bob02 | blue | female_elegantsuit01, shoes06 |

<!-- /people -->

## What happens next

1. The owner reviews this list (names, ages, bodies, ancestry mixes, clothes) and the gaps above.
2. S4 builds the pipeline in the assets repository: Blender, MPFB2 and the CC0 system pack, run headless in CI. It makes each person from `people.json`, exports glTF and adds them to Backstage with their sketches.
3. The owner reviews the first set's sketches and renders in the assets pull request, as for the CC0 sources.
