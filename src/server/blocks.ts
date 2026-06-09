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
    `);
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
      id: crypto.randomUUID(),
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
