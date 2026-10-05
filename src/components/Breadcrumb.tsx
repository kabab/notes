import { Link } from "react-router";
import type { Folder } from "../api";
import { folderPath } from "../lib/tree";

export function Breadcrumb({ folders, folderId }: { folders: Folder[]; folderId: string | null }) {
  const path = folderPath(folders, folderId);
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-neutral-500">
      <span>Notes</span>
      {path.map((f) => (
        <span key={f.id} className="flex items-center gap-1">
          <span>/</span>
          <Link to={`/folders/${f.id}`} className="hover:text-neutral-900 hover:underline dark:hover:text-neutral-100">
            {f.name}
          </Link>
        </span>
      ))}
    </nav>
  );
}
