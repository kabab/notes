import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api, type NoteSummary, type SearchHit } from "../api";
import { useTreeAction } from "../routes/tree-action";
import { PlusIcon } from "./icons";
import { Snippet } from "./Snippet";
import { useNotify } from "./Toaster";

type Item = { kind: "note"; id: string; title: string; snippet?: string } | { kind: "create"; title: string };

/** ⌘K: jump to a note by searching, or create one with the typed title. */
export function QuickSwitcher({ notes, onClose }: { notes: NoteSummary[]; onClose(): void }) {
  const navigate = useNavigate();
  const submit = useTreeAction();
  const notify = useNotify();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Search as you type; ignore responses that arrive after a newer query.
  useEffect(() => {
    if (!query.trim()) return setHits([]);
    let current = true;
    const t = setTimeout(() => {
      api.search(query, 20).then(
        (h) => current && setHits(h),
        (e: unknown) => current && notify(e instanceof Error ? e.message : String(e)),
      );
    }, 80);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [query, notify]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    if (!q) {
      return [...notes]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 10)
        .map((n) => ({ kind: "note", id: n.id, title: n.title }));
    }
    const list: Item[] = hits.map((h) => ({ kind: "note", id: h.id, title: h.title, snippet: h.snippet }));
    if (!hits.some((h) => h.title.toLowerCase() === q.toLowerCase())) list.push({ kind: "create", title: q });
    return list;
  }, [query, hits, notes]);

  useEffect(() => setSelected(0), [items]);
  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.kind === "note") navigate(`/notes/${item.id}`);
    else submit({ intent: "create-note", folderId: null, title: item.title });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-[15vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Quick switcher"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(items[selected]);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          placeholder="Find or create a note…"
          className="w-full border-b border-neutral-200 bg-transparent px-4 py-3 outline-none dark:border-neutral-700"
        />
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {!query.trim() && items.length > 0 && <li className="px-4 py-1 text-xs text-neutral-400">Recent</li>}
          {items.map((item, i) => (
            <li
              key={item.kind === "note" ? item.id : "create"}
              onMouseMove={() => setSelected(i)}
              onClick={() => choose(item)}
              className={`cursor-pointer px-4 py-2 ${i === selected ? "bg-blue-600 text-white" : ""}`}
            >
              {item.kind === "note" ? (
                <>
                  <div className="truncate text-sm font-medium">{item.title}</div>
                  {item.snippet && (
                    <div className={`truncate text-xs ${i === selected ? "text-blue-100" : "text-neutral-500"}`}>
                      <Snippet text={item.snippet} />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <PlusIcon /> Create note “{item.title}”
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
