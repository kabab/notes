// The only module that talks to the backend. Everything else imports `api`.
// A future web build can provide another `Api` implementation (e.g. HTTP).

import { convertFileSrc, invoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Attachment } from "./bindings/Attachment";
import type { Folder } from "./bindings/Folder";
import type { Note } from "./bindings/Note";
import type { ExportSummary } from "./bindings/ExportSummary";
import type { NoteSummary } from "./bindings/NoteSummary";
import type { SearchHit } from "./bindings/SearchHit";
import type { Task } from "./bindings/Task";
import { uuidv7 } from "./lib/id";

export type { Attachment, ExportSummary, Folder, Note, NoteSummary, SearchHit, Task };

export interface Api {
  /** Must resolve before `attachmentUrl` is used (the root loader awaits it). */
  init(): Promise<void>;

  listFolders(): Promise<Folder[]>;
  createFolder(parentId: string | null, name: string): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<Folder>;
  moveFolder(id: string, parentId: string | null): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;

  listNotes(): Promise<NoteSummary[]>;
  getNote(id: string): Promise<Note>;
  createNote(folderId: string | null, title: string): Promise<Note>;
  renameNote(id: string, title: string): Promise<Note>;
  saveNoteBody(id: string, body: string): Promise<Note>;
  moveNote(id: string, folderId: string | null): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  /** The note a `[[target]]` link points to, or null if none matches. */
  resolveLink(target: string): Promise<NoteSummary | null>;

  /** The daily note for `date` (YYYY-MM-DD), if any. */
  getDailyNote(date: string): Promise<Note | null>;
  /** The daily note for `date`, created (with the Daily folder if needed) when missing. */
  ensureDailyNote(date: string): Promise<{ note: Note; created: boolean }>;
  setNoteDate(id: string, date: string | null): Promise<Note>;

  listOpenTasks(): Promise<Task[]>;
  listDoneTasks(limit: number): Promise<Task[]>;
  /** Checks/unchecks a task by editing its note's Markdown. */
  setTaskDone(id: string, done: boolean): Promise<Note>;

  /** URL the webview can load for an attachment (no base64). */
  attachmentUrl(hash: string): string;
  /** Pasted/dropped image: processed (resize, strip EXIF, WebP) and stored. */
  addAttachment(data: Blob, name: string): Promise<Attachment>;
  /** Lets the user pick image files and stores them. Empty if cancelled. */
  pickImages(): Promise<Attachment[]>;

  /** Full-text search over titles and bodies. Snippets mark matches with \u0001…\u0002. */
  search(query: string, limit: number): Promise<SearchHit[]>;
  /** Asks for a destination folder and exports the vault there. Null if cancelled. */
  exportVault(): Promise<ExportSummary | null>;

  /** Runs `fn` (e.g. flush autosave) before the window closes. Returns an unsubscribe function. */
  onBeforeClose(fn: () => Promise<void>): () => void;
}

export type ApiErrorCode = "not_found" | "invalid" | "conflict" | "db" | "io" | "image" | "internal";

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Invokes a Tauri command and turns its `{ code, message }` rejection into an `ApiError`. */
async function call<T>(cmd: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  try {
    return await invoke<T>(cmd, args, options);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && "message" in e) {
      throw new ApiError(e.code as ApiErrorCode, String(e.message));
    }
    throw new ApiError("internal", String(e));
  }
}

let attachmentsDir: string | null = null;

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "tif", "tiff", "bmp"];

const tauriApi: Api = {
  init: async () => {
    attachmentsDir ??= await call<string>("attachments_dir");
  },

  listFolders: () => call("list_folders"),
  createFolder: (parentId, name) => call("create_folder", { id: uuidv7(), parentId, name }),
  renameFolder: (id, name) => call("rename_folder", { id, name }),
  moveFolder: (id, parentId) => call("move_folder", { id, parentId }),
  deleteFolder: (id) => call("delete_folder", { id }),

  listNotes: () => call("list_notes"),
  getNote: (id) => call("get_note", { id }),
  createNote: (folderId, title) => call("create_note", { id: uuidv7(), folderId, title }),
  renameNote: (id, title) => call("rename_note", { id, title }),
  saveNoteBody: (id, body) => call("save_note_body", { id, body }),
  moveNote: (id, folderId) => call("move_note", { id, folderId }),
  deleteNote: (id) => call("delete_note", { id }),
  resolveLink: (target) => call("resolve_link", { target }),

  getDailyNote: (date) => call("get_daily_note", { date }),
  ensureDailyNote: async (date) => {
    const noteId = uuidv7();
    const note = await call<Note>("ensure_daily_note", { date, noteId, folderId: uuidv7() });
    return { note, created: note.id === noteId };
  },
  setNoteDate: (id, date) => call("set_note_date", { id, date }),

  listOpenTasks: () => call("list_open_tasks"),
  listDoneTasks: (limit) => call("list_done_tasks", { limit }),
  setTaskDone: (id, done) => call("set_task_done", { id, done }),

  attachmentUrl: (hash) => {
    if (attachmentsDir === null) throw new Error("api.init() has not completed");
    const sep = attachmentsDir.includes("\\") ? "\\" : "/";
    return convertFileSrc(`${attachmentsDir}${sep}${hash}.webp`);
  },
  addAttachment: async (data, name) =>
    call("add_attachment", new Uint8Array(await data.arrayBuffer()), {
      headers: { "x-filename": encodeURIComponent(name) },
    }),
  pickImages: async () => {
    const picked = await openDialog({ multiple: true, filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }] });
    const added: Attachment[] = [];
    for (const path of picked ?? []) added.push(await call<Attachment>("add_attachment_from_path", { path }));
    return added;
  },

  search: (query, limit) => call("search", { query, limit }),
  exportVault: async () => {
    const parent = await openDialog({ directory: true, title: "Choose where to export your notes" });
    if (typeof parent !== "string") return null;
    return call("export_vault", { parent });
  },

  onBeforeClose: (fn) => {
    beforeClose.add(fn);
    return () => beforeClose.delete(fn);
  },
};

const beforeClose = new Set<() => Promise<void>>();
// Tauri waits for this handler before closing the window.
void getCurrentWindow().onCloseRequested(async () => {
  await Promise.allSettled([...beforeClose].map((fn) => fn()));
});

export const api: Api = tauriApi;
