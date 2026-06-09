<div align="center">

# 🍃 Inkleaf

### Your handwritten notebook, that Claude can read and write in.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![MCP](https://img.shields.io/badge/MCP-Model_Context_Protocol-000000)](https://modelcontextprotocol.io/)
[![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97757)](https://claude.com/claude-code)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

*A local-first note app that looks and feels like a handwritten paper notebook —*
*and exposes your notes to Claude over MCP, so the AI can write back into the page.*

</div>

---

## Why Inkleaf?

To-do apps and note apps are a solved problem. People still keep paper notebooks anyway — for the *feeling*. Inkleaf is built around exactly that feeling, and then does the one thing a paper notebook can't:

> **You jot something down. You open a Claude session. Claude tidies your scribbles into a clean checklist — written into your notebook in handwriting, animated as if drawn by a pen — and you tick the boxes.**

The handwriting is a **skin** over real structured data, so the page stays interactive *and* an AI agent can actually read and edit it.

## How it works

The handwritten look is presentation only. The truth underneath is a small table of **Blocks** (a text line, or a to-do with a checked state). Claude connects through a local **MCP server** and does full CRUD on those Blocks — using your Claude subscription, **no API key**. Every change streams to the open notebook live and animates in handwriting.

```
   Browser (React)  ◄── live push (ws) ──  Inkleaf web server  ── owns ──►  SQLite
        │                                        ▲   (Blocks = source of truth)
        └──────── edits (REST) ─────────────────►│
                                                  │ REST
   Claude Desktop / Code ── stdio ── MCP server ──┘   (read · create · update · delete · toggle)
```

The design decisions behind this are recorded as ADRs:

- [ADR-0001](./docs/adr/0001-connect-via-mcp-not-agent-sdk.md) — connect via **MCP**, not an embedded Agent SDK (subscription, no API key)
- [ADR-0002](./docs/adr/0002-handwriting-is-a-skin-not-ink.md) — **handwriting is a skin** over structured Blocks, not real ink
- [ADR-0003](./docs/adr/0003-writing-animation-via-mask-reveal-not-stroke-order.md) — the **writing animation** is mask-reveal, not true stroke order
- [ADR-0004](./docs/adr/0004-native-two-way-google-sync.md) — **native two-way Google Tasks/Calendar sync** over the primary account (opt-in via OAuth)

The project's domain language lives in [CONTEXT.md](./CONTEXT.md).

## Quickstart

```bash
git clone https://github.com/ssmm0205/inkleaf.git
cd inkleaf
npm install
npm run dev          # starts the web server (8788) + the UI (5173)
```

Open <http://localhost:5173> and start a note.

### Connect Claude

Point Claude at the local MCP server (the web server must be running so the agent's writes show up live):

```bash
claude mcp add inkleaf --transport stdio -- npx tsx /ABSOLUTE/PATH/TO/inkleaf/src/mcp/server.ts
```

Or, for **Claude Desktop**, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "inkleaf": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/TO/inkleaf/src/mcp/server.ts"]
    }
  }
}
```

Then ask Claude things like *"read my notebook and turn today's scribbles into a checklist"* — and watch it write into the page.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + Vite, Nanum Pen Script handwriting font, CSS mask-reveal animation |
| Store | SQLite (`better-sqlite3`), Blocks as the single source of truth |
| Live updates | `ws` websocket broadcast |
| Agent bridge | `@modelcontextprotocol/sdk` (stdio MCP server) |

## Status

🌱 Early smoke test. The goal of this phase is to prove one thing: *does Claude writing handwriting into your notebook feel like magic?* Stroke-order-perfect Hangul, multiple notebooks, real stylus ink, and sync are explicitly out of scope for now (see ADRs).

## Contributing

PRs welcome. Issues are tracked on GitHub; the codebase is built test-first around the Block service seam. See [CONTEXT.md](./CONTEXT.md) for the vocabulary before opening a PR.

## License

[Apache 2.0](./LICENSE) © Inkleaf contributors
