// Every structural change to the folder/note tree goes through this action, so
// React Router revalidates the sidebar and open note afterwards.

import { useCallback, useEffect } from "react";
import { type ActionFunctionArgs, redirect, useFetcher } from "react-router";
import { api } from "../api";
import { useNotify } from "../components/Toaster";

export type TreeIntent =
  | { intent: "create-folder"; parentId: string | null; name: string }
  | { intent: "rename-folder"; id: string; name: string }
  | { intent: "move-folder"; id: string; parentId: string | null }
  | { intent: "delete-folder"; id: string; redirectTo?: string }
  | { intent: "create-note"; folderId: string | null; title?: string }
  | { intent: "rename-note"; id: string; title: string }
  | { intent: "move-note"; id: string; folderId: string | null }
  | { intent: "delete-note"; id: string; redirectTo?: string }
  | { intent: "set-note-date"; id: string; date: string | null };

export type TreeActionResult = { ok: true } | { error: string };

export async function action({ request }: ActionFunctionArgs) {
  const i = (await request.json()) as TreeIntent;
  try {
    switch (i.intent) {
      case "create-folder":
        await api.createFolder(i.parentId, i.name);
        break;
      case "rename-folder":
        await api.renameFolder(i.id, i.name);
        break;
      case "move-folder":
        await api.moveFolder(i.id, i.parentId);
        break;
      case "delete-folder":
        await api.deleteFolder(i.id);
        if (i.redirectTo) return redirect(i.redirectTo);
        break;
      case "create-note": {
        const note = await api.createNote(i.folderId, i.title ?? "Untitled");
        return redirect(`/notes/${note.id}?new=1`);
      }
      case "rename-note":
        await api.renameNote(i.id, i.title);
        break;
      case "move-note":
        await api.moveNote(i.id, i.folderId);
        break;
      case "delete-note":
        await api.deleteNote(i.id);
        if (i.redirectTo) return redirect(i.redirectTo);
        break;
      case "set-note-date":
        await api.setNoteDate(i.id, i.date);
        break;
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) } satisfies TreeActionResult;
  }
  return { ok: true } satisfies TreeActionResult;
}

/** Returns a function that submits a tree intent; failures show as a toast. */
export function useTreeAction() {
  const fetcher = useFetcher<TreeActionResult>();
  const notify = useNotify();
  const data = fetcher.data;

  useEffect(() => {
    if (data && "error" in data) notify(data.error);
  }, [data, notify]);

  const { submit } = fetcher;
  return useCallback(
    (intent: TreeIntent) => submit(intent, { method: "post", action: "/tree", encType: "application/json" }),
    [submit],
  );
}
