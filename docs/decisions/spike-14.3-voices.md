# Spike 14.3: the bundled speech engine

- **Status:** proposed by S1, 10 Nov 2026. Waiting for the owner.
- **Evidence:** `docs/spikes/REPORT.md`, section 14.3; the licence check in `docs/spikes/tts-engines.md`; code in `spikes/14.3-voices/`.

## Proposal

Go: speak line's bundled engine (decision 0068) is **Kokoro-82M** (8-bit ONNX, Apache-2.0) in ONNX Runtime Web, with HeadTTS's English phonemiser (MIT) and the CMU dictionary (BSD), not eSpeak NG. British voices get British pronunciations from our own rules, Reece Dunn's RP list (BSD-2-Clause) and a short hand list. Children's and animals' voices are presets made from adult voices.

In CI, whisper understood every British voice with 0–5% of words wrong. It speaks at 1.5–1.9× a line's length, so lines are prepared in advance as the code changes (spec 06, section 4.6). The download is 86 MB, plus 0.5 MB a voice.

Before release:
- D checks Kokoro's training-data provenance (audio from closed commercial services) and the credits;
- the reference devices give memory and speed (#6);
- the owner judges the accent and the presets by ear.

## Owner decision

_Not yet decided._
