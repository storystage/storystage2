# Bundled voices: licence and size check (decision 0068)

The owner's decision of 8 Nov 2026: speak line uses an open-source speech engine bundled with StoryStage, on every platform including the browser, with voices for adults and children, men and women, and animals. This is the licence and size check, from public sources on 8 Nov 2026. A spike then measures the two candidates (section 4).

## 1. What the engine must do

- Run **in WebAssembly** (ONNX Runtime Web), so one engine serves the browser version and every app's webview, with no native code per platform.
- Turn text into sound **on the device**: nothing sent anywhere (rule 2; decision 0021's reason).
- Pass the **licence policy** (`CLAUDE.md` rule 8), all three parts: the engine's code, its **pronunciation component** (text to phonemes, "G2P"), and each **voice** (the model weights and the recordings they were trained on).
- Fit **4 GB Chromebooks** beside whisper (about 700 MB while transcribing, spike 1.3) and the stage.
- Speak a line **fast enough**: export renders offline, so any speed works there, but Rehearse wants a line ready when its block starts.

## 2. The trap: pronunciation

Most open neural speech engines get their pronunciation from **eSpeak NG**, which is **GPL-3** and can't be linked into the app.

- **Piper** moved to GPL-3 in 2025, when it embedded eSpeak NG (the `piper1-gpl` repository, v1.3.0). The old MIT repository is archived.
- **Kokoro**'s browser port, kokoro-js, phonemises with eSpeak NG compiled to WebAssembly.

There are GPL-free routes:
- **HeadTTS** (MIT) runs Kokoro in the browser with its own English phonemiser. It uses the **CMU Pronouncing Dictionary** (134,000 words, simplified BSD licence) and letter-to-sound rules (NRL Report 7948) for words not in it.
- **piper-plus-g2p** (MIT; npm, WebAssembly) is a rule-based, CMUdict-derived English phonemiser, built to replace eSpeak NG.

The CMU dictionary is American English. British pronunciations need a small override list (for example "tomato", "schedule", "garage"), kept in the repository. That's a known cost, measured in the spike.

## 3. Candidates

| | **Kokoro-82M** | **Piper, British multi-speaker (`en_GB-vctk-medium`)** | KittenTTS |
|---|---|---|---|
| Model licence | Apache-2.0 | Model card: VCTK recordings, CC BY 4.0 (credit needed). **To check:** it was fine-tuned from Piper's US "lessac" voice, whose own data licence must allow it | Code Apache-2.0; current models under a "Stellon Labs Community License", **to read** |
| Trained on | "Permissive/non-copyrighted audio", including CC BY sets (credit: Koniwa, SIWIS) and **synthetic audio from closed TTS models** (provenance for D to check against those services' terms) | 109 real British speakers, recorded for research with consent (University of Edinburgh) | Not stated |
| Pronunciation without eSpeak NG | Yes: HeadTTS's CMUdict phonemiser (MIT + BSD) | Possible: piper-plus-g2p (MIT), but Piper's voices learnt eSpeak NG's phoneme style, so quality must be checked | Not stated |
| Size | 86–92 MB (8-bit ONNX), plus a small file a voice (**to measure**) | One model for all 109 speakers, about the size of a Piper "medium" voice (**to measure**) | 25–80 MB |
| Voices | 28 English: 8 British (4 women, 4 men), 20 American; voices can be blended to make new ones | 109 British speakers, women and men, many regional accents | 8 |
| Speed in the browser | Slow in WebAssembly: 1.5–2.9× slower than real time on an M2 laptop (HeadTTS's figures); fast with WebGPU | VITS models are typically much faster than Kokoro; **to measure** | **To measure** |
| Extras | Phoneme timings and visemes (HeadTTS), useful for lip sync later (14.4) | | |

**Not candidates:** F5-TTS (weights CC BY-NC 4.0 from the Emilia data); anything with voice cloning of real people, which needs those people's consent whatever the licence says.

## 4. Children and animals

No open voice model trained on **children's voices** turned up with a licence that allows shipping. Children's recordings are rightly hard to license. So, in the first release:

- **Children:** adult voices, pitched up and with the voice's formants (the size of the vocal tract) shifted, so they sound younger rather than sped up. A child's voice from an adult one is never perfect; the spike plays samples for the owner to judge.
- **Animals:** voice "characters" made the same way: a small animal higher and quicker, a big one lower and slower, with an optional growl or purr effect. The words stay clear, because they carry the story.
- These are presets in Settings › Cast: Woman, Man, Girl, Boy, plus animal sizes. A preset is a base voice and a pitch, formant and speed.

A real child voice would need recordings made for StoryStage, with parents' consent and a licence written for it. That's a WP17 question for D and the owner, not something to look for online.

## 5. The spike (S1, next)

`spikes/14.3-voices/`, in CI (Chromium, software) and on the reference devices at M1:

1. Kokoro-82M (8-bit) with HeadTTS's phonemiser, and Piper `en_GB-vctk-medium` with piper-plus-g2p, both in ONNX Runtime Web, in a worker.
2. For each: download size, load time, memory, and seconds to speak 10 test lines (real-time factor).
3. **Intelligibility, automatically:** whisper (spike 1.3) transcribes each spoken line and the word error rate is measured. The line's words are known, so no person needs to listen for this part.
4. British words from an override list, said correctly.
5. The child and animal presets on each engine, saved as clips for the owner to judge.
6. Licence notes for every file shipped, ready for `NOTICE` and the credits.

**Proposed outcome:** the engine that passes the licence check, fits the size and memory budget and gives the lowest word error rate, with speed decided by whether Rehearse can speak lines live or must prepare them in advance (spec 06, section 4.6).

## 6. A British word list (10 Nov 2026)

The CMU Pronouncing Dictionary is American, so Kokoro's British voices come out with an American accent ("fox" as /fɑks/, "river" with a final /ɹ/). Kokoro needs British pronunciations. The lists checked:

| Word list | Licence | Size | Where its pronunciations came from | Verdict |
|---|---|---|---|---|
| **misaki's `gb_gold` and `gb_silver`** (Kokoro's own library) | Repository Apache-2.0 | about 6.5 MB | Gold: "seeded some local datasets of IPA labels", unnamed. Silver: **eSpeak NG 1.52's output** for a public word list, filtered (the author, [misaki #51](https://github.com/hexgrad/misaki/issues/51)). The licence question is open and unanswered ([#107](https://github.com/hexgrad/misaki/issues/107), Sept 2026) | **No.** The silver list is eSpeak NG's dictionary (GPL-3) by another route, and the gold list's sources are unknown |
| **Britfone** | MIT | 16,000 words, RP | CMUdict, plus British specifics from Wiktionary (CC BY-SA), Wikipedia, and the Collins, Oxford, Cambridge and Macmillan dictionaries | **Not without D's review.** Transcriptions taken from commercial dictionaries may carry those publishers' rights (UK database right), whatever the MIT notice says; Wiktionary's are share-alike |
| **English (UK) MFA dictionary** (Montreal Forced Aligner) | CC BY 4.0 | 74,882 words | Not stated | **Possible**, after D checks its sources: the clearest licence of the large lists (credit only). Its phone set needs mapping to Kokoro's |
| **en-GB-x-rp** (Reece Dunn) | BSD-2-Clause | about 2,100 words, RP, last changed 2018 | Not stated; built on John Wells's lexical sets | **Yes, as a supplement.** Clean but small |
| **Our own rules over the CMU dictionary** | Ours (Apache-2.0) over BSD | every word the CMU dictionary has | American pronunciations turned British by rules: no /r/ after a vowel unless a vowel follows, LOT as /ɒ/, GOAT as /əʊ/, BATH words (a short list) as /ɑː/, and so on | **Yes.** Fully clean; quality to judge by ear |

**Chosen by the owner (10 Nov 2026):** our own American-to-British rules over the CMU dictionary, with Reece Dunn's RP list and a short hand-checked list on top. D checks the MFA dictionary's sources as a possible larger list later. Whisper can't judge an accent, so the owner judges it by ear, on the spike page.

**Built in the spike** (`spikes/14.3-voices/src/british.ts`, 22 tests):
- **The rules:**
  - TRAP /a/, GOAT /əʊ/, LOT /ɒ/;
  - no /r/ after a vowel unless a vowel follows (*car* /kɑː/, *here* /hɪə/, *river* /ɹɪvə/, but *very* keeps it);
  - THOUGHT /ɔː/, except CLOTH words before ɡ ŋ f θ s ʃ (*dog* /dɒɡ/);
  - long stressed /iː/ and /uː/;
  - flap t back to /t/ (*better*).
- **The RP list:** used for content words only. For small words it gives the stressed form (*of* /ɒv/, *the* /ðiː/), and the CMU dictionary's weak forms (/əv/, /ðə/) are right in a sentence.
- **The hand list:** BATH and PALM words (*ask*, *path*, *father*), which nothing in American spelling predicts, plus *one* /wʌn/ and a few others.
- **The ten test lines now read as Southern British.** For example: "Thank you, Mr Fox." → /θaŋk juː, mɪstə fɒks/; "Our schedule is full on Wednesday afternoon." → /aʊə ʃɛdjuːl ɪz fʊl ɒn wɛnzdɪ ˌɑːftənuːn/.

## Sources (8 Nov 2026)

- [misaki #51: where the English lexicons came from](https://github.com/hexgrad/misaki/issues/51), and [#107, open](https://github.com/hexgrad/misaki/issues/107)
- [Britfone](https://github.com/JoseLlarena/Britfone)
- [English (UK) MFA dictionary](https://mfa-models.readthedocs.io/en/latest/dictionary/English/English%20%28UK%29%20MFA%20dictionary%20v2_0_0a.html)
- [en-GB-x-rp](https://github.com/rhdunn/en-GB-x-rp.dict)
- [Lessac data licence (research only)](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html)

- [HeadTTS README (MIT; CMUdict phonemiser; Kokoro in the browser)](https://unpkg.com/@met4citizen/headtts@1.0.0/README.md)
- [Kokoro-82M model card (training data, Apache-2.0)](https://huggingface.co/hexgrad/Kokoro-82M)
- [Kokoro-82M ONNX files and voices](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
- [Kokoro and eSpeak NG (discussion)](https://huggingface.co/hexgrad/Kokoro-82M/discussions/50)
- [Piper 1.3.0: eSpeak NG embedded, licence changed to GPLv3](https://newreleases.io/project/github/OHF-Voice/piper1-gpl/release/v1.3.0)
- [Piper `en_GB-vctk-medium` model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_GB/vctk/medium/MODEL_CARD)
- [piper-plus-g2p (MIT, no eSpeak NG)](https://pypi.org/project/piper-plus-g2p/)
- [KittenTTS](https://github.com/KittenML/KittenTTS)
- [sherpa-onnx (Apache-2.0, WebAssembly speech)](https://www.jsdelivr.com/package/npm/sherpa-onnx)
