# Handoff: StoryStage 2 — first-release UI (Direction A, "Film studio")

## Reconciled with the decisions (25 Oct 2026)
This is the owner's handoff of 22 Oct 2026, edited where it disagreed with `CLAUDE.md`, the workplan or `docs/decisions/` (the list S1 made on #49). The handoff as delivered is in the history of this file (commit `b0a73ea`). Where the owner has not decided yet, the text says what to build meanwhile.

| # | Point | Now |
|---|---|---|
| 1 | Platforms | Apps for Windows, macOS, iPad and Chromebook, plus the browser version ([0003](../../decisions/0003-delivery.md)) |
| 2 | Age range | 6–13, provisional ([0030](../../decisions/0030-age-range.md)) |
| 3 | Stack | Fixed: React and TypeScript ([0006](../../decisions/0006-ui.md)), Babylon.js ([0007](../../decisions/0007-3d.md)) |
| 4 | School key, school service, "Email me at 80%" (11b) | **Open** until WP24.3 (M1). Build 11b with the key and limits on the device ([0005](../../decisions/0005-api-key.md)) |
| 5 | Fonts | Bundled from Fontsource, never from Google Fonts ([0031](../../decisions/0031-fonts.md)) |
| 6 | Theme | Dark as drawn, plus a light theme drawn on 25 Oct 2026 and approved ([0032](../../decisions/0032-light-theme.md), [0038](../../decisions/0038-light-theme-approved.md)); see "Colour, light theme" |
| 7 | Tiles look | Alice 3's grammar with our own artwork until Carnegie Mellon replies (WP17.1) |
| 8 | Alice screenshots (`reference/`) | Not in this repository; the owner holds them |
| 9 | Sizes | Laptop and iPad sizes added in [`sizes/`](sizes/index.html) (12.1); rules in `docs/spec/07-ux.md` §1; nothing below 1024 px wide ([0033](../../decisions/0033-narrow-windows.md)) |
| 10 | Storyboard first | The closed Code editor (10.8) added as screen 02c |
| 11 | Prompter levels | As drawn, mapped to the modes and policy keys ([0034](../../decisions/0034-prompter-levels.md)) |
| 12 | Study logs | "Anonymised" changed: the logs are pseudonymous (7.13, 24.6) |

## Overview
StoryStage 2 is a free 3D animated-film studio for learners aged 6–13 (provisional, decision 0030) in UK schools, clubs and homes. Learners make films the way the industry does, in three modes that are always visible as the primary navigation:

1. **Storyboard** – plan: title, logline, synopsis, scenes, frames, script lines pinned to frames, black-and-white sketches, shot type and length.
2. **Production stage** – build and code each frame: colour 3D scene view plus a code editor (Blocks or Tiles), with Backstage (Cast, Props, Set, Backdrops) and an optional AI helper, **the Prompter**.
3. **Screening room** – watch the rough cut, compare it with the storyboard, run the automatic check, export an MP4.

The Prompter is an optional AI helper. It coaches, and builds only on request after showing a plan. It never writes the learner's story. Code is drag-and-drop only, so programs cannot contain syntax errors.

This package covers 20 screens plus a component sheet, all drawn at **1366 × 768** (a school Chromebook). [`sizes/`](sizes/index.html) adds the screens 12.1 names at **laptop (1536 × 864)** and **iPad (1180 × 820, landscape)**, and one new state (02c).

## About the design files
The files in `design/` are **design references created in HTML**. They are static, hand-built prototypes that show the intended look, layout, copy and states. They are **not production code**: the markup is inline-styled for review and is not structured for reuse. They load React and Babel from unpkg, and fonts from Google Fonts, for preview only; nothing from them goes into the app.

Your task is to **recreate these designs in `apps/studio`**. The stack is fixed: React and TypeScript in this monorepo (decision 0006) and Babylon.js (decision 0007); `CLAUDE.md` has the rest. Use the HTML as the visual source of truth and this README as the behavioural spec.

Open `design/StoryStage Direction A - Index.dc.html` in a browser. It links to every screen file. Each file opens on its own, as long as `support.js` and `Figure.dc.html` sit beside it.

## Fidelity
**High fidelity.** Colours, type, spacing, radii, copy, focus rings and status treatments are final. Recreate them closely. Two exceptions:
- **Character art** (owl, cat, child, robot, tree, key) consists of simple placeholder line drawings. Replace it with the real Cast models and sketch art.
- **The dragon model preview** on screen 07 is a striped placeholder box.

## Platform decisions (settled)
- **Two deployments from one codebase** (decision 0003):
  - **Apps** (Tauri 2) for **Windows, macOS, iPad and Chromebook** (Android, where the school allows it), all with the Prompter. No Linux in the first release.
  - **Browser version**, with **no Prompter** at all: no panel, no rail, no set-up steps 10b–10c, and no Prompter settings. It uses the layout in 12b plus the neutral note. The build hands the studio a host interface that says whether a Prompter transport exists (decision 0028); the studio never checks which platform it is on.
