import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNotebook } from "./useNotebook";
import { createBlock, toggleBlock, deleteBlock, updateBlock, type Block } from "./client";

export function App() {
  const { blocks, connected, animating, settle } = useNotebook();
  const [draft, setDraft] = useState("");
  const [asTodo, setAsTodo] = useState(true);

  async function add(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await createBlock({ text, type: asTodo ? "todo" : "text" });
  }

  return (
    <div className="page">
      <div className="margin-line" />
      <header className="masthead">
        <h1>Inkleaf</h1>
        <span className={`status ${connected ? "on" : "off"}`}>
          {connected ? "live" : "offline"}
        </span>
        <GoogleBadge />
      </header>

      <ul className="note">
        {blocks.length === 0 && (
          <li className="empty ink">아직 아무것도 없어요. 한 줄 적어볼까요…</li>
        )}
        {blocks.map((block) => (
          <BlockRow
            key={block.id}
            block={block}
            animate={animating.has(block.id)}
            onSettle={() => settle(block.id)}
          />
        ))}
      </ul>

      <form className="composer" onSubmit={add}>
        <button
          type="button"
          className={`mode ${asTodo ? "todo" : "text"}`}
          onClick={() => setAsTodo((value) => !value)}
          title="할 일 / 메모 전환"
        >
          {asTodo ? "☑ 할 일" : "✎ 메모"}
        </button>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="여기에 적으세요…"
          autoFocus
        />
        <button type="submit" className="write">쓰기</button>
      </form>
    </div>
  );
}

function BlockRow({
  block,
  animate,
  onSettle,
}: {
  block: Block;
  animate: boolean;
  onSettle: () => void;
}) {
  const isTodo = block.type === "todo";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.text);

  useEffect(() => {
    if (!editing) setDraft(block.text);
  }, [block.text, editing]);

  async function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== block.text) {
      await updateBlock(block.id, { text: next });
    } else {
      setDraft(block.text);
    }
  }

  return (
    <li className={`block ${isTodo ? "is-todo" : ""} ${block.checked ? "done" : ""}`}>
      {isTodo && (
        <button
          className="checkbox"
          onClick={() => toggleBlock(block.id)}
          aria-label={block.checked ? "체크 해제" : "체크"}
        >
          {block.checked ? "✓" : ""}
        </button>
      )}
      {editing ? (
        <input
          className="ink edit"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setDraft(block.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span
          className={`ink ${animate ? "handwrite" : ""}`}
          onAnimationEnd={onSettle}
          onDoubleClick={() => setEditing(true)}
          title="더블클릭하여 수정"
        >
          {block.text}
        </span>
      )}
      <button className="trash" onClick={() => deleteBlock(block.id)} aria-label="삭제">
        ×
      </button>
    </li>
  );
}

interface GoogleStatus {
  enabled: boolean;
  connected: boolean;
}

function GoogleBadge() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/google/status");
      setStatus(await res.json());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!status?.enabled) return null;
  if (status.connected) return <span className="gcal on">Google ✓</span>;

  async function connect() {
    const { url } = await (await fetch("/api/google/auth-url")).json();
    window.open(url, "_blank", "width=520,height=660");
    const poll = setInterval(async () => {
      const next: GoogleStatus = await (await fetch("/api/google/status")).json();
      if (next.connected) {
        setStatus(next);
        clearInterval(poll);
      }
    }, 2000);
  }

  return (
    <button className="gcal" onClick={connect}>
      Google 연동
    </button>
  );
}
