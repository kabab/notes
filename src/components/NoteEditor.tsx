import type { Text } from "@codemirror/state";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouteLoaderData, useSearchParams } from "react-router";
import { api, type Note } from "../api";
import { Editor, type EditorHandle } from "../editor/Editor";
import { debounce } from "../lib/debounce";
import type { RootData } from "../routes/root";
import { useTreeAction } from "../routes/tree-action";
import { Breadcrumb } from "./Breadcrumb";
import { ImageIcon } from "./icons";
import { useNotify } from "./Toaster";

const AUTOSAVE_MS = 500;

/** Saves still in flight per note, so reopening a note never loads a stale body. */
const inflight = new Map<string, Promise<unknown>>();

/** Loaders call this before fetching a note. */
export async function waitForPendingSaves(): Promise<void> {
  await Promise.all(inflight.values());
}

type SaveStatus = "saved" | "dirty" | "saving" | "error";

/**
 * Title + Markdown editor with autosave. Render with `key={note.id}`: the editor owns the
 * body after mount, and remounting flushes the previous note's pending save.
 */
export function NoteEditor({ note, header }: { note: Note; header?: ReactNode }) {
  const { folders, notes } = useRouteLoaderData("root") as RootData;
  const navigate = useNavigate();
  const notify = useNotify();
  const submit = useTreeAction();
  const [searchParams] = useSearchParams();

  // The body is owned by the editor after mount; loader revalidations don't overwrite it.
  const editorRef = useRef<EditorHandle>(null);
  const [status, setStatus] = useState<SaveStatus>("saved");

  const save = useMemo(
    () =>
      debounce(async (doc: Text) => {
        setStatus("saving");
        const request = api.saveNoteBody(note.id, doc.toString());
        const settled = request.catch(() => {});
        inflight.set(note.id, settled);
        try {
          await request;
          setStatus((s) => (s === "saving" ? "saved" : s));
        } catch (e) {
          setStatus("error");
          notify(`Couldn't save "${note.title}": ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          if (inflight.get(note.id) === settled) inflight.delete(note.id);
        }
      }, AUTOSAVE_MS),
    // note.title only feeds the error message; don't recreate the debouncer on rename.
    [note.id, notify],
  );

  // Flush on unmount (navigation), window blur, and app close.
  useEffect(() => {
    const flush = () => void save.flush();
    window.addEventListener("blur", flush);
    const unsubscribe = api.onBeforeClose(() => save.flush());
    return () => {
      window.removeEventListener("blur", flush);
      unsubscribe();
      flush();
    };
  }, [save]);

  // Title: local while editing, follows renames made elsewhere (e.g. the sidebar).
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(note.title);
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(note.title);
  }, [note.title]);

  const isNew = searchParams.has("new");
  const lineParam = searchParams.get("line");
  const initialLine = lineParam === null ? undefined : Number(lineParam);
  useEffect(() => {
    if (isNew) titleRef.current?.select();
  }, [isNew]);

  const openLink = async (target: string) => {
    try {
      const found = await api.resolveLink(target);
      if (found) navigate(`/notes/${found.id}`);
      else notify(`No note named "${target}"`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    }
  };

  const insertImages = async () => {
    try {
      const added = await api.pickImages();
      editorRef.current?.insertImages(added.map((a) => a.hash));
    } catch (e) {
      notify(`Couldn't add image: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const commitTitle = () => {
    const trimmed = title.trim();
    if (!trimmed) setTitle(note.title);
    else if (trimmed !== note.title) submit({ intent: "rename-note", id: note.id, title: trimmed });
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-8 py-6">
      {header}
      <div className="flex items-center justify-between gap-4">
        <Breadcrumb folders={folders} folderId={note.folderId} />
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            title="Insert image"
            onClick={insertImages}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <ImageIcon />
          </button>
          <NoteDate note={note} onChange={(date) => submit({ intent: "set-note-date", id: note.id, date })} />
          <span className="w-16 text-right text-xs text-neutral-400">{STATUS_LABEL[status]}</span>
        </div>
      </div>
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            editorRef.current?.focus(); // blurs the title, which commits it
          }
          if (e.key === "Escape") {
            setTitle(note.title);
            requestAnimationFrame(() => titleRef.current?.blur());
          }
        }}
        placeholder="Untitled"
        className="mt-1 w-full bg-transparent text-2xl font-semibold outline-none"
      />
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <Editor
          ref={editorRef}
          initialDoc={note.body}
          initialLine={initialLine}
          onChange={(doc) => {
            setStatus("dirty");
            save(doc);
          }}
          onOpenLink={openLink}
          linkTitles={() => notes.filter((n) => n.id !== note.id).map((n) => n.title)}
          uploadImage={async (file) => (await api.addAttachment(file, file.name)).hash}
          imageUrl={(hash) => api.attachmentUrl(hash)}
          onError={notify}
        />
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: "Saved",
  dirty: "Edited",
  saving: "Saving…",
  error: "Not saved",
};

/** The note's daily-note date: shown when set, editable with the native date picker. */
function NoteDate({ note, onChange }: { note: Note; onChange(date: string | null): void }) {
  return (
    <span className="flex items-center gap-1 text-xs text-neutral-500">
      <input
        type="date"
        value={note.date ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        title={note.date ? "Daily note date" : "Make this the daily note for a date"}
        className={`rounded bg-transparent px-1 outline-none hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
          note.date ? "" : "w-6 opacity-40 hover:w-auto hover:opacity-100 focus:w-auto focus:opacity-100"
        }`}
      />
      {note.date && (
        <button type="button" title="Remove date" onClick={() => onChange(null)} className="hover:text-red-600">
          ×
        </button>
      )}
    </span>
  );
}
