import { useState } from "react";
import { Link, useParams, useRouteLoaderData } from "react-router";
import { Breadcrumb } from "../components/Breadcrumb";
import { FolderIcon, NoteIcon } from "../components/icons";
import { InlineInput } from "../components/InlineInput";
import type { RootData } from "./root";
import { useTreeAction } from "./tree-action";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function Component() {
  const { folderId } = useParams();
  const { folders, notes } = useRouteLoaderData("root") as RootData;
  const submit = useTreeAction();
  const [creating, setCreating] = useState(false);

  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return <p className="p-8 text-neutral-500">This folder doesn't exist (it may have been deleted).</p>;

  const subfolders = folders.filter((f) => f.parentId === folder.id);
  const folderNotes = notes.filter((n) => n.folderId === folder.id);

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <Breadcrumb folders={folders} folderId={folder.parentId} />
      <div className="mt-1 flex items-center justify-between gap-4">
        <h1 className="truncate text-2xl font-semibold">{folder.name}</h1>
        <div className="flex shrink-0 gap-2">
          <Button onClick={() => setCreating(true)}>New folder</Button>
          <Button primary onClick={() => submit({ intent: "create-note", folderId: folder.id })}>
            New note
          </Button>
        </div>
      </div>

      <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
        {creating && (
          <li className="py-2">
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
        {subfolders.map((f) => (
          <li key={f.id}>
            <Link to={`/folders/${f.id}`} className="flex items-center gap-2 py-2 hover:text-blue-600">
              <FolderIcon className="text-neutral-500" />
              {f.name}
            </Link>
          </li>
        ))}
        {folderNotes.map((n) => (
          <li key={n.id}>
            <Link to={`/notes/${n.id}`} className="flex items-center gap-2 py-2 hover:text-blue-600">
              <NoteIcon className="text-neutral-500" />
              <span className="flex-1 truncate">{n.title}</span>
              <span className="text-xs text-neutral-500">{dateFormat.format(n.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {subfolders.length === 0 && folderNotes.length === 0 && !creating && (
        <p className="mt-6 text-sm text-neutral-500">This folder is empty.</p>
      )}
    </div>
  );
}

function Button({ primary, onClick, children }: { primary?: boolean; onClick(): void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? "rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
          : "rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      }
    >
      {children}
    </button>
  );
}
