import type { BlockStore, BlockChange } from "../blocks.js";
import type { GoogleClient, GoogleTask } from "./client.js";

const LAST_TASKS_SYNC_KEY = "tasksUpdatedMin";
const DEFAULT_POLL_MS = 60_000;

export interface GoogleSyncOptions {
  pollIntervalMs?: number;
}

/**
 * Two-way sync between todo Blocks and Google Tasks (Slice 1).
 *
 * - Outbound: subscribes to BlockStore.onChange; a todo create/update/delete
 *   is mirrored to Google Tasks.
 * - Inbound: polls tasks.list(updatedMin); changes are applied to the store
 *   (which broadcasts over the websocket, so they animate on the page).
 * - Echo-suppression: ids the engine is itself writing are held in a set so the
 *   outbound listener ignores them. Plus last-write-wins by comparing Google's
 *   `updated` against the stored remoteUpdatedAt.
 */
export class GoogleSync {
  private readonly pollIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly applyingInbound = new Set<string>();
  private readonly pending = new Set<Promise<void>>();
  /** blockId → googleTaskId, so deletions can find the remote id after the row is gone. */
  private readonly googleTaskIdByBlock = new Map<string, string>();

  constructor(
    private readonly store: BlockStore,
    private readonly client: GoogleClient,
    options: GoogleSyncOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
  }

  async start(): Promise<void> {
    if (this.unsubscribe) return; // idempotent
    // Rebuild the blockId → googleTaskId map from persisted metadata.
    for (const block of this.store.list()) {
      const meta = this.store.getSyncMeta(block.id);
      if (meta?.googleTaskId) {
        this.googleTaskIdByBlock.set(block.id, meta.googleTaskId);
      }
    }
    this.unsubscribe = this.store.onChange((change) => {
      if (this.applyingInbound.has(change.block.id)) return; // echo guard
      this.track(this.handleOutbound(change));
    });
    await this.syncInbound();
    this.timer = setInterval(() => void this.syncInbound(), this.pollIntervalMs);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Await any in-flight outbound work (tests + before an inbound pass). */
  async drain(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  /** Run one full cycle (outbound settled, then one inbound poll). For tests. */
  async tick(): Promise<void> {
    await this.drain();
    await this.syncInbound();
  }

  private track(p: Promise<void>): void {
    this.pending.add(p);
    void p
      .catch((err) =>
        console.error("[inkleaf] outbound sync failed:", (err as Error).message),
      )
      .finally(() => this.pending.delete(p));
  }

  private async handleOutbound(change: BlockChange): Promise<void> {
    const block = change.block;
    if (block.type !== "todo") return; // Slice 1: only todos ↔ Google Tasks
    const googleTaskId = this.googleTaskIdByBlock.get(block.id);

    if (change.kind === "deleted") {
      if (googleTaskId) {
        await this.client.deleteTask(googleTaskId);
        this.googleTaskIdByBlock.delete(block.id);
      }
      return;
    }

    if (!googleTaskId) {
      const task = await this.client.createTask({
        title: block.text,
        completed: block.checked,
      });
      this.googleTaskIdByBlock.set(block.id, task.id);
      this.store.setSyncMeta(block.id, {
        googleTaskId: task.id,
        remoteUpdatedAt: Date.parse(task.updated),
        syncedAt: Date.now(),
      });
      return;
    }

    const task = await this.client.patchTask(googleTaskId, {
      title: block.text,
      completed: block.checked,
    });
    this.store.setSyncMeta(block.id, {
      remoteUpdatedAt: Date.parse(task.updated),
      syncedAt: Date.now(),
    });
  }

  private async syncInbound(): Promise<void> {
    const since = this.store.getSyncState(LAST_TASKS_SYNC_KEY);
    const startedAt = new Date();
    let tasks: GoogleTask[];
    try {
      tasks = await this.client.listTasks(since);
    } catch (err) {
      console.error("[inkleaf] inbound sync failed:", (err as Error).message);
      return;
    }
    for (const task of tasks) this.applyInboundTask(task);
    this.store.setSyncState(LAST_TASKS_SYNC_KEY, startedAt.toISOString());
  }

  private applyInboundTask(task: GoogleTask): void {
    if (!task.id) return;
    const existing = this.store.findByGoogleTaskId(task.id);

    if (task.deleted) {
      if (existing) {
        this.applyInbound(existing.id, () => this.store.remove(existing.id));
        this.googleTaskIdByBlock.delete(existing.id);
      }
      return;
    }

    if (!existing) {
      const id = crypto.randomUUID();
      this.applyInbound(id, () =>
        this.store.create({
          id,
          type: "todo",
          text: task.title,
          checked: task.completed,
        }),
      );
      this.googleTaskIdByBlock.set(id, task.id);
      this.store.setSyncMeta(id, {
        googleTaskId: task.id,
        remoteUpdatedAt: Date.parse(task.updated),
        syncedAt: Date.now(),
      });
      return;
    }

    // Last-write-wins: only apply if the remote is strictly newer than what we
    // last saw (this also drops the echo of our own outbound writes).
    const meta = this.store.getSyncMeta(existing.id);
    const remoteUpdated = Date.parse(task.updated);
    if (meta?.remoteUpdatedAt != null && remoteUpdated <= meta.remoteUpdatedAt) {
      return;
    }
    this.applyInbound(existing.id, () =>
      this.store.update(existing.id, {
        text: task.title,
        checked: task.completed,
      }),
    );
    this.store.setSyncMeta(existing.id, {
      remoteUpdatedAt: remoteUpdated,
      syncedAt: Date.now(),
    });
  }

  private applyInbound(id: string, fn: () => void): void {
    this.applyingInbound.add(id);
    try {
      fn();
    } finally {
      this.applyingInbound.delete(id);
    }
  }
}
