import { createServer } from "node:http";
import { openDatabase } from "./db.js";
import { BlockStore } from "./blocks.js";
import { createApi } from "./http.js";
import { attachWebsocket } from "./ws.js";

const PORT = Number(process.env.INKLEAF_PORT ?? 8788);
const DB_PATH = process.env.INKLEAF_DB ?? "inkleaf.db";

const db = openDatabase(DB_PATH);
const store = new BlockStore(db);

const server = createServer(createApi(store));
attachWebsocket(server, store);

server.listen(PORT, () => {
  console.log(`🍃 Inkleaf server listening on http://localhost:${PORT}`);
});
