import type { Block, BlockType } from "../server/blocks";

export type { Block, BlockType };

const JSON_HEADERS = { "content-type": "application/json" };

export async function createBlock(input: {
  text: string;
  type?: BlockType;
}): Promise<Block> {
  const res = await fetch("/api/blocks", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function toggleBlock(id: string): Promise<void> {
  await fetch(`/api/blocks/${encodeURIComponent(id)}/toggle`, { method: "POST" });
}

export async function updateBlock(
  id: string,
  patch: { text?: string; checked?: boolean },
): Promise<void> {
  await fetch(`/api/blocks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export async function deleteBlock(id: string): Promise<void> {
  await fetch(`/api/blocks/${encodeURIComponent(id)}`, { method: "DELETE" });
}
