import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import type { BlockStore, BlockType } from "./blocks.js";

const DIST = resolve(process.cwd(), "dist");

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json" });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * REST surface over the Block store. Both the browser (user edits) and the MCP
 * server (agent edits) call these endpoints; the store emits changes that the
 * websocket hub then broadcasts.
 */
export function createApi(store: BlockStore) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const method = req.method ?? "GET";

    try {
      if (path === "/api/health") return sendJson(res, 200, { ok: true });

      if (path === "/api/blocks" && method === "GET") {
        return sendJson(res, 200, store.list());
      }

      if (path === "/api/blocks" && method === "POST") {
        const body = await readJsonBody(req);
        const block = store.create({
          type: body.type as BlockType | undefined,
          text: String(body.text ?? ""),
          checked: body.checked as boolean | undefined,
          position: body.position as number | undefined,
        });
        return sendJson(res, 201, block);
      }

      const match = path.match(/^\/api\/blocks\/([^/]+)(\/toggle)?$/);
      if (match) {
        const id = decodeURIComponent(match[1]);
        const isToggle = match[2] === "/toggle";
        if (isToggle && method === "POST") return sendJson(res, 200, store.toggle(id));
        if (method === "PATCH") {
          const body = await readJsonBody(req);
          return sendJson(res, 200, store.update(id, body));
        }
        if (method === "DELETE") return sendJson(res, 200, store.remove(id));
      }

      if (path.startsWith("/api/")) return sendJson(res, 404, { error: "not found" });

      // Static assets (built UI) — only when a production build exists.
      if (existsSync(DIST)) return await serveStatic(res, path);

      return sendJson(res, 404, { error: "not found" });
    } catch (err) {
      return sendJson(res, 400, { error: (err as Error).message });
    }
  };
}

async function serveStatic(res: ServerResponse, path: string): Promise<void> {
  const rel = path === "/" ? "index.html" : path.replace(/^\//, "");
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, safe);
  if (!existsSync(file)) file = join(DIST, "index.html"); // SPA fallback
  const ext = file.slice(file.lastIndexOf("."));
  const data = await readFile(file);
  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
  res.end(data);
}
