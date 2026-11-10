# Everyday people from MakeHuman: first set

- **Workplan:** WP3.5. **Spec:** `docs/spec/17-backstage.md`, section 3 (pipelines).
- **Status:** list approved by the owner, 1 Nov 2026 (see "The owner's decisions"). All 30 are built. The owner still reviews their renders before they are merged (WP3 done-when).
- **Source of truth:** `people.json` in this folder. The table below is generated from it by `node tools/makehuman-export/src/people-cli.ts`, which also checks every asset against MakeHuman's CC0 system pack.

Thirty people in Backstage's Cast, made with MakeHuman's CC0 assets: MPFB2 in Blender, run headless in the assets repository's CI (owner, 25 Oct 2026). Each one is rigged to the game-engine skeleton, so it walks, gestures and poses with the same blocks as every other character (joint map, spec 17 section 2a). Their credit line is "<Name>, made with MakeHuman (CC0)".

## The owner's decisions (1 Nov 2026)

- **The list:** approved as drafted, for the first build.
- **What learners see:** first names, as listed.
- **The gaps** (headwear, glasses, hearing aids, wheelchairs): look for community CC0 assets first, each checked through the licence audit before it is added. Anything that can't be found that way comes back to the owner.
- **10 Nov:** S4 searched the MakeHuman community's CC0 and CC BY packs. **Glasses** are there (`glasses01`, CC0): five people of mixed ages wear plain frames (Kai, Oskar, Hannah, Chen, Margaret). The **wheelchair** and **crutches** are Props from Poly Pizza (CC BY 3.0). **Headscarves (hijab), turbans, kippahs and hearing aids** aren't in any community pack: the owner chose to leave them for now, as a known gap, until a source turns up.
- **Grey hair:** tint it in the pipeline. Margaret, Lin, Ravi and Eileen are tinted (`hairTint` in `people.json`). Winston and Tunde are bald.
- **Outfits, after seeing the first renders:**
    - The crop top and the short denim shorts are retired for everyone. They don't suit a tool for 6 to 13-year-olds.
    - Nobody wears a T-shirt with MakeHuman's logo. People wear the logo-free outfits, each in their own colour (`clothesColour`), so they don't look like a team in uniform.
    - The checker refuses retired outfits (`RETIRED_CLOTHES`).
    - **8 Nov:** the renders showed that the T-shirt outfit (`male_casualsuit06`) also carries the logo, plainly on white and faintly once recoloured, so it is retired too. Amara, Kai, Niamh, Mei, Jayden, Leah and Morgan changed to a striped shirt or a jacket in their own colours, and were made again (owner, 8 Nov 2026). The plain shirt and grey jeans (`male_casualsuit01`) can't be recoloured: its colour stained the belt and jeans and left the shirt navy, so it is only worn as it comes (`NOT_RECOLOURED`).
- **Oskar's hair:** `bob02`'s built-in colour is pale silver, so Oskar, aged 13, now has a short style. Siân (55) keeps `bob02`.

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
- **Clothes:** MakeHuman labels its outfits "female" and "male". They are given out regardless of body. An outfit's colour changes everything but denim.

## What MakeHuman's free pack can't do yet

The CC0 system pack is small, so some people StoryStage should show can't be made from it yet:

| Missing | Effect | Possible remedy |
|---|---|---|
| Headscarves (hijab), turbans, kippahs | No one can be shown wearing them | None in any community pack (searched 10 Nov 2026). Left for now, a known gap (owner, 10 Nov 2026) |
| Hearing aids | None shown | As above |
| Glasses | Done: five people of mixed ages wear plain frames from the community's CC0 `glasses01` pack | — |
| Wheelchairs, walking aids | No one is shown using them yet | A wheelchair and crutches are Props from Poly Pizza (CC BY 3.0), which a character can sit in or hold |
| Grey or white hair | The pack's hair has fixed colours, none of them grey | Tinted in the pipeline (owner, 1 Nov 2026) |
| Children's clothes | Children wear adult outfits refitted to their bodies | Check the first build; commission if they look wrong |
| Only 10 hairstyles | Some repetition | Community CC0 hair through the audit |

