# @storystage/export

Frame-by-frame render to MP4, captions, title and credits; AR pack.

- **Owner:** S2 (S1: MP4 encoder module; S4: AR pack)
- **Workplan:** WP11, WP22
- **Status:** the MP4 encoder (WP11a, `encoder/`); the title card, captions and credits (WP11.4, `film/`). The film export loop (11.3) is next.

## The title card, captions and credits (`film/`)

Spec 08, sections 5 to 7. All pure, so they're tested without a stage or an encoder.

- `titleCard(production, byline)` and `bylineFor(names)`: the 4-second card.
- `captionsFor(lines, script, { offset })` turns the measuring run's lines into captions. `captionsAt(captions, t)` gives what shows on the picture, and `webVtt` and `srt` give the two files.
- `filmCredits(production, find, { notices, headings })` gives the credit roll's blocks, in order. `find` looks up a shipped model's Backstage record; imported models come from the production's file.
