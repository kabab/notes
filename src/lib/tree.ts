import type { Folder } from "../bindings/Folder";
import type { NoteSummary } from "../bindings/NoteSummary";

export interface FolderNode {
  folder: Folder;
  children: FolderNode[];
  notes: NoteSummary[];
}

export interface Tree {
  /** Top-level folders. */
  folders: FolderNode[];
  /** Notes not in any folder. */
  notes: NoteSummary[];
}

/**
 * Builds the sidebar tree from flat lists (already sorted by name/title).
 * Items whose parent is missing are shown at the root rather than dropped.
 */
export function buildTree(folders: Folder[], notes: NoteSummary[]): Tree {
  const nodes = new Map<string, FolderNode>();
  for (const folder of folders) nodes.set(folder.id, { folder, children: [], notes: [] });

  const tree: Tree = { folders: [], notes: [] };
  for (const node of nodes.values()) {
    const parent = node.folder.parentId ? nodes.get(node.folder.parentId) : undefined;
    (parent ? parent.children : tree.folders).push(node);
  }
  for (const note of notes) {
    const parent = note.folderId ? nodes.get(note.folderId) : undefined;
    (parent ? parent.notes : tree.notes).push(note);
  }
  return tree;
}

/** Ids of `folderId` and all its ancestors, root first. */
export function folderPath(folders: Folder[], folderId: string | null): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  const seen = new Set<string>();
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** True if `folderId` is `ancestorId` or nested anywhere below it. */
export function isWithin(folders: Folder[], folderId: string | null, ancestorId: string): boolean {
  return folderPath(folders, folderId).some((f) => f.id === ancestorId);
}
