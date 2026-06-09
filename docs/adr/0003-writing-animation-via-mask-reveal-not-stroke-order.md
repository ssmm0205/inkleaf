# Writing animation is mask-reveal, not true stroke order

The Writing animation reveals a handwriting-font glyph by sweeping a brush/mask along it (the CSS-Tricks irregular-stroke technique), rather than drawing each jamo in pedagogically-correct stroke order.

**Why:** The product is written in Korean, and true stroke-order animation of arbitrary typed Hangul has no drop-in solution — there is a mature library + dataset for Chinese (Hanzi Writer / Make Me a Hanzi) but **no equivalent for Hangul**, and no open dataset of stroke paths for the 11,172 modern syllables. Building real per-jamo stroke order would be a multi-week custom "Hangul stroke engine," which contradicts a smoke test. Mask-reveal works for any typed Korean in days and still reads convincingly as "being hand-written."

**Consequence:** We deliberately accept that a syllable reveals in roughly one sweep rather than stroke-by-stroke. True stroke-order is a possible later "real handwriting" phase, not part of the smoke test. The thing the smoke test must prove is the *magic of Claude writing into the note*, not stroke fidelity.
