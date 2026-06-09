# Connect the agent via MCP, not an embedded Agent SDK

The note app exposes its Blocks to Claude through an **MCP server that the user explicitly loads in a session** (Claude Desktop / Claude Code), rather than embedding the Claude Agent SDK inside the app.

**Why:** MCP rides entirely on the user's Claude subscription — no API key, no per-token billing, no Agent-SDK credit cap, and no third-party-harness policy risk. The cost is the interaction model: an MCP server is reactive and cannot act on its own, so the experience is "open a session and ask Claude to read/edit the note," **not** "write in the note and the AI responds inside it on its own." We accepted that trade-off; the embedded-Agent-SDK path (the only true note-first option) was rejected for its cost cap and policy risk.

**Consequence:** Anything that would require the AI to react without the user initiating a turn is out of scope by construction.
