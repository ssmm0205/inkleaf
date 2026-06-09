import { google } from "googleapis";
import type { BlockStore } from "../blocks.js";

/** The OAuth2 client type googleapis expects (it bundles its own auth lib). */
export type GoogleOAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const SCOPES = [
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/calendar.events",
];
const REFRESH_TOKEN_KEY = "googleRefreshToken";

export interface GoogleAuth {
  client: GoogleOAuth2Client;
  getAuthUrl(): string;
  exchangeCode(code: string): Promise<void>;
  isConnected(): boolean;
}

/**
 * Desktop/loopback OAuth. The redirect points back at this same server
 * (`/api/google/callback`), so no temporary listener is needed. The refresh
 * token is persisted in the SQLite `sync_state` table and reloaded on startup,
 * so the connection survives restarts. Refreshed tokens are caught via the
 * `tokens` event.
 */
export function createGoogleAuth(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  store: BlockStore;
  onConnect?: () => void;
}): GoogleAuth {
  const { clientId, clientSecret, redirectUri, store } = opts;
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  let connected = false;
  const savedRefreshToken = store.getSyncState(REFRESH_TOKEN_KEY);
  if (savedRefreshToken) {
    client.setCredentials({ refresh_token: savedRefreshToken });
    connected = true;
  }

  client.on("tokens", (tokens) => {
    if (tokens.refresh_token) {
      store.setSyncState(REFRESH_TOKEN_KEY, tokens.refresh_token);
      connected = true;
    }
  });

  return {
    client,
    getAuthUrl() {
      return client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: SCOPES,
      });
    },
    async exchangeCode(code: string) {
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);
      if (tokens.refresh_token) {
        store.setSyncState(REFRESH_TOKEN_KEY, tokens.refresh_token);
      }
      connected = true;
      opts.onConnect?.();
    },
    isConnected() {
      return connected;
    },
  };
}
