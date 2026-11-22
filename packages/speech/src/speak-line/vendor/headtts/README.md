# HeadTTS's English phonemiser (vendored)

Three files from [HeadTTS](https://github.com/met4citizen/HeadTTS) 1.3.0, the npm package `@met4citizen/headtts` (MIT, Copyright (c) 2025 Mika Suominen; `LICENSE` here). Speak line uses them to turn English text into Kokoro's phonemes without eSpeak NG, which is GPL-3 (decision 0068; `docs/spikes/tts-engines.md`).

- `language.mjs`, `language-en-us.mjs`, `utils.mjs`: as published, except:
  - a one-line note at the top of each;
  - in `language.mjs`, `loadDictionary`'s Node branch (`node:fs`, `node:readline`) is removed, so browser bundles carry no Node imports. StoryStage adds the dictionary's lines itself with `addToDictionary`.
- **Not vendored:** the npm package itself, because its dependency `@huggingface/transformers` brings a machine-learning stack StoryStage doesn't use; and the dictionary (`en-us.txt`, from the CMU Pronouncing Dictionary, BSD), which is an asset fetched with Kokoro's files (`scripts/fetch-kokoro-assets.mjs`).
- They are checked by `speak-line/*.test.ts`, not linted or formatted with the rest.
