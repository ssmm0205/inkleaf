import { EventEmitter } from "node:events";
import type DatabaseType from "better-sqlite3";

/**
 * Blocks are the source of truth. The handwritten look is a Skin rendered
 * over them (see docs/adr/0002). A Note is just a collection of Blocks.
 */

export const DEFAULT_NOTE_ID = "default";

export type BlockType = "text" | "todo";

export interface Block {
  id: string;
  noteId: string;
  type: BlockType;
  text: string;
  /** Only meaningful for `todo` blocks. */
  checked: boolean;
  /** Ordering within a Note; ascending. */
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateBlockInput {
  id?: string;
  noteId?: string;
  type?: BlockType;
  text: string;
  checked?: boolean;
  position?: number;
}

export interface UpdateBlockInput {
  text?: string;
  checked?: boolean;
  position?: number;
}

export type BlockChangeKind = "created" | "updated" | "deleted";

export interface BlockChange {
  kind: BlockChangeKind;
  block: Block;
}

/** Per-Block linkage to its Google counterpart (kept off the public Block). */
export interface SyncMeta {
  googleTaskId: string | null;
  googleEventId: string | null;
  remoteUpdatedAt: number | null;
  syncedAt: number | null;
}

interface BlockRow {
  id: string;
  note_id: string;
  type: string;
  text: string;
  checked: number;
  position: number;
  created_at: number;
  updated_at: number;
}

function rowToBlock(row: BlockRow): Block {
  return {
    id: row.id,
    noteId: row.note_id,
    type: row.type === "todo" ? "todo" : "text",
    text: row.text,
    checked: row.checked === 1,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Owns the Blocks table and emits a `change` event on every mutation, so the
 * websocket hub can stream edits to the open notebook in real time —
 * regardless of whether a human or the agent made the change.
 */
export class BlockStore extends EventEmitter {
  private readonly db: DatabaseType.Database;

  constructor(db: DatabaseType.Database) {
    super();
    this.db = db;
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blocks (
        id         TEXT PRIMARY KEY,
        note_id    TEXT NOT NULL,
        type       TEXT NOT NULL,
        text       TEXT NOT NULL,
        checked    INTEGER NOT NULL DEFAULT 0,
        position   REAL NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_blocks_note ON blocks (note_id, position);
      CREATE TABLE IF NOT EXISTS sync_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    // Idempotent column adds for Google sync metadata (CREATE TABLE IF NOT
    // EXISTS won't alter an existing table, so add columns explicitly).
    this.addColumn("starts_at", "INTEGER");
    this.addColumn("ends_at", "INTEGER");
    this.addColumn("google_task_id", "TEXT");
    this.addColumn("google_event_id", "TEXT");
    this.addColumn("remote_updated_at", "INTEGER");
    this.addColumn("synced_at", "INTEGER");
  }

  private addColumn(name: string, type: string): void {
    const cols = this.db.prepare("PRAGMA table_info(blocks)").all() as Array<{
      name: string;
    }>;
    if (!cols.some((c) => c.name === name)) {
      this.db.exec(`ALTER TABLE blocks ADD COLUMN ${name} ${type}`);
    }
  }

  /** Subscribe to mutations. Returns an unsubscribe function. */
  onChange(listener: (change: BlockChange) => void): () => void {
    this.on("change", listener);
    return () => this.off("change", listener);
  }

  private emitChange(kind: BlockChangeKind, block: Block): void {
    this.emit("change", { kind, block } satisfies BlockChange);
  }

  list(noteId: string = DEFAULT_NOTE_ID): Block[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM blocks WHERE note_id = ? ORDER BY position ASC, created_at ASC",
      )
      .all(noteId) as BlockRow[];
    return rows.map(rowToBlock);
  }

  get(id: string): Block | undefined {
    const row = this.db
      .prepare("SELECT * FROM blocks WHERE id = ?")
      .get(id) as BlockRow | undefined;
    return row ? rowToBlock(row) : undefined;
  }

  create(input: CreateBlockInput): Block {
    const noteId = input.noteId ?? DEFAULT_NOTE_ID;
    const now = Date.now();
    const block: Block = {
      id: input.id ?? crypto.randomUUID(),
      noteId,
      type: input.type ?? "text",
      text: input.text,
      checked: input.checked ?? false,
      position: input.position ?? this.nextPosition(noteId),
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO blocks (id, note_id, type, text, checked, position, created_at, updated_at)
         VALUES (@id, @noteId, @type, @text, @checked, @position, @createdAt, @updatedAt)`,
      )
      .run({ ...block, checked: block.checked ? 1 : 0 });
    this.emitChange("created", block);
    return block;
  }

  update(id: string, patch: UpdateBlockInput): Block {
    const existing = this.requireBlock(id);
    const next: Block = {
      ...existing,
      text: patch.text ?? existing.text,
      checked: patch.checked ?? existing.checked,
      position: patch.position ?? existing.position,
      updatedAt: Date.now(),
    };
    this.db
      .prepare(
        `UPDATE blocks SET text = @text, checked = @checked, position = @position, updated_at = @updatedAt WHERE id = @id`,
      )
      .run({
        id: next.id,
        text: next.text,
        checked: next.checked ? 1 : 0,
        position: next.position,
        updatedAt: next.updatedAt,
      });
    this.emitChange("updated", next);
    return next;
  }

  toggle(id: string): Block {
    const existing = this.requireBlock(id);
    if (existing.type !== "todo") {
      throw new Error(`Block ${id} is not a todo and cannot be toggled`);
    }
    return this.update(id, { checked: !existing.checked });
  }

  remove(id: string): Block {
    const existing = this.requireBlock(id);
    this.db.prepare("DELETE FROM blocks WHERE id = ?").run(id);
    this.emitChange("deleted", existing);
    return existing;
  }

  // --- Google sync metadata (does NOT emit change events or bump updatedAt) ---

  findByGoogleTaskId(googleTaskId: string): Block | undefined {
    const row = this.db
      .prepare("SELECT * FROM blocks WHERE google_task_id = ?")
      .get(googleTaskId) as BlockRow | undefined;
    return row ? rowToBlock(row) : undefined;
  }

  findByGoogleEventId(googleEventId: string): Block | undefined {
    const row = this.db
      .prepare("SELECT * FROM blocks WHERE google_event_id = ?")
      .get(googleEventId) as BlockRow | undefined;
    return row ? rowToBlock(row) : undefined;
  }

  getSyncMeta(blockId: string): SyncMeta | undefined {
    const row = this.db
      .prepare(
        "SELECT google_task_id, google_event_id, remote_updated_at, synced_at FROM blocks WHERE id = ?",
      )
      .get(blockId) as
      | {
          google_task_id: string | null;
          google_event_id: string | null;
          remote_updated_at: number | null;
          synced_at: number | null;
        }
      | undefined;
    if (!row) return undefined;
    return {
      googleTaskId: row.google_task_id ?? null,
      googleEventId: row.google_event_id ?? null,
      remoteUpdatedAt: row.remote_updated_at ?? null,
      syncedAt: row.synced_at ?? null,
    };
  }

  setSyncMeta(blockId: string, meta: Partial<SyncMeta>): void {
    const columns: Record<keyof SyncMeta, string> = {
      googleTaskId: "google_task_id",
      googleEventId: "google_event_id",
      remoteUpdatedAt: "remote_updated_at",
      syncedAt: "synced_at",
    };
    const sets: string[] = [];
    const params: Record<string, unknown> = { id: blockId };
    for (const key of Object.keys(meta) as Array<keyof SyncMeta>) {
      sets.push(`${columns[key]} = @${key}`);
      params[key] = meta[key] ?? null;
    }
    if (sets.length === 0) return;
    this.db
      .prepare(`UPDATE blocks SET ${sets.join(", ")} WHERE id = @id`)
      .run(params);
  }

  getSyncState(key: string): string | undefined {
    const row = this.db
      .prepare("SELECT value FROM sync_state WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  setSyncState(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  private requireBlock(id: string): Block {
    const block = this.get(id);
    if (!block) throw new Error(`Block ${id} not found`);
    return block;
  }

  private nextPosition(noteId: string): number {
    const row = this.db
      .prepare("SELECT MAX(position) AS max FROM blocks WHERE note_id = ?")
      .get(noteId) as { max: number | null };
    return (row.max ?? 0) + 1;
  }
}
