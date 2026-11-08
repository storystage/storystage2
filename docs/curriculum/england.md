# England: the national curriculum (WP16.1)

- **Workplan:** 16.1, "the national curriculum programmes of study for computing (KS1–KS3), English (writing narrative, drafting, spoken language and drama, KS1–KS3), art and design, and other subjects where storytelling or modelling fits (for example history and science explanations)".
- **Checked:** 25 October 2026, against the programmes on gov.uk (below). Method, fit levels and ids: [README.md](README.md). Features, activities and arc templates: [features.md](features.md).
- **In force:** the national curriculum of 2014. New programmes are due in 2027 for first teaching from September 2028; the drafts aren't published yet (README, "Reform watch").

## Sources

| Short name | Document | Link |
|---|---|---|
| Computing | National curriculum in England: computing programmes of study (DfE, 11 September 2013) | [gov.uk](https://www.gov.uk/government/publications/national-curriculum-in-england-computing-programmes-of-study/national-curriculum-in-england-computing-programmes-of-study) |
| English | National curriculum in England: English programmes of study, KS1–2 and KS3 (DfE, 2013; KS1–2 updated 2014) | [gov.uk](https://www.gov.uk/government/publications/national-curriculum-in-england-english-programmes-of-study/national-curriculum-in-england-english-programmes-of-study) |
| Art and design | National curriculum in England: art and design programmes of study (DfE, 2013) | [gov.uk](https://www.gov.uk/government/publications/national-curriculum-in-england-art-and-design-programmes-of-study/national-curriculum-in-england-art-and-design-programmes-of-study) |
| History | National curriculum in England: history programmes of study (DfE, 2013) | [gov.uk](https://www.gov.uk/government/publications/national-curriculum-in-england-history-programmes-of-study/national-curriculum-in-england-history-programmes-of-study) |
| Science | National curriculum in England: science programmes of study (DfE, 2013; KS1–2 updated 2015) | [gov.uk](https://www.gov.uk/government/publications/national-curriculum-in-england-science-programmes-of-study/national-curriculum-in-england-science-programmes-of-study) |

Drama has no programme of its own in England; it sits in English (spoken language, and reading and performing plays).

## Computing

| Id | Statement (paraphrased) | Source | Features | Activity | Arc | Ages | Fit |
|---|---|---|---|---|---|---|---|
| `EN-CO-KS1-1` | Understand what algorithms are, that programs carry them out on devices, and that programs follow precise, unambiguous instructions | Computing, KS1, bullet 1 | `F-CODE`, `F-RUN`, `F-PLAN` | `A-CODE` | `ARC-3` | 6–7 | Strong |
| `EN-CO-KS1-2` | Create and debug simple programs | Computing, KS1, bullet 2 | `F-CODE`, `F-RUN`, `F-CHK` | `A-CODE`, `A-DEBUG` | `ARC-3` | 6–7 | Strong |
| `EN-CO-KS1-3` | Use logical reasoning to predict what simple programs will do | Computing, KS1, bullet 3 | `F-RUN`, `F-CHK` | `A-DEBUG` (predict before rehearsing) | `ARC-3` | 6–7 | Strong |
| `EN-CO-KS1-4` | Use technology purposefully to create, organise, store, change and find digital content | Computing, KS1, bullet 4 | `F-SCN`, `F-FRM`, `F-SET`, `F-EXP` | `A-RETELL`, `A-BOARD`, `A-STAGE` | `ARC-3`, `ARC-TALE` | 6–7 | Strong |
| `EN-CO-KS1-5` | Recognise common uses of IT beyond school | Computing, KS1, bullet 5 | Film-industry workflow (storyboard, stage, screening); `F-PATH` (later) | `A-SCREEN` (how real films are made) | — | 6–7 | Partial |
| `EN-CO-KS1-6` | Use technology safely and respectfully, keep personal information private, know where to get help | Computing, KS1, bullet 6 | `F-LIC`; the Prompter never asks for personal details (17.5, R3) | `A-PUBLISH` | — | 6–7 | Partial |
| `EN-CO-KS2-1` | Design, write and debug programs that achieve specific goals, including simulating physical systems; break problems into smaller parts | Computing, KS2, bullet 1 | `F-SCN` (a film broken into scenes, a scene into steps), `F-CODE`, `F-PLAN`, `F-CHK` | `A-CODE`, `A-DEBUG`, `A-EXPLAIN` | `ARC-5`, `ARC-EXPLAIN` | 7–11 | Strong |
| `EN-CO-KS2-2` | Use sequence, selection and repetition; work with variables and different inputs and outputs | Computing, KS2, bullet 2 | `F-CODE` (do in order, do together, if, count, while, for each, variables, events as input, speech and movement as output) | `A-CODE` | `ARC-5` | 7–11 | Strong |
| `EN-CO-KS2-3` | Use logical reasoning to explain how simple algorithms work, and to find and correct errors | Computing, KS2, bullet 3 | `F-CHK`, `F-RUN`, `F-TXT` | `A-DEBUG` | `ARC-5` | 7–11 | Strong |
| `EN-CO-KS2-6` | Choose, use and combine software on a range of devices to make programs, systems and content for given goals | Computing, KS2, bullet 6 | The whole journey: `F-LOG` to `F-EXP` | `A-PLAN` to `A-PUBLISH` | `ARC-5` | 7–11 | Strong |
| `EN-CO-KS2-7` | Use technology safely, respectfully and responsibly; know how to report concerns | Computing, KS2, bullet 7 | `F-LIC` (respecting other people's work), the Prompter's safeguards (17.5) | `A-PUBLISH` | — | 7–11 | Partial |
| `EN-CO-KS3-1` | Design, use and evaluate computational abstractions that model real-world problems and physical systems | Computing, KS3, bullet 1 | `F-CODE` (procedures and functions on characters), `F-SET` | `A-EXPLAIN`, `A-CODE` | `ARC-EXPLAIN` | 11–13 | Partial |
| `EN-CO-KS3-3` | Use two or more programming languages, at least one textual; use procedures or functions | Computing, KS3, bullet 3 | `F-CODE` (custom procedures and functions), `F-TXT` (read-only text), `F-PATH` (later) | `A-TEXT` | — | 11–13 | Partial: the text view is read-only, so it introduces text code but doesn't replace a textual language (16.8) |
| `EN-CO-KS3-4` | Understand simple Boolean logic and its uses | Computing, KS3, bullet 4 | `F-CODE` (conditions in if and while) | `A-CODE` | — | 11–13 | Partial |
| `EN-CO-KS3-7` | Carry out creative projects that combine several applications, often across devices, to meet challenging goals and users' needs | Computing, KS3, bullet 7 | The whole journey, `F-EXP` | `A-PLAN` to `A-PUBLISH` | `ARC-5` | 11–13 | Strong |
| `EN-CO-KS3-8` | Create, reuse, revise and repurpose digital artefacts for an audience, attending to trustworthiness, design and usability | Computing, KS3, bullet 8 | `F-SCRN`, `F-EXP`, `F-LIC`, `F-A3P` (reuse Alice worlds) | `A-SCREEN`, `A-PUBLISH` | `ARC-5` | 11–13 | Strong |
| `EN-CO-KS3-9` | Use technology safely, responsibly and securely; protect online identity and privacy; recognise and report inappropriate content | Computing, KS3, bullet 9 | `F-LIC`, the Prompter's safeguards | `A-PUBLISH` | — | 11–13 | Partial |

## English

| Id | Statement (paraphrased) | Source | Features | Activity | Arc | Ages | Fit |
|---|---|---|---|---|---|---|---|
| `EN-EN-SL-1` | Give well-structured descriptions, explanations and narratives; use talk to imagine and explore ideas | English, spoken language, Years 1–6 | `F-VOX` (voice input), `F-COACH`, `F-SCR` | `A-PLAN`, `A-EXPLAIN` | `ARC-3` | 6–11 | Strong |
| `EN-EN-SL-2` | Take part in discussions, presentations, performances, role play and improvisations; gain and keep the listener's interest | English, spoken language, Years 1–6 | `F-VOX`, `F-SCRN` | `A-PERFORM`, `A-SCREEN` | — | 6–11 | Strong |
| `EN-EN-Y1-1` | Say out loud what they will write about; put sentences in order to make short narratives | English, Year 1, writing: composition | `F-SCN`, `F-LOG`, `F-VOX` | `A-RETELL`, `A-PLAN` | `ARC-3`, `ARC-TALE` | 6 | Strong |
| `EN-EN-Y1-2` | Get to know fairy stories and traditional tales well, and retell them | English, Year 1, reading: comprehension | `F-BKS` (storybook cast), `F-SCN` | `A-RETELL` | `ARC-TALE` | 6 | Strong |
| `EN-EN-Y2-1` | Write narratives about their own and others' experiences, real and fictional | English, Year 2, writing: composition | `F-LOG`, `F-SCN`, `F-SCR` | `A-PLAN`, `A-SCRIPT` | `ARC-3` | 6–7 | Strong |
| `EN-EN-Y2-2` | Plan by saying ideas out loud and noting key words; evaluate their writing with the teacher and other pupils | English, Year 2, writing: composition | `F-LOG`, `F-COACH`, `F-SCRN` (notes) | `A-PLAN`, `A-SCREEN` | `ARC-3` | 6–7 | Strong |
| `EN-EN-Y2-3` | Retell fairy stories and traditional tales; recognise recurring literary language | English, Year 2, reading: comprehension | `F-BKS`, `F-SCR` | `A-RETELL` | `ARC-TALE` | 6–7 | Strong |
| `EN-EN-LKS2-1` | Plan by studying writing like the one planned; rehearse sentences and dialogue orally | English, Years 3–4, writing: composition | `F-SCR`, `F-VOX` | `A-SCRIPT`, `A-PERFORM` | `ARC-5` | 7–9 | Strong |
| `EN-EN-LKS2-2` | In narratives, create settings, characters and plot | English, Years 3–4, writing: composition | `F-LOG`, `F-SCN` (heading = setting), `F-BKS`, `F-ARC` | `A-PLAN`, `A-BOARD`, `A-STAGE` | `ARC-5` | 7–9 | Strong |
| `EN-EN-LKS2-3` | Judge their own and others' writing and suggest improvements; read their own writing aloud with intonation, tone and volume | English, Years 3–4, writing: composition | `F-SCRN`, `F-VOX` | `A-SCREEN`, `A-PERFORM` | — | 7–9 | Strong |
| `EN-EN-LKS2-4` | Become familiar with fairy stories, myths and legends and retell some orally; prepare poems and play scripts to read aloud and perform | English, Years 3–4, reading: comprehension | `F-BKS`, `F-SCR`, `F-VOX` | `A-RETELL`, `A-SHAKES`, `A-PERFORM` | `ARC-MYTH`, `ARC-TALE` | 7–9 | Strong |
| `EN-EN-UKS2-1` | Plan for a known audience and purpose; consider how authors develop characters and settings in what they have read, heard or seen performed | English, Years 5–6, writing: composition | `F-LOG`, `F-SCN`, `F-COACH` | `A-PLAN` | `ARC-5`, `ARC-MYTH` | 9–11 | Strong |
| `EN-EN-UKS2-2` | Describe settings, characters and atmosphere; use dialogue to show character and move the action on | English, Years 5–6, writing: composition | `F-SCR`, `F-FRM`, `F-SET` (lighting, fog, sky set atmosphere) | `A-SCRIPT`, `A-BOARD`, `A-STAGE` | `ARC-5` | 9–11 | Strong |
| `EN-EN-UKS2-3` | Assess how well their own and others' writing works and propose changes; perform their own compositions with intonation, volume and movement | English, Years 5–6, writing: composition | `F-SCRN`, `F-CHK`, `F-VOX`, `F-CODE` (movement) | `A-SCREEN`, `A-PERFORM` | — | 9–11 | Strong |
| `EN-EN-UKS2-4` | Read myths, legends and traditional stories; prepare plays to read aloud and perform | English, Years 5–6, reading: comprehension | `F-BKS`, `F-SCR`, `F-VOX` | `A-RETELL`, `A-SHAKES` | `ARC-MYTH`, `ARC-SCENE` | 9–11 | Strong |
| `EN-EN-KS3-1` | Read two Shakespeare plays; see how staging and performance let a play be interpreted in different ways | English, KS3, reading | `F-SCR`, `F-SET`, `F-FRM`, `F-SCRN` | `A-SHAKES` (the same lines, staged two ways) | `ARC-SCENE` | 11–13 | Strong |
| `EN-EN-KS3-2` | Study plot, setting and characters and their effects | English, KS3, reading | `F-LOG`, `F-SCN`, `F-ARC` | `A-RETELL`, `A-PLAN` | `ARC-5`, `ARC-MYTH` | 11–13 | Strong |
| `EN-EN-KS3-3` | Write stories, scripts and other imaginative writing for a range of audiences | English, KS3, writing | `F-SCR`, `F-LOG` | `A-SCRIPT` | `ARC-5`, `ARC-SCENE` | 11–13 | Strong |
| `EN-EN-KS3-4` | Plan, draft, edit and proof-read, thinking about audience and purpose | English, KS3, writing | `F-LOG`, `F-SCR`, `F-SCRN` | `A-PLAN`, `A-SCREEN` | `ARC-5` | 11–13 | Strong |
| `EN-EN-KS3-5` | Improvise, rehearse and perform play scripts and poetry, using voice, tone, volume, silence, stillness and action for effect | English, KS3, spoken English | `F-VOX`, `F-CODE` (timing, pauses, gestures), `F-RUN` | `A-PERFORM`, `A-SHAKES` | `ARC-SCENE` | 11–13 | Partial: the learner directs the performance (voice, timing, gesture) rather than performing it; recording their own voice comes later (WP14.4) |

## Art and design

| Id | Statement (paraphrased) | Source | Features | Activity | Arc | Ages | Fit |
|---|---|---|---|---|---|---|---|
| `EN-AD-KS1-1` | Use drawing and other media to develop and share ideas, experiences and imagination | Art and design, KS1, bullet 2 | `F-FRM`, `F-SET` | `A-BOARD`, `A-STAGE` | — | 6–7 | Partial: frames use the sketch library, not the learner's own drawing (decision 0014) |
| `EN-AD-KS1-2` | Develop techniques with colour, pattern, texture, line, shape, form and space | Art and design, KS1, bullet 3 | `F-SET` (form and space in 3D), `F-FRM` (composition) | `A-STAGE`, `A-BOARD` | — | 6–7 | Partial |
| `EN-AD-KS2-1` | Keep sketchbooks to record observations and to review and revisit ideas | Art and design, KS2, bullet 1 | `F-FRM`, `F-SCN` (the storyboard as a sketchbook) | `A-BOARD` | — | 7–11 | Partial |
| `EN-AD-KS2-2` | Learn about great artists, architects and designers in history | Art and design, KS2, bullet 3 | `F-BKS` (museum scans), `F-LIC` (who made each model) | `A-HISTORY`, `A-PUBLISH` | — | 7–11 | Partial |
| `EN-AD-KS3-1` | Analyse and evaluate their own and others' work to strengthen its visual impact | Art and design, KS3, bullet 4 | `F-SCRN`, `F-FRM` (framing, camera) | `A-SCREEN` | — | 11–13 | Partial |

## History

| Id | Statement (paraphrased) | Source | Features | Activity | Arc | Ages | Fit |
|---|---|---|---|---|---|---|---|
| `EN-HI-AIM` | Use historical concepts (change, cause, consequence) to make structured accounts, including written narratives | History, aims | `F-LOG`, `F-SCN`, `F-SCR` | `A-HISTORY` | `ARC-RECOUNT` | 6–13 | Partial |
| `EN-HI-KS1-1` | Events beyond living memory that matter nationally or globally; the lives of significant people | History, KS1, bullets 2–3 | `F-BKS`, `F-SCN` | `A-HISTORY` | `ARC-RECOUNT` | 6–7 | Partial |
| `EN-HI-KS2-1` | Britain from the Stone Age to the Iron Age; the Romans in Britain; Anglo-Saxons and Scots; Vikings | History, KS2, bullets 1–4 | `F-BKS` (museum scans, Beowulf), `F-SET` | `A-HISTORY`, `A-RETELL` | `ARC-RECOUNT`, `ARC-MYTH` | 7–11 | Partial |
| `EN-HI-KS2-2` | Ancient Greece: life, achievements and influence | History, KS2, bullet 8 | `F-BKS` (Greek myths in the storybook cast) | `A-HISTORY`, `A-RETELL` | `ARC-MYTH` | 7–11 | Partial |
| `EN-HI-KS3-1` | British history in periods from 1066 to the present, and local history | History, KS3, bullets 1–5 | `F-BKS`, `F-SET`, `F-SCR` | `A-HISTORY` | `ARC-RECOUNT` | 11–13 | Partial |

History's fit is partial throughout: StoryStage helps learners tell a historical account well, but the history itself (sources, evidence, interpretation) is the teacher's.

## Science

| Id | Statement (paraphrased) | Source | Features | Activity | Arc | Ages | Fit |
|---|---|---|---|---|---|---|---|
| `EN-SC-LKS2-1` | Report findings orally and in writing, through displays and presentations of results and conclusions | Science, Years 3–4, working scientifically | `F-SCR`, `F-VOX`, `F-EXP` | `A-EXPLAIN` | `ARC-EXPLAIN` | 7–9 | Partial |
| `EN-SC-UKS2-1` | Report and present findings, including conclusions and causal relationships | Science, Years 5–6, working scientifically | `F-SCR`, `F-VOX`, `F-EXP` | `A-EXPLAIN` | `ARC-EXPLAIN` | 9–11 | Partial |
| `EN-SC-Y5-1` | Describe how the Earth and planets move relative to the Sun; use the Earth's rotation to explain day and night | Science, Year 5, Earth and space | `F-SET`, `F-CODE` (turn, move, do together), `F-VOX` | `A-EXPLAIN` | `ARC-EXPLAIN` | 9–10 | Strong |
| `EN-SC-Y3-1` | Animals including humans: skeletons and muscles for support, protection and movement | Science, Year 3 | `F-CODE` (joints: elbow, knee, neck), `F-BKS` | `A-EXPLAIN` | `ARC-EXPLAIN` | 7–8 | Partial |
| `EN-SC-Y5-2` | Forces: levers, pulleys and gears let a smaller force have a greater effect | Science, Year 5, forces | `F-SET`, `F-CODE` | `A-EXPLAIN` | `ARC-EXPLAIN` | 9–10 | Partial: StoryStage animates; it doesn't simulate physics |
| `EN-SC-KS3-1` | Use models and abstract ideas to develop and evaluate explanations | Science, KS3, working scientifically | `F-SET`, `F-CODE`, `F-SCR` | `A-EXPLAIN` | `ARC-EXPLAIN` | 11–13 | Partial |
| `EN-SC-KS3-2` | Space physics: gravity, the Earth's tilt, seasons and day length | Science, KS3, physics | `F-SET`, `F-CODE` | `A-EXPLAIN` | `ARC-EXPLAIN` | 11–13 | Strong |

## No touch point

Listed so nobody over-claims: computing KS2 bullets 4 and 5 (networks; search); computing KS3 bullets 2 (sorting and searching algorithms), 5 and 6 (hardware; binary representation); art and design KS1 bullets 1 and 4, KS2 bullet 2, KS3 bullets 1–3 and 5 (making with physical materials, techniques and media, art history beyond the museum scans).

## What England shows

- **The strongest fit is English, throughout KS1 to KS3**: retelling traditional tales (Years 1–2), settings, characters and plot (Years 3–4), dialogue that moves the action on and performing compositions (Years 5–6), and staging Shakespeare two ways (KS3). Almost every writing-composition strand from Year 1 to KS3 has a touch point.
- **Computing KS1–KS2 is a strong fit on programming** (algorithms, debugging, sequence, selection, repetition, variables, prediction), and **the storyboard check (`F-CHK`) is the best single feature for it**, because it turns "debug your program" into "make it match your plan".
- **KS3 computing is weaker:** it asks for a textual language and theory StoryStage doesn't teach. The text view and the pathway (16.8, WP20) are the bridge, not the destination.
- **Art and design, history and science are partial**, apart from the Earth and space topics (Year 5, KS3), where an animated model is a natural explanation.
- **For the age decision (0030):** the English touch points start in Year 1 (age 5–6); the computing ones run strongly to Year 6 (age 11) and partly to KS3. Ages 6–13 fits; the youngest learners need teacher-led use.
