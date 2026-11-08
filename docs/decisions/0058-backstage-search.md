# 0058 Backstage search: on for teachers, with weapons screened

- **Status:** settled
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answer in session D, on the DPIA (#139, risk R14), which WP3.12 asked to settle this

## Decision

- **Backstage search** (the in-app search of Poly Pizza's CC0 models, WP3.12) is **on for teachers by default**. Learners don't see it; they use Backstage, stand-ins, and what the teacher imports (3.11, `backstage.import`).
- **Models about guns are screened out** of the results: any model whose name, tags or category contains **"gun" as a word or part of a compound word** (gun, guns, handgun, shotgun, machine gun, gunman, and so on) is never shown. It matches whole words and compounds, so harmless names such as "burgundy" or "begun" aren't hidden.
- A school can still switch search off with the policy key `backstage.search=false`.

## What follows

- **The screen is a keyword filter, not moderation.** Other weapons and unsuitable models can still appear, so search stays teacher-only, and every import still shows the import report before anything reaches a class (3.11). Extending the list (for example to other weapons) is a later decision.
- **Spec 05 §3.3 (S8):** `backstage.search` now defaults to `true` "with no policy", meaning available to teachers. It still widens nothing for learners, and an untrusted policy file can't widen it beyond that default (§3.6).
- **Spec 17 and WP3.12 (S4):** the teacher-only placement and the gun screen, with a test that a result named "Toy gun" is removed and one named "Burgundy armchair" is kept.
- **Privacy (D):** search words and the device's IP address go to Poly Pizza when a teacher searches. The DPIA (R14) and the privacy notice name Poly Pizza.
