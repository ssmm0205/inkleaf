import { useCallback, useEffect, useState } from "react";
import type { Block } from "./client";

interface SnapshotMsg {
  type: "snapshot";
  blocks: Block[];
}
interface ChangeMsg {
  type: "change";
  change: { kind: "created" | "updated" | "deleted"; block: Block };
}
type ServerMsg = SnapshotMsg | ChangeMsg;

function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort(
    (a, b) => a.position - b.position || a.createdAt - b.createdAt,
  );
}

/**
 * Subscribes to the notebook over the websocket. All state changes — whether a
 * human or Claude made them — arrive here, so there is a single source of truth
 * on screen. Freshly created blocks are flagged so the page can play the
 * handwriting animation once.
 */
export function useNotebook(): {
  blocks: Block[];
  connected: boolean;
  animating: Set<string>;
  settle: (id: string) => void;
} {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [connected, setConnected] = useState(false);
  const [animating, setAnimating] = useState<Set<string>>(new Set());

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const msg: ServerMsg = JSON.parse(event.data);
      if (msg.type === "snapshot") {
        setBlocks(sortBlocks(msg.blocks));
        return;
      }
      const { kind, block } = msg.change;
      setBlocks((prev) => {
        if (kind === "deleted") return prev.filter((b) => b.id !== block.id);
        const without = prev.filter((b) => b.id !== block.id);
        return sortBlocks([...without, block]);
      });
      if (kind === "created") {
        setAnimating((prev) => new Set(prev).add(block.id));
      }
    };

    return () => ws.close();
  }, []);

  const settle = useCallback((id: string) => {
    setAnimating((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { blocks, connected, animating, settle };
}
