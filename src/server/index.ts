import { createServer } from "node:http";
import { openDatabase } from "./db.js";
import { BlockStore } from "./blocks.js";
import { createApi } from "./http.js";
import { attachWebsocket } from "./ws.js";
import { createGoogleAuth, type GoogleAuth } from "./google/oauth.js";
import { createGoogleClient } from "./google/client.js";
import { GoogleSync } from "./google/sync.js";

const PORT = Number(process.env.INKLEAF_PORT ?? 8788);
const DB_PATH = process.env.INKLEAF_DB ?? "inkleaf.db";

const db = openDatabase(DB_PATH);
const store = new BlockStore(db);

// Google Tasks/Calendar sync is opt-in: enabled only when OAuth creds are set.
let googleAuth: GoogleAuth | undefined;
let sync: GoogleSync | undefined;
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (clientId && clientSecret) {
  const startSync = () =>
    void sync?.start().catch((err) =>
      console.error("[inkleaf] sync start failed:", (err as Error).message),
    );
  googleAuth = createGoogleAuth({
    clientId,
    clientSecret,
    redirectUri: `http://localhost:${PORT}/api/google/callback`,
    store,
    onConnect: startSync, // start syncing as soon as the user authorizes
  });
  sync = new GoogleSync(store, createGoogleClient(googleAuth.client));
  if (googleAuth.isConnected()) startSync(); // already authorized in a prior run
  console.log("🔗 Google sync enabled");
} else {
  console.log(
    "ℹ️  Google sync disabled (set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET to enable)",
  );
}

const server = createServer(createApi(store, googleAuth));
attachWebsocket(server, store);

server.listen(PORT, () => {
  console.log(`🍃 Inkleaf server listening on http://localhost:${PORT}`);
});
