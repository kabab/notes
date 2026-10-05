import { createContext, type DragEvent, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { NavLink, useMatch, useRouteLoaderData } from "react-router";
import { api, type NoteSummary } from "../api";
import { todayISO } from "../lib/date";
import { buildTree, type FolderNode, folderPath, isWithin } from "../lib/tree";
import type { RootData } from "../routes/root";
import { useTreeAction } from "../routes/tree-action";
import { Calendar } from "./Calendar";
import { ConfirmButton } from "./ConfirmButton";
import { CalendarIcon, CheckCircleIcon, CheckSquareIcon, ChevronIcon, ExportIcon, FolderIcon, FolderPlusIcon, NoteIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "./icons";
import { InlineInput } from "./InlineInput";
import { useNotify } from "./Toaster";

// ---- shared state for the tree ---------------------------------------------

interface TreeCtx {
  data: RootData;
  submit: ReturnType<typeof useTreeAction>;
  expanded: Set<string>;
  setOpen(id: string, open: boolean): void;
  /** What's open in the main pane, so deleting it can navigate away. */
  currentNoteId: string | null;
  currentFolderId: string | null;
}

const Ctx = createContext<TreeCtx | null>(null);
const useTree = () => useContext(Ctx)!;

const EXPANDED_KEY = "sidebar.expanded";

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

// ---- drag and drop ------------------------------------------------------------

const DND_TYPE = "application/x-notes-item";
type DragItem = { kind: "folder" | "note"; id: string };

function onDragStart(e: DragEvent, item: DragItem) {
  e.dataTransfer.setData(DND_TYPE, JSON.stringify(item));
  e.dataTransfer.effectAllowed = "move";
}

/** Props that make an element a drop target for moving items into `folderId` (null = root). */
function useDropTarget(folderId: string | null, submit: TreeCtx["submit"]) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver(e: DragEvent) {
        if (!e.dataTransfer.types.includes(DND_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      },
      onDragLeave() {
        setOver(false);
      },
      onDrop(e: DragEvent) {
        setOver(false);
        const raw = e.dataTransfer.getData(DND_TYPE);
        if (!raw) return;
        e.preventDefault();
        e.stopPropagation();
        const item = JSON.parse(raw) as DragItem;
        if (item.kind === "note") submit({ intent: "move-note", id: item.id, folderId });
        else if (item.id !== folderId) submit({ intent: "move-folder", id: item.id, parentId: folderId });
      },
    },
  };
}

// ---- components -------------------------------------------------------------

export function Sidebar({ onOpenSwitcher }: { onOpenSwitcher(): void }) {
  const data = useRouteLoaderData("root") as RootData;
  const submit = useTreeAction();
  const [expanded, setExpanded] = useState(loadExpanded);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const currentNoteId = useMatch("/notes/:noteId")?.params.noteId ?? null;
  const currentFolderId = useMatch("/folders/:folderId")?.params.folderId ?? null;

  const setOpen = (id: string, open: boolean) =>
    setExpanded((prev) => {
      if (prev.has(id) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      // storage unavailable: expansion just isn't remembered
    }
  }, [expanded]);

  // Reveal whatever is open in the main pane.
  const openFolderId = currentFolderId ?? data.notes.find((n) => n.id === currentNoteId)?.folderId ?? null;
  useEffect(() => {
    const ancestors = folderPath(data.folders, openFolderId).map((f) => f.id);
    if (currentNoteId === null && ancestors.length) ancestors.pop(); // a folder page doesn't need itself expanded
    if (ancestors.some((id) => !expanded.has(id))) setExpanded((prev) => new Set([...prev, ...ancestors]));
  }, [openFolderId, currentNoteId]); // only when the open item changes, not on every toggle

  const tree = useMemo(() => buildTree(data.folders, data.notes), [data]);
  const ctx: TreeCtx = { data, submit, expanded, setOpen, currentNoteId, currentFolderId };
  const root = useDropTarget(null, submit);

  return (
    <Ctx value={ctx}>
      <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
        <nav className="px-1 pt-3">
          <button
            type="button"
            onClick={onOpenSwitcher}
            className="mb-1 flex w-full items-center gap-1.5 rounded border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-500 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <SearchIcon />
            <span className="flex-1 text-left">Quick switcher</span>
            <kbd className="text-xs">⌘K</kbd>
          </button>
          <NavItem to="/search" icon={<SearchIcon />} label="Search" />
          <NavItem to={`/daily/${todayISO()}`} icon={<CalendarIcon />} label="Today" />
          <NavItem to="/tasks" end icon={<CheckSquareIcon />} label="To do" />
          <NavItem to="/tasks/done" icon={<CheckCircleIcon />} label="Done" />
        </nav>
        <Calendar notes={data.notes} />
        <div className="group/header flex items-center justify-between px-3 pt-4 pb-1">
          <span className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Notes</span>
          <div className="flex gap-0.5">
            <IconButton title="New note" onClick={() => submit({ intent: "create-note", folderId: null })}>
              <PlusIcon />
            </IconButton>
            <IconButton title="New folder" onClick={() => setCreatingFolder(true)}>
              <FolderPlusIcon />
            </IconButton>
          </div>
        </div>
        <div
          {...root.props}
          className={`flex-1 overflow-y-auto px-1 pb-4 ${root.over ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}
        >
          <ul>
            {creatingFolder && (
              <li className="py-0.5 pr-2" style={{ paddingLeft: indent(0) }}>
                <InlineInput
                  placeholder="Folder name"
                  onCommit={(name) => {
                    setCreatingFolder(false);
                    submit({ intent: "create-folder", parentId: null, name });
                  }}
                  onCancel={() => setCreatingFolder(false)}
                />
              </li>
            )}
            {tree.folders.map((node) => (
              <FolderItem key={node.folder.id} node={node} depth={0} />
            ))}
            {tree.notes.map((note) => (
              <NoteItem key={note.id} note={note} depth={0} />
            ))}
          </ul>
          {tree.folders.length === 0 && tree.notes.length === 0 && !creatingFolder && (
            <p className="px-3 py-2 text-sm text-neutral-500">No notes yet.</p>
          )}
        </div>
        <ExportButton />
      </aside>
    </Ctx>
  );
}

const indent = (depth: number) => `${depth * 12 + 4}px`;

function FolderItem({ node, depth }: { node: FolderNode; depth: number }) {
  const { submit, expanded, setOpen, data, currentNoteId, currentFolderId } = useTree();
  const { folder } = node;
  const open = expanded.has(folder.id);
  const [renaming, setRenaming] = useState(false);
  const [creating, setCreating] = useState(false);
  const drop = useDropTarget(folder.id, submit);

  const remove = () => {
    // If what's open in the main pane is inside this folder, leave it.
    const openNoteFolder = data.notes.find((n) => n.id === currentNoteId)?.folderId ?? null;
    const affected =
      (currentFolderId !== null && isWithin(data.folders, currentFolderId, folder.id)) ||
      (currentNoteId !== null && isWithin(data.folders, openNoteFolder, folder.id));
    submit({ intent: "delete-folder", id: folder.id, redirectTo: affected ? "/" : undefined });
  };

  return (
    <li>
      <Row
        depth={depth}
        dropOver={drop.over}
        dropProps={drop.props}
        draggable={!renaming}
        onDragStart={(e) => onDragStart(e, { kind: "folder", id: folder.id })}
        actions={
          <>
            <IconButton title="New note in folder" onClick={() => submit({ intent: "create-note", folderId: folder.id })}>
              <PlusIcon />
            </IconButton>
            <IconButton
              title="New subfolder"
              onClick={() => {
                setOpen(folder.id, true);
                setCreating(true);
              }}
            >
              <FolderPlusIcon />
            </IconButton>
            <IconButton title="Rename" onClick={() => setRenaming(true)}>
              <PencilIcon />
            </IconButton>
            <ConfirmButton title="Delete folder and its contents" onConfirm={remove}>
              <TrashIcon />
            </ConfirmButton>
          </>
        }
      >
        <button
          type="button"
          title={open ? "Collapse" : "Expand"}
          onClick={() => setOpen(folder.id, !open)}
          className="shrink-0 rounded p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          <ChevronIcon className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        {renaming ? (
          <InlineInput
            initial={folder.name}
            onCommit={(name) => {
              setRenaming(false);
              submit({ intent: "rename-folder", id: folder.id, name });
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <ItemLink to={`/folders/${folder.id}`} icon={<FolderIcon />} label={folder.name} />
        )}
      </Row>
      {open && (
        <ul>
          {creating && (
            <li className="py-0.5 pr-2" style={{ paddingLeft: indent(depth + 1) }}>
              <InlineInput
                placeholder="Folder name"
                onCommit={(name) => {
                  setCreating(false);
                  submit({ intent: "create-folder", parentId: folder.id, name });
                }}
                onCancel={() => setCreating(false)}
              />
            </li>
          )}
          {node.children.map((child) => (
            <FolderItem key={child.folder.id} node={child} depth={depth + 1} />
          ))}
          {node.notes.map((note) => (
            <NoteItem key={note.id} note={note} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function NoteItem({ note, depth }: { note: NoteSummary; depth: number }) {
  const { submit, currentNoteId } = useTree();
  const [renaming, setRenaming] = useState(false);

  return (
    <li>
      <Row
        depth={depth}
        draggable={!renaming}
        onDragStart={(e) => onDragStart(e, { kind: "note", id: note.id })}
        actions={
          <>
            <IconButton title="Rename" onClick={() => setRenaming(true)}>
              <PencilIcon />
            </IconButton>
            <ConfirmButton
              title="Delete note"
              onConfirm={() =>
                submit({ intent: "delete-note", id: note.id, redirectTo: note.id === currentNoteId ? "/" : undefined })
              }
            >
              <TrashIcon />
            </ConfirmButton>
          </>
        }
      >
        <span className="w-[18px] shrink-0" />
        {renaming ? (
          <InlineInput
            initial={note.title}
            onCommit={(title) => {
              setRenaming(false);
              submit({ intent: "rename-note", id: note.id, title });
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <ItemLink to={`/notes/${note.id}`} icon={<NoteIcon />} label={note.title} />
        )}
      </Row>
    </li>
  );
}

function Row({
  depth,
  children,
  actions,
  draggable,
  onDragStart,
  dropOver,
  dropProps,
}: {
  depth: number;
  children: ReactNode;
  actions: ReactNode;
  draggable: boolean;
  onDragStart(e: DragEvent): void;
  dropOver?: boolean;
  dropProps?: ReturnType<typeof useDropTarget>["props"];
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      {...dropProps}
      style={{ paddingLeft: indent(depth) }}
      className={`group flex items-center gap-0.5 rounded pr-1 ${
        dropOver ? "bg-blue-100 ring-1 ring-blue-400 dark:bg-blue-900/50" : ""
      }`}
    >
      {children}
      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">{actions}</div>
    </div>
  );
}

function ExportButton() {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const result = await api.exportVault();
      if (result) {
        const images = result.attachments === 1 ? "1 image" : `${result.attachments} images`;
        notify(`Exported ${result.notes} notes and ${images} to ${result.path}`);
      }
    } catch (e) {
      notify(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      disabled={busy}
      onClick={run}
      className="flex items-center gap-1.5 border-t border-neutral-200 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-800 dark:hover:text-neutral-100"
    >
      <ExportIcon />
      {busy ? "Exporting…" : "Export vault…"}
    </button>
  );
}

function NavItem({ to, end, icon, label }: { to: string; end?: boolean; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-1.5 rounded px-2 py-1 text-sm ${
          isActive ? "bg-neutral-200 font-medium dark:bg-neutral-800" : "hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60"
        }`
      }
    >
      <span className="text-neutral-500">{icon}</span>
      {label}
    </NavLink>
  );
}

function ItemLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      draggable={false}
      className={({ isActive }) =>
        `flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-sm ${
          isActive
            ? "bg-neutral-200 font-medium dark:bg-neutral-800"
            : "hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60"
        }`
      }
    >
      <span className="shrink-0 text-neutral-500">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
    >
      {children}
    </button>
  );
}
