# Handwriting Note

A note-taking product whose entire reason to exist is the *feel* of a handwritten paper notebook. The handwritten look is a presentation skin over structured data, so the note stays interactive (checkable to-dos) and machine-readable (an AI agent can read and edit it).

## Language

**Note**:
A single page the user works in — a collection of Blocks, rendered with the Skin.
_Avoid_: Page, Document, Canvas

**Block**:
The smallest structured unit of a Note (one text line, one to-do, etc.) and the source of truth. The handwriting the user sees is a rendering of a Block, never the other way around.
_Avoid_: Row, Line, Entry, Cell, Item

**Todo**:
A Block that carries a checked/unchecked state. The user (or the agent) toggles it.
_Avoid_: Task, Checklist item, Checkbox (the checkbox is the on-screen control, not the concept)

**Skin**:
The presentation layer that draws Blocks to look hand-written — a handwriting-style font, paper texture, and the Writing animation. It is styling only: it holds no truth and carries no real pen strokes (see [[0002-handwriting-is-a-skin-not-ink]]).
_Avoid_: Theme, Style, Ink

**Writing animation**:
The animated appearance of a Block as if a hand is writing it — text materialising progressively rather than popping in at once. Central to the feel, and it fires whether a human or the agent created the Block.
_Avoid_: Typewriter effect, Transition, Reveal
