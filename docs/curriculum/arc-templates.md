# Curriculum arc templates (WP16.6, part 1)

- **Workplan:** 16.6, "curriculum arc templates and 6–10 classroom use cases with lesson outlines (C drafts; U reviews with teachers)". The use cases are in [use-cases/](use-cases/README.md).
- **Decisions:** 0018 (3- and 5-part templates ship regardless; curriculum templates follow the mapping), 0039 (ages 6–13), 0012 (storyboard first), rule 4 (the learner writes every word of the story; the story coach only asks).
- **Status:** **the owner chose on 25 October 2026 to ship tale, myth, scene and explain; recount is held** (WP16's done-when). The wording is a draft until the owner has reviewed it with teachers (16.6).
- **Licence:** CC BY 4.0 (decision 0041).

## How a template works

A learner picks an arc template after writing the title, logline and synopsis (WP10.2). The template gives the storyboard its **parts**; each scene card belongs to one part, and a part can hold one or more scenes. For each part, StoryStage shows:

- a **label**, the part's name on screen ("A problem");
- a **question** under the label, which helps the learner think about what goes there ("What goes wrong?"). The questions work without the Prompter. With the Prompter on, the story coach asks the same questions in conversation and follow-ups, and never writes an answer (rule 4).

**Teacher notes** and curriculum links appear in the teacher guide (WP19.2), never on the learner's screen.

**The words on screen** follow the plain-words rules (CLAUDE.md rule 9): short, in the learner's view, readable by a 7-year-old with help. Every label and question goes into the translation files (decision 0036), with Welsh first in release 1.1 (0040).

## The choice (owner, 25 October 2026)

| Template | Id | Ages | Decision | Why (from the mapping) |
|---|---|---|---|---|
| Traditional tale | `tale` | 6–9 | **Ship** | 15 statements, 13 strong, in all four nations; the youngest learners' main use |
| Myth, legend or quest | `myth` | 8–13 | **Ship** | 13 statements, 10 strong; myths and legends at KS2, and the storybook cast |
| A scene from a play | `scene` | 9–13 | **Ship** | 15 statements, 11 strong; drama, Shakespeare, adapting texts to media |
| Explain how it works | `explain` | 8–13 | **Ship** | 16 statements, 6 strong; the only template for science; strong for space and day and night |
| Retell the past | `recount` | 6–13 | **Hold** | 12 statements, only 3 strong; teachers can use the 3-part template. Revisit after the teacher interviews (16.7) |

For reference, the templates that ship regardless (WP10.2): **free** (no parts), **3-part** (beginning, middle, end) and **5-part** (set-up, conflict, challenge, climax, resolution).

## 1. Traditional tale (`tale`)

For retelling fairy tales, folk tales and traditional stories, and for writing new ones in the same shape. Ages 6–9.

| Part id | Label | Question on screen | Teacher note |
|---|---|---|---|
| `onceUponATime` | Once upon a time | Who is the story about? Where do they live? | Opening: the main character and the setting. One scene. |
| `problem` | A problem | What goes wrong, or what does someone want? | The problem that starts the story. One scene. |
| `tries` | Three tries | What do they try? Does it work? | The traditional rule of three: two tries fail, the third works. One to three scenes. A natural place for a **count** loop in the code. |
| `itWorks` | It works! | How is the problem solved? | The turning point. One scene. |
| `happyEnding` | Happily ever after | How are things different at the end? | Resolution, and the change since the opening. One scene. |

- **Suggested length:** 5 to 7 scenes, 1 to 3 frames each.
- **Curriculum:** `EN-EN-Y1-2`, `EN-EN-Y2-3`, `EN-EN-LKS2-4`, `SC-ENG-x-31` (First level), `WA-LLC-LI-1`, `WA-LLC-LI-2`, `NI-LL-KS1-TL1`, `NI-LL-KS1-R1`; with computing `EN-CO-KS1-2`, `SC-TCH-1-15`, `WA-ST-CO-2`.
- **Cast:** the storybook cast's fairy-tale characters, everyday people, and animals. A stand-in fills any gap (WP10.9).

## 2. Myth, legend or quest (`myth`)

For myths, legends, sagas and quests: Greek myths, Beowulf, the Mabinogion, Fionn mac Cumhaill, Anansi, King Arthur. Ages 8–13.

| Part id | Label | Question on screen | Teacher note |
|---|---|---|---|
| `call` | The call | Who is the hero? What are they asked to do? | The hero, their world, and the challenge they're given. |
| `journey` | The journey | Where do they go? Who helps them, and who gets in their way? | Helpers and enemies; often several scenes in different places. |
| `trial` | The trial | What is the hardest test? What could they lose? | The climax: a monster, a riddle, a choice. |
| `return` | The return | What do they bring back? How have they changed? | Resolution and what the hero has learned. |

- **Suggested length:** 4 to 8 scenes.
- **Curriculum:** `EN-EN-LKS2-4`, `EN-EN-UKS2-1`, `EN-EN-UKS2-4`, `EN-HI-KS2-1`, `EN-HI-KS2-2`, `SC-ENG-x-31`, `SC-ENG-x-19`, `WA-LLC-LI-2`, `WA-LLC-LI-3`, `NI-LL-KS2-TL1`, `NI-LL-KS2-R1`.
- **Cast:** the storybook cast (WP3.6; rights in `docs/legal/storybook-characters.md`). A myth from a living tradition (Anansi, for example) is told with respect; the teacher guide says how.

## 3. A scene from a play (`scene`)

For staging one scene: from Shakespeare or another play, from a class novel, or the learner's own. Ages 9–13.

| Part id | Label | Question on screen | Teacher note |
|---|---|---|---|
| `entrance` | Entrance | Who comes on? What do we need to know? | The situation and the characters on stage. |
| `clash` | The clash | What does each character want? Why can't they both have it? | The conflict, shown through dialogue. |
| `turningPoint` | Turning point | What changes everything? | The moment the scene turns. |
| `exit` | Exit | How does the scene end? Who leaves, and how? | Resolution or cliffhanger; the final image. |

- **Suggested length:** 1 scene split into 4 to 6 shots, or up to 4 short scenes.
- **Using a playwright's words:** a learner may stage a play's own lines, typing them in or using the Fountain import (WP8) for a public-domain text such as Shakespeare. The staging, the camera and the code are theirs. The Prompter still never writes script lines (rule 4).
- **Curriculum:** `EN-EN-KS3-1`, `EN-EN-KS3-5`, `EN-EN-UKS2-4`, `SC-EXA-x-14`, `SC-EXA-x-15`, `WA-LLC-LI-4`, `WA-EA-CR-3`, `NI-AR-KS2-DR`, `NI-AR-KS3-DR`, `NI-LL-KS3-3`.
- **Use with:** "The same scene, staged two ways" ([use-cases/07-two-stagings.md](use-cases/07-two-stagings.md)).

## 4. Explain how it works (`explain`)

For short explanation films in science, geography or technology: day and night, the solar system, a skeleton moving, a lever. Ages 8–13.

| Part id | Label | Question on screen | Teacher note |
|---|---|---|---|
| `question` | The question | What are we going to find out? | Pose it as a question: "Why do we have day and night?" |
| `whatWeSee` | What we see | What happens that anyone can notice? | The observation, from everyday experience or an investigation. |
| `whyItHappens` | Why it happens | What is really going on? Show it moving. | The explanation, modelled: the Earth turning, the Sun still. The scientific accuracy is the teacher's to check. |
| `soWhat` | What it means | What should we remember? | The conclusion, in one or two sentences of narration. |

- **Suggested length:** 4 to 6 scenes, narrated by an on-device voice, with captions (recording a learner's own voice comes in release 1.2, WP14.4).
- **StoryStage animates; it doesn't simulate.** The model shows what the learner codes, so a wrong explanation looks just as smooth as a right one. Checking the science is part of the lesson.
- **Curriculum:** `EN-SC-Y5-1`, `EN-SC-KS3-1`, `EN-SC-KS3-2`, `EN-SC-LKS2-1`, `EN-SC-UKS2-1`, `SC-SCN-1-06`, `SC-SCN-2-06`, `SC-LIT-x-28`, `WA-ST-FE-3`, `NI-WAU-KS2-1`; with computing `EN-CO-KS2-1`, `SC-TCH-3-13`.

## 5. Retell the past (`recount`), held

For a historical event or a way of life. Ages 6–13. **Held** (see the recommendation), but drafted so the owner can choose it.

| Part id | Label | Question on screen | Teacher note |
|---|---|---|---|
| `settingTheScene` | Setting the scene | When and where are we? Who lived here? | The period and the place, from sources. |
| `whatHappened` | What happened | What happened, in order? | Chronology; one or more scenes. |
| `whatChanged` | What changed | What was different afterwards? How do we know? | Consequence, and the evidence for it. |

- **Curriculum:** `EN-HI-AIM`, `EN-HI-KS1-1`, `EN-HI-KS2-1`, `SC-SOC-1-03`, `SC-SOC-1-04`, `WA-HU-EV-3`, `NI-WAU-KS2-2`.
- **Cast and props:** museum scans (WP3.7) and everyday people. The historical accuracy is the teacher's to check.

## For the storyboard (WP10.2): the data

The production format (WP0.8, `packages/production/src/types.ts`, owned by S4) stores a curriculum template as `{ curriculum: '<id>' }`, its parts in `arc.parts`, and a scene's part in `arcPart`. Here is proposed data for S4 and S5 to put where WP10.2 keeps the built-in templates.

**One suggestion for S4:** the example production stores part names as plain words (`'beginning'`). If `arc.parts` and `arcPart` hold the **part ids** below, and the labels come from the translation files, then a production made in English still opens correctly in Welsh (decision 0040).

```json
{
  "templates": [
    {
      "id": "tale",
      "ages": [6, 9],
      "parts": [
        { "id": "onceUponATime", "label": "Once upon a time", "question": "Who is the story about? Where do they live?" },
        { "id": "problem", "label": "A problem", "question": "What goes wrong, or what does someone want?" },
        { "id": "tries", "label": "Three tries", "question": "What do they try? Does it work?" },
        { "id": "itWorks", "label": "It works!", "question": "How is the problem solved?" },
        { "id": "happyEnding", "label": "Happily ever after", "question": "How are things different at the end?" }
      ]
    },
    {
      "id": "myth",
      "ages": [8, 13],
      "parts": [
        { "id": "call", "label": "The call", "question": "Who is the hero? What are they asked to do?" },
        { "id": "journey", "label": "The journey", "question": "Where do they go? Who helps them, and who gets in their way?" },
        { "id": "trial", "label": "The trial", "question": "What is the hardest test? What could they lose?" },
        { "id": "return", "label": "The return", "question": "What do they bring back? How have they changed?" }
      ]
    },
    {
      "id": "scene",
      "ages": [9, 13],
      "parts": [
        { "id": "entrance", "label": "Entrance", "question": "Who comes on? What do we need to know?" },
        { "id": "clash", "label": "The clash", "question": "What does each character want? Why can't they both have it?" },
        { "id": "turningPoint", "label": "Turning point", "question": "What changes everything?" },
        { "id": "exit", "label": "Exit", "question": "How does the scene end? Who leaves, and how?" }
      ]
    },
    {
      "id": "explain",
      "ages": [8, 13],
      "parts": [
        { "id": "question", "label": "The question", "question": "What are we going to find out?" },
        { "id": "whatWeSee", "label": "What we see", "question": "What happens that anyone can notice?" },
        { "id": "whyItHappens", "label": "Why it happens", "question": "What is really going on? Show it moving." },
        { "id": "soWhat", "label": "What it means", "question": "What should we remember?" }
      ]
    },
    {
      "id": "recount",
      "ages": [6, 13],
      "held": true,
      "parts": [
        { "id": "settingTheScene", "label": "Setting the scene", "question": "When and where are we? Who lived here?" },
        { "id": "whatHappened", "label": "What happened", "question": "What happened, in order?" },
        { "id": "whatChanged", "label": "What changed", "question": "What was different afterwards? How do we know?" }
      ]
    }
  ]
}
```

`ages` is advisory: the teacher guide uses it, and StoryStage may sort the list by it, but any learner can choose any template. Teachers can't add templates in the first release; a template editor is a question for the teacher interviews (16.7).
