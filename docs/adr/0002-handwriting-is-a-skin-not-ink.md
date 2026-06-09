# Handwriting is a Skin over structured Blocks, not real ink

Structured Blocks are the source of truth. The hand-written look is a **Skin** — a handwriting-style font plus paper texture rendered over those Blocks. The product stores no stylus strokes; the user inputs text/structure and the Skin makes it *look* handwritten.

**Why:** It keeps the data interactive (tappable Todos) and trivially machine-readable for the MCP agent (no handwriting recognition needed), and a web smoke test ships in days. The rejected alternative — real stylus ink (perfect-freehand / PencilKit) — delivers a stronger "my own handwriting" feel but needs a canvas/ink engine, leans on native for acceptable pen latency, and would require a separate structure layer for the AI to read. A real-ink layer can be added later *per Block* without moving the source of truth, so this is the cheap-first default, not a permanent ceiling.
