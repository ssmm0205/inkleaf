import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { BlockStore } from "../server/blocks.js";
import { createApi } from "../server/http.js";

// Boots a real Inkleaf web server, then connects to the stdio MCP server the
// same way Claude Desktop would, and drives the full CRUD through MCP tools.

let server: Server;
let base: string;
let client: Client;

beforeAll(async () => {
  const store = new BlockStore(new Database(":memory:"));
  server = createServer(createApi(store));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  base = `http://localhost:${port}`;

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/mcp/server.ts"],
    env: { ...process.env, INKLEAF_URL: base },
  });
  client = new Client({ name: "mcp-integration-test", version: "1.0.0" });
  await client.connect(transport);
}, 60_000);

afterAll(async () => {
  await client?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function textOf(result: { content: Array<{ text?: string }> }): string {
  return result.content[0]?.text ?? "";
}

describe("MCP server", () => {
  it("exposes the five CRUD tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["create_block", "delete_block", "read_note", "toggle_todo", "update_block"].sort(),
    );
  });

  it("creates, reads, toggles and deletes a Block through MCP", async () => {
    const created = await client.callTool({
      name: "create_block",
      arguments: { text: "클로드가 쓴 줄", type: "todo" },
    });
    const id = textOf(created as never).match(/block (\S+)/)?.[1];
    expect(id).toBeTruthy();

    const note = await client.callTool({ name: "read_note", arguments: {} });
    const blocks = JSON.parse(textOf(note as never)) as Array<{ id: string; text: string }>;
    expect(blocks.find((b) => b.id === id)?.text).toBe("클로드가 쓴 줄");

    const toggled = await client.callTool({ name: "toggle_todo", arguments: { id } });
    expect(textOf(toggled as never)).toContain("checked");

    const deleted = await client.callTool({ name: "delete_block", arguments: { id } });
    expect(textOf(deleted as never)).toContain("Deleted");

    const after = await client.callTool({ name: "read_note", arguments: {} });
    const remaining = JSON.parse(textOf(after as never)) as Array<{ id: string }>;
    expect(remaining.find((b) => b.id === id)).toBeUndefined();
  }, 30_000);
});
