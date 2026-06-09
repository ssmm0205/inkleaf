import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { BlockStore } from "../blocks.js";
import { GoogleSync } from "./sync.js";
import type { GoogleClient, GoogleTask } from "./client.js";

/** In-memory fake of the Google Tasks side, with call tracking. */
class MockGoogleClient implements GoogleClient {
  tasks = new Map<string, GoogleTask>();
  createCalls: Array<{ title: string; completed: boolean }> = [];
  patchCalls: Array<{ taskId: string; patch: { title?: string; completed?: boolean } }> = [];
  deleteCalls: string[] = [];
  private idSeq = 0;
  private clock = 0;

  /** Strictly-increasing, future timestamps so they sort after the engine's `since`. */
  private stamp(): string {
    this.clock += 1000;
    return new Date(Date.now() + this.clock).toISOString();
  }

  async createTask(input: { title: string; completed: boolean }): Promise<GoogleTask> {
    this.createCalls.push(input);
    const task: GoogleTask = {
      id: `gt-${++this.idSeq}`,
      title: input.title,
      completed: input.completed,
      updated: this.stamp(),
      deleted: false,
    };
    this.tasks.set(task.id, task);
    return { ...task };
  }

  async patchTask(taskId: string, patch: { title?: string; completed?: boolean }): Promise<GoogleTask> {
    this.patchCalls.push({ taskId, patch });
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`no such task ${taskId}`);
    if (patch.title !== undefined) task.title = patch.title;
    if (patch.completed !== undefined) task.completed = patch.completed;
    task.updated = this.stamp();
    return { ...task };
  }

  async deleteTask(taskId: string): Promise<void> {
    this.deleteCalls.push(taskId);
    this.tasks.delete(taskId);
  }

  async listTasks(updatedMin?: string): Promise<GoogleTask[]> {
    const all = [...this.tasks.values()];
    const filtered = updatedMin ? all.filter((t) => t.updated >= updatedMin) : all;
    return filtered.map((t) => ({ ...t }));
  }

  // --- helpers to simulate phone-side changes ---
  remoteUpsert(id: string, title: string, completed: boolean): void {
    this.tasks.set(id, { id, title, completed, updated: this.stamp(), deleted: false });
  }
  remoteComplete(id: string, completed: boolean): void {
    const t = this.tasks.get(id)!;
    t.completed = completed;
    t.updated = this.stamp();
  }
  remoteDelete(id: string): void {
    const t = this.tasks.get(id)!;
    t.deleted = true;
    t.updated = this.stamp();
  }
}

describe("GoogleSync (Tasks two-way)", () => {
  let store: BlockStore;
  let google: MockGoogleClient;
  let sync: GoogleSync;

  beforeEach(async () => {
    store = new BlockStore(new Database(":memory:"));
    google = new MockGoogleClient();
    // Huge poll interval so the timer never fires mid-test; we drive via tick().
    sync = new GoogleSync(store, google, { pollIntervalMs: 10_000_000 });
    await sync.start();
  });
  afterEach(() => sync.stop());

  it("creates a Google Task when a todo Block is created", async () => {
    const block = store.create({ type: "todo", text: "우유 사기" });
    await sync.drain();
    expect(google.createCalls).toEqual([{ title: "우유 사기", completed: false }]);
    expect(store.getSyncMeta(block.id)?.googleTaskId).toBeTruthy();
  });

  it("does not sync plain text Blocks", async () => {
    store.create({ type: "text", text: "그냥 메모" });
    await sync.drain();
    expect(google.createCalls).toHaveLength(0);
  });

  it("patches the Google Task when a todo is toggled", async () => {
    const block = store.create({ type: "todo", text: "할 일" });
    await sync.drain();
    store.toggle(block.id);
    await sync.drain();
    expect(google.patchCalls.at(-1)?.patch.completed).toBe(true);
  });

  it("deletes the Google Task when a Block is removed", async () => {
    const block = store.create({ type: "todo", text: "지울 것" });
    await sync.drain();
    const taskId = store.getSyncMeta(block.id)!.googleTaskId!;
    store.remove(block.id);
    await sync.drain();
    expect(google.deleteCalls).toContain(taskId);
  });

  it("inbound: a new remote task becomes a Block", async () => {
    google.remoteUpsert("ext-1", "폰에서 추가", false);
    await sync.tick();
    const block = store.findByGoogleTaskId("ext-1");
    expect(block?.text).toBe("폰에서 추가");
    expect(block?.type).toBe("todo");
  });

  it("inbound: a remote completion updates the Block", async () => {
    google.remoteUpsert("ext-2", "체크될 것", false);
    await sync.tick();
    google.remoteComplete("ext-2", true);
    await sync.tick();
    expect(store.findByGoogleTaskId("ext-2")?.checked).toBe(true);
  });

  it("inbound: a remote deletion removes the Block", async () => {
    google.remoteUpsert("ext-3", "삭제될 것", false);
    await sync.tick();
    expect(store.findByGoogleTaskId("ext-3")).toBeTruthy();
    google.remoteDelete("ext-3");
    await sync.tick();
    expect(store.findByGoogleTaskId("ext-3")).toBeUndefined();
  });

  it("does not echo: applying an inbound task triggers no outbound write", async () => {
    google.remoteUpsert("ext-4", "에코 금지", false);
    await sync.tick();
    await sync.drain();
    expect(google.createCalls).toHaveLength(0);
    expect(google.patchCalls).toHaveLength(0);
  });

  it("last-write-wins: the echo of our own outbound create is not re-applied", async () => {
    const block = store.create({ type: "todo", text: "원본" });
    await sync.drain();
    const before = store.get(block.id)!.updatedAt;
    // Inbound poll now returns the task we just created (same `updated`).
    await sync.tick();
    expect(store.get(block.id)!.updatedAt).toBe(before); // not re-touched
    expect(google.createCalls).toHaveLength(1);
  });
});
