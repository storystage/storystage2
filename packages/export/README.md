# @storystage/export

Frame-by-frame render to MP4, captions, title and credits; AR pack.

- **Owner:** S2 (S1: MP4 encoder module; S4: AR pack)
- **Workplan:** WP11, WP22
- **Status:** the MP4 encoder (WP11a, `encoder/`); the title card, captions and credits (WP11.4, `film/`). The film export loop (WP11.3, `film/export-film.ts`).

## Exporting a film

`exportFilm(options)` (spec 08, section 4) refuses before anything is drawn when a model may not leave the school (`mayDistribute`) or the film stops with an error (`FilmRefused`, with plain-words reasons). Otherwise it measures the film on the hidden stage, then draws the title card, every film frame with its captions, and the credits roll at 30 frames a second, through a `Compositor` (by default an offscreen 2D canvas), into `exportMp4`. It gives the MP4, the WebVTT and SRT captions, and a file name from the title. Progress comes as `frames`, `credits`, then `saving`. A cancel stops at once with `ExportError('cancelled')` and ends every worker it started.

## The title card, captions and credits (`film/`)

Spec 08, sections 5 to 7. All pure, so they're tested without a stage or an encoder.

- `titleCard(production, byline)` and `bylineFor(names)`: the 4-second card.
- `captionsFor(lines, script, { offset })` turns the measuring run's lines into captions. `captionsAt(captions, t)` gives what shows on the picture, and `webVtt` and `srt` give the two files.
- `filmCredits(production, find, { notices, headings })` gives the credit roll's blocks, in order. `find` looks up a shipped model's Backstage record; imported models come from the production's file.
