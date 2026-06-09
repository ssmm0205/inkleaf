import { google } from "googleapis";

// Use the OAuth2 client type googleapis itself expects (it bundles its own copy
// of google-auth-library, whose OAuth2Client differs from the top-level one).
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

/**
 * A narrow interface over the bits of Google we use, so the sync engine can be
 * driven by a mock in tests. Slice 1 covers Google Tasks (the default list);
 * Calendar methods are added in Slice 2.
 */
export interface GoogleTask {
  id: string;
  title: string;
  completed: boolean;
  /** RFC3339 timestamp from Google's `updated` field. */
  updated: string;
  deleted: boolean;
}

export interface GoogleClient {
  createTask(input: { title: string; completed: boolean }): Promise<GoogleTask>;
  patchTask(
    taskId: string,
    patch: { title?: string; completed?: boolean },
  ): Promise<GoogleTask>;
  deleteTask(taskId: string): Promise<void>;
  /** Tasks updated at/after `updatedMin` (RFC3339), including completed/deleted. */
  listTasks(updatedMin?: string): Promise<GoogleTask[]>;
}

const TASKLIST = "@default";

function toGoogleTask(t: {
  id?: string | null;
  title?: string | null;
  status?: string | null;
  updated?: string | null;
  deleted?: boolean | null;
}): GoogleTask {
  return {
    id: t.id ?? "",
    title: t.title ?? "",
    completed: t.status === "completed",
    updated: t.updated ?? new Date(0).toISOString(),
    deleted: t.deleted ?? false,
  };
}

export function createGoogleClient(auth: OAuth2Client): GoogleClient {
  const tasks = google.tasks({ version: "v1", auth });

  return {
    async createTask({ title, completed }) {
      const res = await tasks.tasks.insert({
        tasklist: TASKLIST,
        requestBody: { title, status: completed ? "completed" : "needsAction" },
      });
      return toGoogleTask(res.data);
    },

    async patchTask(taskId, patch) {
      const requestBody: { title?: string; status?: string; completed?: null } =
        {};
      if (patch.title !== undefined) requestBody.title = patch.title;
      if (patch.completed !== undefined) {
        requestBody.status = patch.completed ? "completed" : "needsAction";
        // Clearing `completed` is required to actually un-complete a task.
        if (!patch.completed) requestBody.completed = null;
      }
      const res = await tasks.tasks.patch({
        tasklist: TASKLIST,
        task: taskId,
        requestBody,
      });
      return toGoogleTask(res.data);
    },

    async deleteTask(taskId) {
      await tasks.tasks.delete({ tasklist: TASKLIST, task: taskId });
    },

    async listTasks(updatedMin) {
      const res = await tasks.tasks.list({
        tasklist: TASKLIST,
        updatedMin,
        showCompleted: true,
        showDeleted: true,
        showHidden: true,
        maxResults: 100,
      });
      return (res.data.items ?? []).map(toGoogleTask);
    },
  };
}