- **Claude key model**, depending on context:
  - **Home or individual use:** a key **per device**, entered by the adult on first run (10a → 10c) and kept in the OS secure store. Only the app's native layer uses it; web code never sees it (decision 0005).
  - **School or club group use:** a key **per school or class**, set by the teacher or IT manager under Settings › Prompter key (screen **11b**). Learners never see or enter it. The class Prompter level and daily limit (11) apply on top. Group devices should skip 10b–10c, or show "Your school manages the Prompter".
  - **Open (WP24.3, due at M1): how the Prompter reaches a group.** The options are A (clubs and home: the adult who owns the key), B (a classroom relay through the teacher's app) and C (keys put on devices by device management). There is no StoryStage server and no school service. Until the owner decides, build 11b with the key in the secure store of the device it is entered on, and enforce the limits there.
- **3D engine: Babylon.js** (Apache 2.0, decision 0007), used for both the app and browser builds. S3 pins the version once, in `packages/stage`; the spikes use `^9.31.1`. The 9.31.0 publish was interrupted, so never pin 9.31.0. Notes for the screens:
  - **Scene view (02, 04, 12b):** use an `ArcRotateCamera` for "Look around" and the shot camera for "Camera view". Draw the camera-frame overlay ("Camera · Medium") as HTML over the canvas, not in the 3D scene. Keep it 2px chalk with the label chip.
  - **Shot types:** Wide, Medium and Close-up are camera presets (distance and field of view) framed on the subjects in the shot.
  - **Film stills and rough cut (03, 08):** render frames from the shot camera. Write the MP4 with WebCodecs where available, falling back to a desktop encoder. The progress steps on screen 09 map to rendering, compositing captions and credits, and saving the file.
  - **Backstage import (07):** load glTF/GLB with the Babylon loaders. Do the triangle reduction and texture resizing before adding the model to the scene. Use Babylon 9's animation retargeting to map the skeleton onto the Cast rig; the result is shown as "20 of 22 joints".
  - **Automatic check (08):** measure left, centre and right by projecting each actor's bounds into the shot camera's screen space, then compare with the sketch's placement in the storyboard frame.
  - **School hardware:** target WebGL2 as the baseline for Chromebooks, with WebGPU as an optional enhancement. Keep each scene within the import budget (about 12,000 triangles and 1K textures per model).
- **Tiles look and feel:** follow **Alice 3's grammar** closely: how tiles nest, the drop line, value menus, add detail. Draw it with our own artwork until Carnegie Mellon University replies (WP17.1); then the owner decides how closely to copy Alice's look. Do not use the name "Alice" in the product. Keep these deliberate deviations unless told otherwise:
  - darker tile blue and green for 4.5:1 contrast;
  - 44px hit targets;
  - plain-words labels ("owl", not "this.owl"; "code for", not "declare procedure"; Actions and Questions for Procedures and Functions; "Parts of the cat" for Joints);
  - the "Drops here" label on the drop line.

  Switching any label back to Alice's wording is a copy change only.
- **Screenshots** of every screen are in `screenshots/` (1366 × 768 PNG; the component sheet is 1366 wide), and at laptop and iPad sizes in `screenshots/sizes/`. Use them for side-by-side checks.
- **Screen sizes:** the app is designed for 1024 px wide and up. Laptop (1440 and up), Chromebook (1280–1439, as drawn) and iPad landscape (1024–1279) each have their own layout rules (`docs/spec/07-ux.md` §1). Below 1024 px wide (iPad portrait, narrow windows) the studio shows a neutral note asking to turn the iPad sideways or widen the window (decision 0033).

---

## Global layout (every learner screen)

```
┌──────────────────────────────── 1366 ────────────────────────────────┐
│ Header 64px  [mark][StoryStage] | title/sub  [MODE TABS]  | Learn Settings │
├┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ 3px amber frame (#F4B740) ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤
│  Working area (704px tall, inside the frame)                          │
└───────────────────────────────────────────────────────────────────────┘
```

- **Page background:** `#13100E` (the Screening room uses `#0E0C0B`).
- **Header** (64px, background `#13100E`, padding `0 12px 0 14px`, items aligned to the bottom edge):
  - **Logo mark:** a 36px rounded square (radius 10, fill `#2B2520`, 1px inset `#3B332C`). Inside: an amber spotlight beam (`#F4B740` at 35% opacity, polygon 14%/10% → 34%/10% → 92%/80% → 44%/80%), a chalk "lamp" dot (7px, `#F5EFE6`, top-left) and an amber pool ellipse (18 × 6px, bottom). Do not draw it as a literal clapperboard.
  - **Wordmark:** "Story" in `#F5EFE6` followed by "Stage" in `#F4B740`. Bricolage Grotesque 800, 22px, letter-spacing −0.02em.
  - **Production title:** "The Owl and the Key" in 16px bold, with a sub-line (for example "Scene 2 · Frame 2.3") in 14px `#C2B6A7`, after a 1 × 28px divider in `#3B332C`.
  - **Mode tabs**, centred, gap 6px. Each tab is 50px tall, padding `0 16px`, radius `12px 12px 0 0`, with a 24px icon and a gap of 8. Label: Bricolage Grotesque 800, 16px, letter-spacing 0.07em, **UPPERCASE**.
    - Active: background `#F4B740`, text `#1B1407`. The active tab sits directly on top of the amber frame so the two read as one shape.
    - Inactive: background `#2A231E`, text `#F5EFE6`, 1px inset border `#5A4B3D` on the top, left and right.
  - **Right group**, after a divider: **Learn** and **Settings**. Each is 84 × 46px, with a 22px icon above a 15px label and a 1px border `#8A7B6A`. When active they become an amber tab (Settings) or an amber button (Learn). They are deliberately separate from the three modes.
- **Amber frame:** a 3px solid `#F4B740` border around the whole working area, with radius `0 0 8px 8px`. The header sits outside it.
- **Other sizes:** on iPad the wordmark folds to the logo mark and the tabs narrow; on a laptop the extra room goes to the frame canvas, the scene view and the player. See `sizes/` and `docs/spec/07-ux.md` §1.

## Design tokens

**Theme:** these are the dark theme's values; dark is the only theme drawn. The first release also has a light theme (decision 0032). Its values are in "Colour, light theme" below, approved by the owner (decision 0038). Name tokens by role (`panel-2`, `chalk`), never by colour, so a second theme only swaps values.

### Colour (Direction A)
| Token | Hex | Use |
|---|---|---|
| stage-0 | `#13100E` | page and stage background |
| stage-0b | `#0E0C0B` | Screening room background |
| panel-1 | `#1E1915` | side rails, code area |
| panel-2 | `#241E1A` | panels and sidebars |
| panel-3 | `#2F2822` | cards and tiles on panels |
| panel-4 | `#3A3129` | raised chips and thumbnails |
| band | `#342B24` | panel title bands (56–60px headers) |
| line-1 | `#5A4B3D` | panel dividers |
| line-2 | `#8A7B6A` | control outlines: inputs, secondary buttons (≈4.5:1 on panels) |
| chalk | `#F5EFE6` | primary text, strong secondary button |
| chalk-2 | `#E3D9CC` | body text on panels |
| muted | `#C2B6A7` | secondary text (≥4.5:1 on panel-2) |
| amber | `#F4B740` | spotlight accent: active mode, primary buttons, focus ring, frame |
| amber-ink | `#1B1407` | text on amber |
| amber-tint | `#2E2519` | selected card background |
| prompter | `#6FD3C7` | **reserved for the Prompter (AI) only** |
| prompter-bg | `#173A36` | Prompter icon disc |
| prompter-ink | `#0E2B28` | text on the prompter colour ("AI" badge) |
| ok | `#7BD88F` | Checked, Matches |
| flag | `#FFB59A` | Look at, warnings |
| flag-bg | `#2A1E19` | flagged card background |
| stop | `#E58A6A` | Stop button outline and icon |
| sketch-paper | `#FFFFFF` | storyboard frames and sketches |
| sketch-ink | `#161412` | sketch lines |

Status colours, by status:
- Planned `#D8CDBF` with the `edit_note` icon.
- Staged `#8FBBFF` with `view_in_ar`.
- Coded `#BBA6FF` with `extension` (filled).
- Rehearsed `#F4B740` with `replay`.
- Checked `#7BD88F` with `check_circle` (filled).
- Look at `#FFB59A` with `flag` (filled).

**Status is never shown by colour alone.** Every status always shows its icon and its word.

### Colour, light theme (decisions 0032 and 0038; approved 25 Oct 2026)
The light theme keeps every role and swaps its value. Neutrals turn from a dark stage to warm paper and ink. Fills keep the amber, the Prompter teal and the block colours, so the active tab, primary buttons, the AI badge and blocks look the same in both themes. An accent used as **text or an outline** takes a darker shade, so text reaches 4.5:1 and outlines 3:1 on paper. Mock-ups: open any screen in `sizes/` with `?theme=light`, or `sizes/index.html?theme=light`; PNGs in `screenshots/light/`.

| Token | Dark | Light | Notes |
|---|---|---|---|
| stage-0 | `#13100E` | `#F6F1E9` | page and stage |
| stage-0b | `#0E0C0B` | `#F1EBE1` | Screening room |
| panel-1 | `#1E1915` | `#F0EAE1` | side rails, code area |
| panel-2 | `#241E1A` | `#FBF8F3` | panels and sidebars |
| panel-3 | `#2F2822` | `#FFFFFF` | cards |
| panel-4 | `#3A3129` | `#E9E1D5` | raised chips, thumbnails |
| band | `#342B24` | `#EFE6D9` | panel title bands |
| line-1 | `#5A4B3D` | `#D5C8B8` | dividers (decorative) |
| line-2 | `#8A7B6A` | `#7D6E5D` | control outlines, 3:1 or more |
| chalk | `#F5EFE6` | `#1F1A17` (ink) | primary text; as a fill (selected segment, strong button) `#2A2420` with `#FBF8F3` text |
| chalk-2 | `#E3D9CC` | `#3A322B` | body text |
| muted | `#C2B6A7` | `#665A4E` | secondary text |
| placeholder | `#AFA394` | `#74685B` | |
| amber | `#F4B740` | `#F4B740` as a fill; `#8F5600` as text; `#B87300` as an outline; `#A35F00` focus ring | the 3 px frame stays `#F4B740` |
| amber-ink | `#1B1407` | `#1B1407` | text on amber |
| amber-tint | `#2E2519` | `#FCEFD0` | selected card |
| prompter | `#6FD3C7` | `#6FD3C7` as a fill (AI badge); `#0B6E64` as text; `#0E7C70` as an outline | still reserved for the Prompter |
| prompter-bg | `#173A36` | `#D3F2EE` | Prompter icon disc |
| ok | `#7BD88F` | `#1C7431` | Checked, Matches |
| flag | `#FFB59A` | `#B13D14` text, `#C2522B` outline | Look at |
| flag-bg | `#2A1E19` | `#FDECE5` | |
| stop | `#E58A6A` | `#B0412A` | |
| unavailable | `#2B2520` / `#8F8476` | `#ECE6DD` / `#8A7D70` | |
| Planned, Staged, Coded | `#D8CDBF`, `#8FBBFF`, `#BBA6FF` | `#5A4F44`, `#2357B5`, `#6443C0` | Rehearsed, Checked, Look at as amber, ok and flag |
| sketch-paper, sketch-ink | `#FFFFFF`, `#161412` | unchanged | sketches are black on white in both themes |

The 3D scene view, the film player and the Blocks and Tiles editors look the same in both themes. Shadows are lighter (`rgba(60,40,20,.22)`); a focus ring keeps its 2 px gap in the surface's own colour. Dialog scrims stay dark.

### Blocks editor colours
- **Motion block:** `#2F64C8`, white text.
- **Say block:** `#B8466E`, white text.
- **Camera block:** `#E0A030`, text `#1B1407`.
- **Value pills:** white with dark text (`#1B2B52`, `#4A1A2C` or `#1B1407`), radius 7.
- **Block size:** height 44, radius 10.
- **Event hat:** "When frame 2.3 starts", on `#3A3027` with a 1px border `#5A4B3D` and radius 12.

### Tiles editor colours (Alice 3 grammar, contrast-adjusted)
- **Editor chrome:** surround `#F6F6F6`; editor panel `#E7E6F7` with a 1px border `#A9A7C9`; program area `#FFFFFF` with a 1px border `#9A9AAE`.
- **Gold class tab** (for example "Scene 2"): `#FFE68A`, text `#7A5C00`, 22px.
- **Method tabs:**
  - Active: `#E7E6F7`, bold 17px.
  - Inactive: `#ECECEC`, text `#55555F`.
  - Shape: radius `10px 22px 0 0`.
- **Action tile (statement):**
  - Body: background `#5A5AD6`, 1.5px border `#2E2E9E`, white text, height 44, radius 6.
  - Grip: a 12px strip on the left, `#4646C2`, with a 4px dot grid of `#C9C9FF` dots.
- **Object pill:** `#FFD43B`, 1px border `#B38F00`, text `#1A1400` bold, radius `14px 6px 6px 14px`, with a ▾ in `#6B5600`.
- **Value pill:** `#FFD43B`, radius 6. Text values have a white 16 × 18px glyph box showing `“`; numbers show `=`.
- **add detail ▾:** `#C4C4F7`, text `#14143A`, radius 4.
- **Placeholder in the palette:** `#8484E6`, with an italic label ("text:") and a `???` chip in `#E4E4EC`.
- **Control box** (if/else, count, do together, do in order):
  - Box: white, 1px border `#A6A6B4`, radius 6.
  - Grip: a 12px dotted strip on the left (`#9A9AAA` dots), with a 1px divider `#D6D6DE`.
  - Content: header text in `#14143A`, children indented 18px.
- **Empty slot:** "drop statement here", bold, with a 1.5px dashed border `#8A8A96`, radius 7, height 44.
- **Drop line (while dragging):**
  - Line: 5px `#1E7A34`, with a 13px right-pointing triangle at the left end.
  - Label: a "Drops here" pill on the right, white on `#1E7A34`. The label is our addition for young learners.
- **Drag ghost:** the dragged tile at 60% opacity, with a drop shadow, following the pointer.
- **Value menu:**
  - Panel: white, 1px border `#B9B9C6`, radius 6, shadow `0 14px 34px -8px rgba(20,20,58,.45)`.
  - Rows: italic header "target:" in `#55555F`, then 44px rows of object pills. The selected row has background `#EEF3FD`.
  - Submenu arrow: blue `#1E66D0` (32 × 36), with a white chevron.
  - Position: the menu opens anchored to the value pill, with a caret pointing at it.
- **Questions tiles (functions):** `#8FD694`, 1.5px border `#3C8F45`, text `#0F3B12`, radius `20px 6px 6px 20px`.
- **Questions palette tab:** `#DDF5DF`, 1px border `#8CC394`, text `#1C6B2E`.
- **Control tiles bar:**
  - Default: white, 1px border `#8E8E9E`, with a dotted grip on the left.
  - "assign": blue like an action tile.
  - "//comment": `#DCEFD8`, 1px border `#6E9C66`, text `#17501F`.
- **Focus ring on light (Tiles) surfaces:** `0 0 0 2px #FFFFFF, 0 0 0 5px #C77700`.

We darkened Alice's original tile blue and green so that white or dark text passes 4.5:1. Keep that adjustment.

### Typography
| Role | Font | Size and weight |
|---|---|---|
| Display / screen titles | Bricolage Grotesque | 26–30px, 800, −0.01 to −0.02em |
| Mode tab labels | Bricolage Grotesque | 16px, 800, 0.07em, UPPERCASE |
| Panel titles | Bricolage Grotesque | 18–20px, 700 |
| UI and body | Atkinson Hyperlegible | **16px minimum**, 400/700; line-height 1.3–1.45 |
| Secondary / meta | Atkinson Hyperlegible | 14–15px (labels only, never body copy) |
| Script dialogue (frame) | Atkinson Hyperlegible | 18px |
| Key entry | ui-monospace | 16px, 0.08em |

Both fonts are under the SIL Open Font Licence 1.1, which the licence policy allows for font packages only (decision 0031). Install them from npm as Fontsource packages, bundle them as published, list them in `NOTICE`, and never load them from Google Fonts at run time. Icons are **Material Symbols Rounded** (Apache-2.0; variable; use FILL 1 for status icons that are filled), bundled the same way.

### Spacing, radius, elevation
- **Spacing:** a 4px base. Common values are 4, 6, 8, 10, 12, 14, 16 and 22px.
- **Radius:**
  - 6: frames and tiles
  - 8–10: chips and small buttons
  - 12: buttons, inputs, cards
  - 14: panels
  - 16–20: dialogs
  - 999: pills
- **Dialogs:** background `#1B1714`, 1px border `#4A4036`, radius 20, shadow `0 40px 100px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(244,183,64,.15)`. The scrim behind them is `rgba(10,8,7,.74)`.
- **Storyboard frame canvas:** white with radius 6, shadow `0 40px 90px -30px rgba(244,183,64,.45)` (the spotlight glow).
- **Focus ring (dark surfaces):** `0 0 0 2px <surface>, 0 0 0 5px #F4B740`. On amber surfaces, use a chalk ring instead: `0 0 0 2px <amber surface>, 0 0 0 4px #F5EFE6`. Every interactive element must show a visible focus ring.

### Hard rules (accessibility and copy)
- **Size and contrast:**
  - Body text ≥16px.
  - Text contrast ≥4.5:1 (WCAG 2.2 AA).
  - Control boundaries ≥3:1.
- **Controls and input:**
  - Every main control has an **icon plus label**.
  - Hit targets are ≥44 × 44px.
  - A **voice (mic) button** sits beside every text field where learners type. The one deliberate exception is the Claude key field (10c): keys must never be spoken aloud.
- **The Prompter:**
  - It always shows the **"AI" badge**: `#6FD3C7` background, `#0E2B28` text, bold 14px.
  - Its colour is never used for anything else.
  - It always offers **Stop** and **Undo this request**.
- **Product terms, used exactly:** Storyboard, Production stage, Screening room, Backstage, Cast, Props, Set, Backdrops, the Prompter, Rehearse, frame, shot.
- **Words never shown on screen:** AST, node, field, invocation, edit, token, schema, API (`CLAUDE.md` rule 9). Name each step after what changed ("Add cat"); these are also the undo labels. Errors say what happened and what to do next, with no apologies.
- **Copy style:** UK English, short and encouraging, with no exclamation-mark overload.
- **Art style:** storyboard sketches are black lines on white; the 3D scene is in colour. Keep that contrast deliberate.

---

## Screens
Sample production on every screen: **"The Owl and the Key"**, 3 scenes, 9 frames:
- Scene 1, "The locked gate": 1.1–1.3.
- Scene 2, "Finding the key": 2.1–2.4.
- Scene 3, "Home at last": 3.1–3.2.

Frame 2.3 has the owl by a tree, the cat on the right, the line "OWL: Here is the key." and a medium shot lasting 3 s.

### 01 Storyboard — `01-03 Core modes`
Columns, left to right:
1. **Backstage panel** (236px). A title band "Backstage" with an icon and a collapse button (44px). It has four labelled sections: **Cast** (a 2-column grid of 80px cards, with colour figure and name), **Props** (3-column, 64px), **Set** (a 48px row) and **Backdrops** (2-column, 56px; the selected one has a 2px amber border).
2. **Sketch library** (132px). White 92px cards, each with a black-line sketch and a bold name.
3. **Main area** (fluid, padding 14 × 16, warm radial glow behind the frame). It contains:
   - **Script header card**: the title in Bricolage 26px, a "3 scenes · 1 min 12 s" pill, then Logline and Synopsis rows. Each row has a 78px label column, the text, and a 44px mic button.
   - **Scene strip**: three scene cards with their frame numbers as 44px white squares, plus a dashed "+ Scene" card. The selected scene card has a 2px amber border and a tinted background. The selected frame (2.3) is amber with a chalk focus-style ring.
   - **Shot controls**: a segmented Wide | Medium | Close-up (44px, icon plus label; the selected segment is chalk), with **visible focus shown on Medium**, and a Length stepper (− 3 s +) on the right.
   - **Frame canvas** (592 × 333, white). The header reads "Frame 2.3" with a MEDIUM tag and "3 s". The sketches are placed on it (tree, owl, key, cat flipped to the right); the selected sketch has an amber selection box with corner handles. The bottom 52px is a pinned script line, "📌 OWL: Here is the key.".
4. **Script pane** (290px). A title band "Script · Scene 2". It lists lines with a 52px frame pin (📌 2.1, and so on), a speaker name (14px caps) and the line. The line pinned to the current frame is amber-highlighted. Below the lines, an unpinned line has a dashed "Pin" target. Further down: an input "Type or say a line…" with an amber 48px mic. At the bottom: a collapsed **"Ask the Prompter"** button (52px, 1.5px prompter-colour border, headset icon, AI badge).

### 02 Production stage (Blocks, Prompter open) — `01-03`
- **Frame strip** (80px, below the frame top): frames grouped by scene label. Each frame card is 140 × 50 and shows a sketch thumbnail, the frame number and a **status chip** (icon plus word). The current frame has an amber border. Example statuses: 1.1–1.2 Checked, 1.3 Rehearsed, 2.1 Coded, 2.2 Staged, 2.3 Planned.
- **Left rail** (96px): Backstage, with Cast, Props, Set and Backdrops as 80 × 68 icon-plus-label buttons.
- **Centre:**
  - **Scene view**, with a header row: "Scene view", a note ("Frame 2.3 · sketch asks for a medium shot, 3 s"), a Camera view | Look around toggle and the **Rehearse** button (amber, play icon). Below it, a colour 3D view 248px tall, with a camera frame overlay labelled "Camera · Medium" and an "In this shot: Owl Cat Tree Key" chip.
  - **Code area** beneath. A Blocks palette (300px) with an object picker, and a canvas with a dot grid showing the event hat "When frame 2.3 starts / do in order" and an empty dashed drop zone: "Drag blocks here, or ask the Prompter to build its plan."
- **The Prompter panel** (340px, right):
  - **Header:** a teal headset disc, "The Prompter", the AI badge and "Suggests. You decide."
  - **Request:** a "You asked" bubble: "Make the owl give the cat the key."
  - **Plan:** "Plan before change", with a "Nothing built yet" pill and four numbered plan steps. Each step is ≥52px, with a drag handle, number disc, plain-words text and an edit (44px) button. **Focus is shown on step 2** (it can be reordered with the arrow keys). Below the steps: "+ Add a step" with a mic.
  - **Footer:** **Build these steps** (primary, 52px), then **Stop** (stop style) and **Undo this request** (secondary).

### 03 Screening room — `01-03`
- **Left** (768px):
  - **Player:** 768 × 432 with a subtitle overlay. Below it, the transport: Play (amber pill), 0:38 / 1:12, a timeline split into scene segments with a playhead, and Full screen.
  - **Running order:** three draggable scene cards (thumbnail, title, status chip with duration). Scene 2 is selected and shows "1 to look at".
- **Right:**
  - "Rough cut / Watch, check, then share." with an **Export film** button (chalk).
  - **Compare with storyboard** card: frame navigation (‹ Frame 2.3 ›), then the sketch and the film still side by side. The difference is circled with a dashed flag-colour ellipse.
  - **Automatic check · Frame 2.3** card: 3 rows marked Matches, then one flagged row, "Cat ends in the middle; your sketch has it on the right." The flagged row has the actions **Fix on the Production stage** (focus shown) and **Keep it**.
- **There is no Prompter and no Backstage in this mode.**

### 04 Production stage, Tiles editor — `04-06`
Same shell as 02, with a 88px **collapsed Prompter rail** on the right (button: headset disc, "The Prompter", AI badge).
- **Left column** (430px):
  - **Scene view** (232px tall), with Rehearse overlaid top-right.
  - **Methods panel** in Alice style: a light-blue bar `#D3E7F8` holding a figure and a big object pill ("owl ▾", 24px). Under it are the tabs **Actions** (lavender) and **Questions** (green), plus "group by category ▾". The palette list has italic category labels ("say, think", "position") above placeholder tiles (owl say *text:* ???).
- **Right column:**
  - **Code header:** "Code", the **Blocks | Tiles** switch (segmented, 44px; the selected segment is chalk) and the note "⇄ Blocks and Tiles edit the same code."
  - **Tab row** (54px tall): gold "Scene 2", then frame tabs "Frame 2.2" and "Frame 2.3" (active), with **Clipboard** aligned to the top so an 8px gap is left below it.
  - **Editor panel:** "*code for* **Frame 2.3**", with the line on the right. Program, inside "do in order":
    - owl fly to [tree]
    - owl turn to face [cat]
    - **do together** (white control box): owl say [“Here is the key.”], duration [=2.0] (**focus shown**); key move to [cat]
    - camera shot [medium], on [owl and cat], duration [=3.0]
  - **Control tiles bar:** do in order, count _, while _, for each in _, if _, do together, each in _ together, variable…, assign, //comment.

### 04b Tiles: dragging a tile in — `04b-04c`
Program: owl fly to [tree]; **drop line** (with a "Drops here" pill); then an **if [true▾] is true then** box containing owl say [“Here is the key.”], with **else** holding an empty "drop statement here" slot; then the camera shot. A 60% ghost of "owl turn to face *target:* ???" follows the pointer, and the original stays in the palette.

### 04c Tiles: choosing a value — `04b-04c`
Program: owl fly to [tree]; **count up to [=2]** containing owl turn [left] [=0.25]; **do together** containing owl say [“Here is the key.”] and a **dimmed** (45% opacity, partly greyed) "key move to [???]". The **target: menu** opens upward from the ??? pill with a caret. Its rows are camera, tree, owl and **cat**; the cat row is selected, has a focus ring and a blue submenu arrow. The submenu "Parts of the cat", to the right with its bottom aligned to the menu's bottom, lists green Questions tiles: [cat] head, left paw, right paw, tail.

### 05 Editor switch — `04-06`
Shown over screen 04. A dialog (900px) titled "⇄ Switching to Tiles", with the copy: "Blocks and Tiles are two ways of showing the same instructions, like one story in a picture book or a chapter book. Your program stays the same." Below that, a Blocks → Tiles side-by-side preview showing the first 3 steps of each, then "and 2 more". Next, a green confirmation bar: "✓ Your program is kept. 5 steps, same order. Nothing has changed." Buttons: **Show me Tiles** (primary, focus shown) and **Stay with Blocks**, plus a tick box, "Don’t explain this again". It appears on the first switch only. The program must be identical in both views; the switch is a view change, never a conversion that can lose data.

### 06 Set the stage from the storyboard — `04-06`
This dialog appears the **first time a scene is opened** and the scene is empty (here Frame 3.1).
- **Left** (320px, white): the storyboard frame, its MEDIUM tag, "4 s", the line "CHILD: You’re home. And you brought a friend." and the note "You can move or change anything afterwards."
- **Right:**
  - **Title:** "Set up this scene from your storyboard?"
  - **Summary:** "3 characters, 2 props, a forest and a medium shot."
  - **Place everything:** primary, focus shown.
  - **Choose what to place:** an expanded tick list in 2 columns: Owl, Cat and Child (Cast); Key and Lantern (Props; Lantern unticked); Forest clearing (Set); Medium shot (Camera). The list ends with **Place 6 chosen**.
  - **Not now:** a quiet button.

### 07 Backstage import report — `07-09`
A sheet (1190px) titled "Backstage · Import report", with the file pill "dragon.glb · 14 MB" and the status "Ready to add". It has three columns:
1. **Preview and stand-in:** the model preview (placeholder), "Name in your Cast" [Dragon] with mic, and a **stand-in** card titled "Imports switched off?". The card shows a dashed pill outline labelled "dragon" and the explanation "A labelled stand-in holds the dragon’s place until imports are allowed.", with the button **Use a stand-in**.
2. **What Backstage did:** "Made it lighter: Reduced from 180,000 to 12,000 triangles" (Done); "Smaller textures: Textures from 4K to 1K" (Done); "Skeleton mapped: 20 of 22 joints. The two tail tips won’t bend." (Nearly, with a flag). Below these, a **Credit line** box holding "“Dragon” by Kestrel3D, licensed CC BY-NC 4.0, from models.example.org", with mic and the note "Filled in for you. It appears in your film’s credits."
3. **Where is it from?** A URL field, then **Licence** radio cards: CC0 (Free for anything), CC BY (Free, give credit), CC BY-SA (Credit, share alike), **CC BY-NC** (Credit, not for sale; selected, focus shown), Made it myself, Not sure (Kept private). Below them, a **warning**: "Heads up: non-commercial licence. You can use the dragon in class and at home. Public export will be blocked while it is in your film."

Footer buttons: Cancel import, then **Add to Cast**.

### 08 Automatic check, full view — `07-09`
The Screening room with the title "Automatic check / Whole film, frame by frame", followed by count pills (9 frames, 7 match, 2 to look at), Check again and **Export film**.
- **Frame grid:** grouped by scene. Each card (136px) shows a thumbnail, the frame number, and Matches or Look at.
- **Flag cards** (2): "Frame 2.3 · Scene 2" with the sketch beside the still and "Cat ends in the middle; your sketch has it on the right."; "Frame 2.4" with "CAT’s line “You found it. Thank you.” has no say block yet." Each card has **Go to the block** (focus shown on the first), **Go to the sketch** and **Keep it**.
- **Footer bar:** "Flags are advice, not rules. Fix them, keep them, or export anyway." with the button **Export anyway**.

### 09 Export — `07-09`
A dialog over screen 03, titled "Export film" with the tag "MP4 video".
- **Left:** a **Title card** toggle with a preview ("The Owl and the Key / A film by Willow Class") and its field. Below it, **Credits** (tagged "Filled in for you", with Edit): Story and code; Cast; Lantern model “Old Lantern” by Pixelmoth, CC BY 4.0, tagged **Imported**; Made with StoryStage 2.
- **Right:** a note, "Settings are locked while exporting". **Captions** toggle (on) and **Resolution** 720p | **1080p** are dimmed while exporting. **File size** "about 86 MB". A **progress card**: "Exporting 64%", a bar, "About 30 seconds left. You can keep working.", then the steps Drawing every frame (Done), Adding captions and credits (Now) and Saving the MP4 file. Buttons: **Stop export** (focus shown) and **Keep working**.
- **Rule:** a CC BY-NC asset in the film blocks public export (see 07).

### 10a–10d First-run set-up wizard — `10`
A dialog of 920px over a dimmed shell (the mode tabs are visible at 50% opacity). It has a 4-step progress bar: Who is setting up, About the Prompter, Claude key, Done.
- **10a:** "Who is setting up StoryStage?" Two large choice cards: **I’m a learner** ("Start making films straight away. An adult can add the Prompter later.") or **I’m the adult who owns the Claude key** (selected, focus shown). The learner path skips 10b and 10c.
- **10b:** "Meet the Prompter" with the AI badge, and the line "Please read this with the learner if you can." Five icon rows:
  - "The Prompter is an AI helper: a computer program, not a person. It always wears the AI label."
  - "It suggests a plan in plain words. Nothing changes until the learner chooses Build these steps."
  - "It never writes the learner’s story. The ideas stay theirs."
  - "What the learner asks is sent to Claude, an AI service, using your key. Avoid personal details."
  - "Stop, Undo this request, or switch it off at any time in Settings."

  Below the rows, a consent tick box: "I’m the responsible adult, and I agree the Prompter can be used on this device." Buttons: Back, "Skip — use StoryStage without the Prompter", and **I agree, continue** (focus shown).
- **10c:** "Add your Claude key / Adults only. Learners never see or type the key." A masked key field (monospace, Show and Paste; **no mic**), then "Key works. Checked just now." A secure-store card: "Kept in this device’s secure store. It won’t appear on screen again, and it is never saved in films, exports or study logs." Then "No key? You can still use everything else." Buttons: Back, the Skip path, and **Save key and continue**.
- **10d:** "You’re ready." A summary: Set up by, The Prompter (On), Key (In this device’s secure store), Code editor (Blocks). Below it, the three modes in order. Buttons: Open the example film, and **Start your first film** (focus shown).

### 11 Settings, teacher class set-up — `11-12`
A calm adult page: the Settings tab is active in amber and the page title reads "Settings · Willow Class".
- **Left navigation** (236px), headed "For teachers": **Class set-up**, This device, Prompter key, Accessibility, Help and guides. Lesson plans and slides live under Help and guides.
- **Header row:** "Class set-up / Willow Class · Year 4 · 28 pupils", then "All changes saved" (autosave, with no Save button).
- **Three columns:**
  1. **Pupils and folders:** Add pupil, search, a list of pupil rows (folder icon, name, film count, chevron), "Import class list" and "21 more". The pupil names are invented.
  2. **Default code editor:** Blocks | Tiles, then **Lock for pupils** (toggle on). **The Prompter** (AI badge) radio: Off, Explain only, **Plan only** (selected, focus shown), Full.
  3. **Daily Prompter limit:** a stepper "20 requests a day, per pupil, resets at midnight". **When the limit is reached:** a select, "Switch to Explain only". **Backstage imports:** Off | **Teacher only** | Learners. **Study logs:** "A record of Prompter use and checks, with no pupil names." with the button **Export study logs**. (The handoff said "Anonymised". The logs carry pseudonymous session ids (7.13, 24.6), which is not anonymous, so the screen must not say so. The DPIA (WP17.3) settles the final wording.)
- **Prompter levels** (decision 0034) select from the Prompter's modes (13.5) and map onto the policy keys (15.3):

  | Level | Policy | Modes the learner gets |
  |---|---|---|
  | Off | `prompter.enabled` false | none; the neutral note from 12a |
  | Explain only | `prompter.explainOnly` | Explain mode and the story coach |
  | Plan only | `prompter.planOnly` | as Explain only, plus plans: Show me how and Build it write and revise a plan (13.9), but the learner builds every block |
  | Full | neither | every mode |

  If both keys are set, Explain only wins. The daily limit and its action apply on top, and a school or exam lock (decision 0022) can hold the level where the teacher can't change it.

### 11b Settings, school Prompter key — `11-12`
> **Open (WP24.3, due at M1).** This screen assumes the school's key sits on a school service that relays Prompter requests, and that StoryStage can send email. Both need a server, which rule 2 and decision 0005 rule out as drawn. Until the owner decides how the Prompter reaches a group, build it like this: the key goes into the secure store of the device it is entered on, and only that device's native layer uses it; the monthly limit and usage are counted on that device; leave out **Email me at 80%** and show the usage bar instead. The words "the school's secure store" become "this device's secure store".

For **group use**. The Settings tab and the navigation item **Prompter key** are active; the footer reads "Signed in as the IT manager". Header: "Prompter key", the AI badge, "Hazel Lane Primary · group use", "All changes saved". Three columns:
1. **Who provides the key** (radio cards): **One key for the whole school** (selected), Each class has its own key, or No key (the Prompter stays off everywhere). **Who can change this**: a list of people with roles (IT manager, Head teacher) and **Add person**. Only these people see this page.
2. **School key**:
   - Status line: "Key works. Checked today at 08:12".
   - Key field: masked, monospace, read-only, **no mic**.
   - Buttons: **Replace key** (focus shown) and **Remove key**.
   - Secure-store card: "Kept in the school’s secure store. Teachers and pupils never see it. It is never saved in films, exports or study logs."
   - Neutral note: "At home, an adult enters their own key on that device during set-up."
3. **Monthly limit for the school**:
   - Stepper: 20,000 requests, which reset on the 1st. Class daily limits still apply.
   - Usage bar: "6,480 used", 32%.
   - When the limit is reached: a select, "Switch every class to Explain only".
   - **Email me at 80%**: a toggle.

   **Classes using this key**: rows showing the class, its Prompter level, its daily limit and requests used today, each linking to that class's set-up (11).

Behaviour:
- **Each class has its own key:** the School key card is replaced by a key field per class on each class's set-up page.
- **No key:** the Prompter is off on every school device. Learners see the neutral note from 12a, worded "switched off by your school".
- **Removing or replacing the key:** both ask for confirmation.
- **The key never reaches learner devices in readable form.** How group requests reach Claude is open (WP24.3): see the note at the top of this screen.

### 12a Storyboard, Prompter off (by school) — `11-12`
The same as 01, except that the "Ask the Prompter" button is replaced by a neutral note: "ⓘ The Prompter is switched off by your school. Everything else works as usual." There is no gap and no error styling.

### 12b Production stage, browser version — `11-12`
There is no Prompter panel. The scene column (540px: scene view, camera toggles, storyboard reference card and a neutral note) sits beside the code column (Blocks palette and program), and together they fill the width. The note reads: "The Prompter isn’t part of the browser version. Rehearse, Blocks and Tiles all work here." **Focus is shown on Rehearse.**

### 13a Learn: guided films — `13`
The Learn button in the header is active and opens a right-hand sheet (600px) over the Storyboard.
- **Guided films:** cards for 1 Plan your first frame (Done), **2 Make the owl speak** (2 of 5, **Continue**, focus shown), 3 Same code, new look: Tiles, and 4 Check and export your film. Each card has a thumbnail, a mode label, the steps and time, and a status (icon plus word).
- **Toggles:** Show tips, Read tips aloud.
- **Note:** "Guided films work with or without the Prompter. Teachers: lesson plans and slides are in Settings, Help and guides."
- **No videos in this release** (planned for later).

### 13b Learn: a step in context — `13`
Over screen 04 (Tiles), a guided **step card** (330px) sits inside the program area at the top right. It shows "Guided film 2 · Make the owl speak", "Step 3 of 5" with a segmented progress bar, and the instruction "Drag a say tile into do in order, under turn to face." Buttons: Read aloud, Show me where, **Check my step** (focus shown) and Back. **Show me where** highlights the owl say tile in the palette with an amber ring, and the program shows a dashed amber target: "Drop the say tile here".

### 13c Learn: a first-time tip — `13`
On the Storyboard, a chalk tip bubble with a pointer is anchored to the shot segmented control. It reads "Tip · Shot types / New for you" and lists Wide (shows the whole place), Medium (shows characters from the waist up) and Close-up (shows one face, big), each with its icon. Buttons: Read aloud, and **Got it** (focus shown). Each tip appears once, the first time a control is used, and tips can be switched off in Learn.

### 14 Component sheet — `14`
The canonical source for buttons, mode tabs, status chips, a block, tiles (including the control box, drop line and empty slot), a Prompter plan step, the guided step card, Backstage cards, form controls and focus states. **Build the component library from this sheet first.**

---

## Components (build these first)
| Component | Specification |
|---|---|
| Button | Height 44 (46–52 for key actions), radius 12, padding `0 16px`, icon 22px plus label, 700 weight. Variants: **primary** amber/amber-ink; **strong** chalk/`#161412`; **secondary** 1px `#8A7B6A` with chalk text; **quiet** text only; **stop** 1.5px `#E58A6A` with a filled stop icon; **prompter** `#6FD3C7`/`#0E2B28` (AI only); **unavailable** `#2B2520`/`#8F8476`. |
| Mode tab | See the header spec. Exactly 3 tabs; Learn and Settings sit separately. |
| Status chip | Icon (15px) plus word (14px bold), coloured per status. Never colour alone. |
| Frame card | 140 × 50, sketch thumbnail of 32px, number, status chip; the selected card has a 2px amber border on `#2E2519`. |
| Block | See the Blocks editor colours. |
| Tile, control box, slot, drop line, value menu | See the Tiles editor colours. |
| Prompter plan step | ≥52px, radius 12, background panel-3, drag handle (30 × 48), a 28px chalk number disc, text, edit button 44px. Reorderable by drag and by keyboard (arrow keys while focused). Editable inline, with a mic. |
| Text field | Height 48, radius 12, background `#13100E`, 1px `#8A7B6A`, placeholder `#AFA394`, plus an adjacent 44px mic. |
| Check box | 26px, radius 7; checked is amber with a check icon. |
| Radio card | ≥44px; selected is `#2E2519` with a 1.5px amber inset and a 7px amber ring dot. |
| Toggle | 52 × 30; on is amber with a dark knob. |
| Segmented | 44px segments in a `#13100E` track with a 1px border; the selected segment is chalk. |
| Dialog | See the elevation tokens. A title with a 26–30px icon, Bricolage 26–30px. Close is 44px. |
| Neutral note | Panel-3 background, 1px line, an ⓘ icon in muted. Used for "Prompter off" and similar notices; never styled as an error. |

## Interactions and behaviour
- **Mode navigation:** the three tabs switch modes. The current frame persists across modes. The Screening room hides the Prompter and Backstage.
- **Frame status lifecycle:** Planned (it has a storyboard frame) → Staged (actors are placed) → Coded (the program is not empty) → Rehearsed (played at least once since its last change) → Checked (passes the automatic check, or its flags have been kept). Editing a frame's code moves it back to Coded.
- **The Prompter:**
  1. The learner asks, by typing or by voice.
  2. The Prompter returns a numbered plan in plain words, and its state shows "Nothing built yet".
  3. The learner may reorder, edit, add or delete steps.
  4. **Build these steps** applies the plan as Blocks or Tiles.
  5. **Stop** cancels a request in progress.
  6. **Undo this request** reverts everything that request built, as a single step.

  The Prompter never writes story text (logline, synopsis, dialogue). It respects the class Prompter level (Off, Explain only, Plan only, Full; see screen 11 for how they map to the policy keys and modes) and the daily limit, applying the configured action when the limit is reached.
- **Storyboard first** (10.8, decision 0012): a scene's Code editor stays closed until the scene has a heading and at least one frame, and the script has a logline and synopsis. The Production stage says what is left in plain words and offers **Go to the Storyboard** (screen 02c in `sizes/`). A teacher can relax the rule for imported worlds (`storyboard.allowImportedWithoutStoryboard`).
- **Blocks and Tiles** are two views of **one** program model. Switching views is lossless. The teacher can set the default editor and lock it.
- **Tiles:**
  - **Dragging:** dragging from the palette shows a ghost and a drop line at the insertion point. Dropping into an empty slot replaces the slot.
  - **Value pills:** clicking one opens an anchored menu of valid values for its type. Objects that have parts open a submenu of Questions.
  - **add detail:** opens optional parameters, such as duration.
  - **Keyboard:** every drag must have a keyboard alternative. Select a tile, choose "Move to…" and pick a slot with the arrow keys.
- **Set the stage:** this dialog appears once per scene, when the scene is first opened and is empty. It places the Cast, Props, Set and camera from the storyboard.
- **Automatic check:** for each frame it compares the storyboard against the rehearsal: actors present, approximate left/centre/right positions, the shot type, the length, and that each pinned line has a matching say block. Results are Matches or Look at; Look at flags link to the block and to the sketch, and the learner can keep any flag. Export is always allowed (**Export anyway**), **except** when a non-commercial licence blocks public export.
- **Import:** reduce the triangle count and textures, map the skeleton, and capture the source URL, licence and credit. When imports are switched off, the learner places a labelled stand-in instead.
- **Export:** produces an MP4 at 720p or 1080p, with captions from the pinned script lines, a title card and auto-generated credits (including credits for imports). The export runs in the background, can be stopped, and settings are locked while it runs.
- **Voice:** every mic button runs speech-to-text into its field. Read aloud uses text-to-speech.
- **Learn:**
  - **Guided films** are short step sequences that are checked against the actual project state, with "Check my step" and "Show me where" (highlights the target control).
  - **Tips** appear on first use of each control and can be switched off.
  - **No video** in this release.

## State (indicative)
- `project { title, logline, synopsis, scenes[ { id, title, frames[ { id, sketchLayers[], shot, lengthS, pinnedLines[], status, program } ] } ], cast[], props[], set, backdrop, imports[ { file, reducedFrom, reducedTo, texFrom, texTo, jointsMapped, jointsTotal, sourceUrl, licence, credit, standIn } ] }`
- `ui { mode, currentFrameId, editorView: 'blocks'|'tiles', backstageOpen, prompterOpen, learnOpen, focusTarget }`
- `prompter { availability: 'on'|'offBySchool'|'notInBrowser', level, usedToday, cap, capAction, request: { text, plan[], state: 'idle'|'planning'|'planned'|'building'|'built' }, undoStack }`
- `check { results[ { frameId, items[ { label, state: 'match'|'flag', blockRef, sketchRef, kept } ] } ] }`
- `export { titleCard, credits[], captions, resolution, estimateMB, progress, step, blockedByLicence }`
- `classSettings { pupils[], defaultEditor, editorLocked, prompterLevel, dailyCap, capAction, imports: 'off'|'teacher'|'learners' }`
- `schoolKey { mode: 'school'|'perClass'|'none', status, lastChecked, monthlyCap, usedThisMonth, capAction, admins[] }` (`emailAt80` waits for WP24.3)
- `onboarding { who: 'learner'|'adult', consent, keyStored }` The key itself is stored only in the OS secure store and never in app state.
- `learn { guidedFilms[ { id, steps, progress } ], tipsOn, readAloud, tipsSeen[] }`

## Assets
- **Fonts:** Bricolage Grotesque, Atkinson Hyperlegible (OFL-1.1), bundled from Fontsource (decision 0031). Icons: Material Symbols Rounded (Apache 2.0).
- **Logo:** the mark and wordmark are built in CSS (see the header spec). Redraw them as SVG for production.
- **Character figures** in `design/Figure.dc.html` are placeholder vector drawings, each with a sketch and a colour version. Replace them with the real art.
- **reference/**: three Alice 3 screenshots (drag with the drop line; nested if/else; value menu with a Questions submenu). These are the source for the Tiles grammar. They are Carnegie Mellon University's images, so they are **not in this repository**; ask the owner for them. Use them for reference only and do not ship them.
- **Sample data:** the pupil, class and school names on screens 11 and 11b are invented. Keep fixtures and tests invented too.

## Files
```
design/
  StoryStage Direction A - Index.dc.html        ← start here
  Direction A - 01-03 Core modes.dc.html        Storyboard, Production stage (Blocks + Prompter), Screening room
  Direction A - 04-06 Tiles and staging.dc.html Tiles editor, editor switch, set the stage
  Direction A - 04b-04c Tiles in detail.dc.html Dragging, nesting, value menu
  Direction A - 07-09 Import check export.dc.html
  Direction A - 10 First-run set-up.dc.html     10a–10d
  Direction A - 11-12 Settings and no Prompter.dc.html  11, 11b, 12a, 12b
  Direction A - 13 Learn.dc.html                13a–13c
  Direction A - 14 Component sheet.dc.html
  Figure.dc.html, support.js                    runtime for the previews
sizes/                                          added for 12.1: screens 01, 02, 02c, 03, 10a and 11, laid out by viewport size
  index.html                                    ← every screen at laptop, Chromebook and iPad sizes
  sizes.css, sizes.js                           the size rules, and scaling for the frame canvas and player
  theme.js                                      the light theme: open any screen with ?theme=light
screenshots/                                    1366 × 768 PNGs of every screen, named by screen number
  sizes/                                        the same screens at 1536 × 864 and 1180 × 820, and 02c at 1366 × 768
  light/                                        the same screens in the light theme, at 1366 × 768 and 1180 × 820
reference/                                      not in this repository (Carnegie Mellon's images; the owner holds them)
  alice3-drag-drop-line.png, alice3-nested-if-else.png, alice3-value-menu-functions.png
```

## Suggested build order
1. Tokens and the component library, checked against screen 14.
2. The app shell: header, mode tabs, amber frame, Learn and Settings.
3. Storyboard (01, 12a, 13c).
4. Production stage with Blocks and the Prompter (02, 06, 07, 12b).
5. Tiles (04, 04b, 04c, 05) on the shared program model.
6. Screening room, check and export (03, 08, 09).
7. First-run set-up and Settings (10a–d, 11, 11b).
8. Learn (13a, 13b).

Compare each built screen side by side with its mock-up at 1366 × 768, and at laptop and iPad sizes where `sizes/` has it.
