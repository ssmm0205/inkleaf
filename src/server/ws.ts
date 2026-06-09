import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { BlockStore } from "./blocks.js";

/**
 * Streams the notebook to every connected browser. On connect, the client gets
 * a full snapshot; thereafter every Block mutation (human OR agent) is pushed
 * as a `change` so the page can animate it in handwriting in real time.
 */
export function attachWebsocket(server: Server, store: BlockStore): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "snapshot", blocks: store.list() }));
  });

  store.onChange((change) => {
    const payload = JSON.stringify({ type: "change", change });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  });
}