## The people

<!-- people -->

| # | Name | Age | Build | MakeHuman ancestry | Skin | Hair | Eyes | Clothes | Description (for the Prompter) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Alfie | 6 | average | Caucasian 100% | young_caucasian_male | short02 | blue | male_casualsuit01, shoes01 | a boy of 6 with short brown hair, in a blue shirt and jeans |
| 2 | Amara | 7 | average | African 100% | young_african_female | afro01 | brown | male_casualsuit05 (mustard), shoes02 | a girl of 7 with short curly black hair, in a yellow jacket and jeans |
| 3 | Kai | 8 | average | Asian 100% | young_asian_male | short03 | brown | male_casualsuit03 (teal), shoes03, spamrakuen_sagerfrogs_glasses_02 | a child of 8 with a brown side fringe and red glasses, in a teal striped shirt and jeans |
| 4 | Aisha | 9 | average | Asian 40%, Caucasian 40%, African 20% | young_asian_female | braid01 | brown | male_casualsuit03 (plum), shoes01 | a girl of 9 with short black hair, in a purple striped shirt and jeans |
| 5 | Rhys | 10 | larger | Caucasian 100% | young_caucasian_male | short01 | green | male_casualsuit03, shoes04 | a boy of 10 with short dark hair, in a dark red striped shirt and jeans |
| 6 | Niamh | 11 | taller, slight | Caucasian 100% | young_caucasian_female | ponytail01 | green | male_casualsuit05 (green), shoes05 | a tall girl of 11 with short light brown hair, in a green jacket and jeans |
| 7 | Zain | 12 | average | African 50%, Caucasian 50% | young_african_male | short04 | brown | male_casualsuit05 (teal), shoes02 | a boy of 12 with short black hair, in a teal jacket and jeans |
| 8 | Mei | 6 | average | Asian 100% | young_asian_female | bob01 | brown | male_casualsuit03 (coral), shoes06 | a girl of 6 with a black bob and a long fringe, in a coral striped shirt and jeans |
| 9 | Kofi | 11 | average | African 100% | young_african_male | short01 | brown | male_casualsuit05, shoes03 | a boy of 11 with short black hair, in a khaki jacket and jeans |
| 10 | Isla | 9 | larger | Caucasian 100% | young_caucasian_female | long01 | blue | male_casualsuit03 (green), shoes04 | a girl of 9 with long brown hair, in a green striped shirt and jeans |
| 11 | Jayden | 14 | taller | African 70%, Caucasian 30% | young_african_male | short03 | brown | male_casualsuit05 (coral), shoes01 | a tall boy of 14 with short brown hair, in a coral jacket and jeans |
| 12 | Priya | 15 | average | Asian 50%, Caucasian 30%, African 20% | young_asian_female | long01 | brown | male_casualsuit05 (plum), shoes02 | a girl of 15 with long brown hair, in a purple jacket and jeans |
| 13 | Oskar | 13 | slight | Caucasian 100% | young_caucasian_male | short04 | lightblue | male_casualsuit01, shoes05, spamrakuen_tbm_glasses_frames_01 | a boy of 13 with short dark hair and black glasses, in a blue shirt and grey jeans |
| 14 | Leah | 16 | larger | Caucasian 80%, African 20% | young_caucasian_female | ponytail01 | brown | male_casualsuit03 (rose), shoes06 | a girl of 16 with short brown hair, in a pink striped shirt and jeans |
| 15 | Hamza | 17 | muscular | Caucasian 50%, Asian 40%, African 10% | young_caucasian_male | short02 | brown | male_casualsuit05 (rust), shoes03 | a boy of 17 with short brown hair, in an orange jacket and jeans |
| 16 | Sam | 15 | average | African 50%, Asian 50% | young_african_male | short04 | grey | male_casualsuit03 (mustard), shoes04 | a teenager of 15 with short black hair, in a yellow striped shirt and jeans |
| 17 | Grace | 28 | average | African 100% | young_african_female | afro01 | brown | female_elegantsuit01, shoes02 | a woman of 28 with short curly black hair, in a striped blouse, grey skirt and white socks |
| 18 | Tom | 32 | taller | Caucasian 100% | young_caucasian_male | short02 | blue | male_worksuit01, shoes03 | a tall man of 32 with short brown hair, in blue dungarees and a white T-shirt |
| 19 | Yusuf | 40 | larger | Asian 40%, Caucasian 40%, African 20% | middleage_asian_male | short01 | brown | male_elegantsuit01, shoes01 | a man of 40 with short black hair, in a dark suit and striped tie |
| 20 | Hannah | 36 | larger | Caucasian 100% | middleage_caucasian_female | bob01 | green | male_casualsuit03 (teal), shoes06, spamrakuen_sagerfrogs_glasses_04 | a woman of 36 with a black bob and rimless glasses, in a teal striped shirt and jeans |
| 21 | Chen | 45 | average | Asian 100% | middleage_asian_male | short03 | brown | male_casualsuit03 (green), shoes05, spamrakuen_sagerfrogs_glasses_03 | a man of 45 with a brown side fringe and thin metal glasses, in a green striped shirt and jeans |
| 22 | Tunde | 50 | larger, muscular | African 100% | middleage_african_male | none | brown | male_casualsuit05, shoes04 | a bald man of 50, in a khaki jacket and jeans |
| 23 | Fatima | 30 | average | Asian 50%, Caucasian 30%, African 20% | young_asian_female | braid01 | brown | female_elegantsuit01 (plum), shoes02 | a woman of 30 with a short black bob, in a purple striped blouse and purple skirt |
| 24 | Morgan | 26 | average | Caucasian 60%, African 40% | young_caucasian_male | short04 | brownlight | male_casualsuit03 (lilac), shoes01 | an adult of 26 with short dark hair, in a purple striped shirt and jeans |
| 25 | Siân | 55 | average | Caucasian 100% | middleage_caucasian_female | bob02 | blue | female_elegantsuit01, shoes05 | a woman of 55 with a silver-blonde bob, in a dark red striped blouse and grey skirt |
| 26 | Margaret | 72 | average | Caucasian 100% | old_caucasian_female | bob02, tinted grey | grey | female_elegantsuit01 (rose), shoes06, kwnet_at_optical_glasses | an older woman of 72 with a grey bob and glasses, in a pink striped blouse and pink skirt |
| 27 | Winston | 78 | average | African 100% | old_african_male | none | brown | male_elegantsuit01, shoes03, fedora01 | an older man of 78 in a grey hat, dark suit and striped tie |
| 28 | Lin | 68 | shorter | Asian 100% | old_asian_female | bob01, tinted grey | brown | female_elegantsuit01 (teal), shoes02 | an older woman of 68 with a grey bob, in a teal striped blouse and teal skirt |
| 29 | Ravi | 70 | average | Asian 50%, Caucasian 30%, African 20% | old_asian_male | short02, tinted grey | brown | male_casualsuit03 (rust), shoes04 | an older man of 70 with short grey hair, in an orange striped shirt and jeans |
| 30 | Eileen | 85 | shorter, slight | Caucasian 100% | old_caucasian_female | bob02, tinted white | blue | female_elegantsuit01 (lilac), shoes06 | an older woman of 85 with a white bob, in a lilac striped blouse and lilac skirt |

<!-- /people -->

## What happens next

1. The owner reviews the first set's sketches and renders in the assets pull request, as for the CC0 sources.
2. S4 looked for community CC0 headwear, glasses, hearing aids and a wheelchair (10 Nov 2026): glasses, a wheelchair and crutches are in; headwear and hearing aids are a known gap.
3. WP3c reduces the people to the device budget (they are 33,000 to 47,000 triangles now).
