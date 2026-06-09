# Native two-way Google sync over the primary account, bounded inbound window

Inkleaf syncs Blocks with **Google Tasks** (todos) and **Google Calendar** (timed Blocks) **natively in the server** via the user's own OAuth credentials — not through a Claude session — and **two-way**. A todo Block mirrors to a Google Task and back; a checked box reflects "completed" both ways; inbound Google changes flow through `BlockStore`, so they animate on the page via the existing websocket path.

**Why:** The user wants this to work in the background without a chat session open (rules out the agent-as-bridge approach), and there is no Google Tasks connector available to the agent anyway. Server-side OAuth (`googleapis`, loopback "Desktop app" flow, refresh token persisted in the SQLite `sync_state` table) is the only way to get unattended, repeatable, two-way sync.

**Decisions and their trade-offs:**
- **Primary account, not a dedicated calendar/list** (user's choice). To avoid flooding the note with the user's entire history, inbound Calendar sync is **bounded to a rolling window (today → +14 days, configurable via `INKLEAF_SYNC_WINDOW_DAYS`)** and Tasks to the default list.
- **Polling, not webhooks** — a local app has no public URL for push notifications. Tasks use `updatedMin` polling; Calendar uses `syncToken` incremental sync (with 410→full-resync). Poll cadence well under quota.
- **Last-write-wins** by comparing Google's `updated` against the stored `remoteUpdatedAt`; ties drop (this is also how the echo of our own outbound writes is ignored). An in-process `applyingInbound` set prevents inbound writes from re-triggering outbound.
- **Mapping:** `type:"todo"` (no time) ↔ Google Task; Block with `startsAt` ↔ Calendar event; plain `text` with no time stays local.

**Consequence:** Requires the user to create a Google Cloud OAuth client (Desktop app) and publish the consent screen to "Production" to avoid the 7-day refresh-token expiry that applies in "Testing" mode (the scopes — `tasks`, `calendar.events` — are non-sensitive, so no verification review). Sync is opt-in: with no `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, the app runs exactly as before.
