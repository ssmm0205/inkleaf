import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { BlockStore, DEFAULT_NOTE_ID, type BlockChange } from "./blocks.js";

function freshStore(): BlockStore {
  return new BlockStore(new Database(":memory:"));
}

describe("BlockStore", () => {
  let store: BlockStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("starts empty", () => {
    expect(store.list()).toEqual([]);
  });

  it("creates a text block with sensible defaults", () => {
    const block = store.create({ text: "buy milk" });
    expect(block.id).toBeTruthy();
    expect(block.type).toBe("text");
    expect(block.checked).toBe(false);
    expect(block.noteId).toBe(DEFAULT_NOTE_ID);
    expect(store.list()).toHaveLength(1);
  });

  it("creates a todo that can be unchecked by default", () => {
    const todo = store.create({ type: "todo", text: "ship it" });
    expect(todo.type).toBe("todo");
    expect(todo.checked).toBe(false);
  });

  it("lists blocks in ascending position order", () => {
    const a = store.create({ text: "first" });
    const b = store.create({ text: "second" });
    const c = store.create({ text: "third" });
    expect(store.list().map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    expect(a.position).toBeLessThan(b.position);
    expect(b.position).toBeLessThan(c.position);
  });

  it("reads a single block by id", () => {
    const a = store.create({ text: "hello" });
    expect(store.get(a.id)?.text).toBe("hello");
    expect(store.get("nope")).toBeUndefined();
  });

  it("updates a block's text", () => {
    const a = store.create({ text: "old" });
    const updated = store.update(a.id, { text: "new" });
    expect(updated.text).toBe("new");
    expect(store.get(a.id)?.text).toBe("new");
  });

  it("throws when updating a missing block", () => {
    expect(() => store.update("ghost", { text: "x" })).toThrow();
  });

  it("toggles a todo's checked state", () => {
    const todo = store.create({ type: "todo", text: "task" });
    expect(store.toggle(todo.id).checked).toBe(true);
    expect(store.toggle(todo.id).checked).toBe(false);
  });

  it("refuses to toggle a non-todo block", () => {
    const text = store.create({ type: "text", text: "note" });
    expect(() => store.toggle(text.id)).toThrow();
  });

  it("removes a block", () => {
    const a = store.create({ text: "temp" });
    store.remove(a.id);
    expect(store.get(a.id)).toBeUndefined();
    expect(store.list()).toHaveLength(0);
  });

  it("throws when removing a missing block", () => {
    expect(() => store.remove("ghost")).toThrow();
  });

  it("emits change events for create, update and delete", () => {
    const events: BlockChange[] = [];
    store.onChange((c) => events.push(c));

    const a = store.create({ type: "todo", text: "watch me" });
    store.toggle(a.id);
    store.update(a.id, { text: "renamed" });
    store.remove(a.id);

    expect(events.map((e) => e.kind)).toEqual([
      "created",
      "updated",
      "updated",
      "deleted",
    ]);
    expect(events[0].block.text).toBe("watch me");
    expect(events[3].block.id).toBe(a.id);
  });
});

describe("BlockStore sync metadata", () => {
  let store: BlockStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("round-trips key/value sync state", () => {
    expect(store.getSyncState("calendarSyncToken")).toBeUndefined();
    store.setSyncState("calendarSyncToken", "abc123");
    expect(store.getSyncState("calendarSyncToken")).toBe("abc123");
    store.setSyncState("calendarSyncToken", "def456");
    expect(store.getSyncState("calendarSyncToken")).toBe("def456");
  });

  it("stores and reads per-Block Google linkage", () => {
    const block = store.create({ type: "todo", text: "linked" });
    store.setSyncMeta(block.id, {
      googleTaskId: "gtask-1",
      remoteUpdatedAt: 1000,
      syncedAt: 2000,
    });
    const meta = store.getSyncMeta(block.id);
    expect(meta).toEqual({
      googleTaskId: "gtask-1",
      googleEventId: null,
      remoteUpdatedAt: 1000,
      syncedAt: 2000,
    });
    expect(store.findByGoogleTaskId("gtask-1")?.id).toBe(block.id);
    expect(store.findByGoogleTaskId("nope")).toBeUndefined();
  });

  it("does NOT emit a change event when writing sync metadata", () => {
    const block = store.create({ type: "todo", text: "quiet" });
    const events: BlockChange[] = [];
    store.onChange((c) => events.push(c));
    store.setSyncMeta(block.id, { googleTaskId: "gtask-2" });
    expect(events).toHaveLength(0);
  });

  it("migrates idempotently when opened twice on the same db", () => {
    const db = new Database(":memory:");
    const first = new BlockStore(db);
    const a = first.create({ text: "kept" });
    // Re-opening (second migrate pass) must not throw or lose data.
    const second = new BlockStore(db);
    expect(second.get(a.id)?.text).toBe("kept");
  });
});
