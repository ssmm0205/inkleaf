import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import Database from "better-sqlite3";
import { BlockStore } from "./blocks.js";
import { createApi } from "./http.js";

let server: Server;
let base: string;

beforeAll(async () => {
  const store = new BlockStore(new Database(":memory:"));
  server = createServer(createApi(store));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  base = `http://localhost:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function api(path: string, init?: RequestInit) {
  const res = await fetch(base + path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe("REST API", () => {
  it("reports health", async () => {
    const { status, body } = await api("/api/health");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("runs a full create → list → toggle → delete round trip", async () => {
    const created = await api("/api/blocks", {
      method: "POST",
      body: JSON.stringify({ type: "todo", text: "정리하기" }),
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(created.body.checked).toBe(false);

    const listed = await api("/api/blocks");
    expect(listed.body.map((b: { id: string }) => b.id)).toContain(id);

    const toggled = await api(`/api/blocks/${id}/toggle`, { method: "POST" });
    expect(toggled.body.checked).toBe(true);

    const patched = await api(`/api/blocks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text: "정리 완료" }),
    });
    expect(patched.body.text).toBe("정리 완료");

    const removed = await api(`/api/blocks/${id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);

    const after = await api("/api/blocks");
    expect(after.body.map((b: { id: string }) => b.id)).not.toContain(id);
  });

  it("404s an unknown api route", async () => {
    const { status } = await api("/api/nope");
    expect(status).toBe(404);
  });

  it("400s a bad mutation (toggling a non-existent block)", async () => {
    const { status } = await api("/api/blocks/ghost/toggle", { method: "POST" });
    expect(status).toBe(400);
  });
});
