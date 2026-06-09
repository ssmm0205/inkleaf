import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * Inkleaf MCP server. A thin client over the Inkleaf web server's REST API, so
 * every agent edit flows through the same store and gets broadcast to the open
 * notebook live (see docs/adr/0001). The web server must be running.
 *
 * NOTE: stdout is the JSON-RPC channel — never console.log here. Use stderr.
 */

const BASE = process.env.INKLEAF_URL ?? "http://localhost:8788";

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(BASE + path, {
    headers: { "content-type": "application/json" },
    ...init,
  }).catch((err) => {
    throw new Error(
      `Could not reach the Inkleaf server at ${BASE}. Is it running (\`npm run dev\`)? ${(err as Error).message}`,
    );
  });
  if (!res.ok) throw new Error(`Inkleaf API ${res.status}: ${await res.text()}`);
  return res.json();
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

const server = new McpServer({ name: "inkleaf", version: "0.1.0" });

server.registerTool(
  "read_note",
  {
    title: "Read note",
    description: "List every Block in the notebook (text lines and todos with their checked state).",
    inputSchema: {},
  },
  async () => {
    const blocks = await api("/api/blocks");
    return text(JSON.stringify(blocks, null, 2));
  },
);

server.registerTool(
  "create_block",
  {
    title: "Create block",
    description: "Add a Block to the notebook. Use type 'todo' for a checkable item, 'text' for a plain handwritten line. It will animate onto the page.",
    inputSchema: {
      text: z.string().describe("The content of the line or todo"),
      type: z.enum(["text", "todo"]).optional().describe("Defaults to 'text'"),
    },
  },
  async ({ text: content, type }) => {
    const block = (await api("/api/blocks", {
      method: "POST",
      body: JSON.stringify({ text: content, type: type ?? "text" }),
    })) as { id: string; type: string };
    return text(`Created ${block.type} block ${block.id}`);
  },
);

server.registerTool(
  "update_block",
  {
    title: "Update block",
    description: "Change a Block's text and/or its checked state, by id.",
    inputSchema: {
      id: z.string(),
      text: z.string().optional(),
      checked: z.boolean().optional(),
    },
  },
  async ({ id, text: content, checked }) => {
    await api(`/api/blocks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ text: content, checked }),
    });
    return text(`Updated block ${id}`);
  },
);

server.registerTool(
  "toggle_todo",
  {
    title: "Toggle todo",
    description: "Flip a todo Block's checked state by id.",
    inputSchema: { id: z.string() },
  },
  async ({ id }) => {
    const block = (await api(`/api/blocks/${encodeURIComponent(id)}/toggle`, {
      method: "POST",
    })) as { checked: boolean };
    return text(`Todo ${id} is now ${block.checked ? "checked" : "unchecked"}`);
  },
);

server.registerTool(
  "delete_block",
  {
    title: "Delete block",
    description: "Remove a Block from the notebook by id.",
    inputSchema: { id: z.string() },
  },
  async ({ id }) => {
    await api(`/api/blocks/${encodeURIComponent(id)}`, { method: "DELETE" });
    return text(`Deleted block ${id}`);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Inkleaf MCP server connected (talking to ${BASE})`);
