# Architecture

A personal notes and to-do app, similar to Obsidian. **Phase 1** (this codebase) is macOS-only, stores everything locally, and has no sync. Later phases add Windows, Linux, Android, a web build and a self-hosted sync server. Phase 1 was built so those can be added without rewrites.

This document explains how the pieces fit together, the rules the code relies on, and what each future phase still has to do. `README.md` has the commands for running and testing.

---

## 1. Layers

```
┌──────────────────────────────────────────────────────────────┐
│ React app (src/)                                             │
│   routes/  components/  editor/ (CodeMirror)  lib/ (pure)    │
│                       │                                      │
│                 src/api.ts  ◄── the ONLY backend boundary    │
└───────────────────────┼──────────────────────────────────────┘
                        │ Tauri IPC (invoke, JSON or raw bytes)
┌───────────────────────▼──────────────────────────────────────┐
│ src-tauri/   thin shell: commands, app state, plugins        │
│              no business logic                               │
└───────────────────────┼──────────────────────────────────────┘
                        │ plain Rust calls on `Vault`
┌───────────────────────▼──────────────────────────────────────┐
│ crates/vault-core/   ALL business logic + storage            │
│   SQLite (rusqlite), task parser, images, search, export     │
│   no Tauri dependency → reusable on Android and on a server  │
└──────────────────────────────────────────────────────────────┘
```

Three rules hold the design together:

1. **Business logic lives only in `vault-core`.** If something could be useful on Android or on a sync server, it belongs there. The Tauri layer only unpacks arguments, calls `Vault`, and maps errors.
2. **The frontend reaches the backend only through `src/api.ts`.** Nothing else imports `@tauri-apps/*`. A web build replaces this one module.
3. **The frontend contains no SQL.** All queries live in `vault-core`.

---

## 2. Repository map

```
Cargo.toml                 workspace (vault-core + src-tauri); deps optimized in dev
.cargo/config.toml         TS_RS_EXPORT_DIR → src/bindings
crates/vault-core/src/
  lib.rs                   Vault struct: open(dir) / open_in_memory()
  error.rs                 Error enum + stable string codes
  model.rs                 Folder, Note, NoteSummary, Task, Attachment, SearchHit
  ids.rs  time.rs          UUIDv7 / name validation, now_ms, YYYY-MM-DD validation
  changes.rs               append-only change log (future sync)
  settings.rs              key/value settings (e.g. daily folder id)
  folders.rs  notes.rs     CRUD, moves, cascading soft delete, save pipeline
  daily.rs                 daily notes + "Daily" folder
  links.rs                 [[link]] target resolution
  tasks/parser.rs          pure Markdown task parser (pulldown-cmark)
  tasks/mod.rs             tasks index, queries, set_task_done
  attachments/image.rs     pure image pipeline (decode → orient → resize → WebP)
  attachments/mod.rs       content-addressed storage + table
  search.rs                FTS5 query building + search
  export.rs                vault → .md files + attachments
  db/mod.rs                connection + pragmas
  db/migrations.rs         versioned migrations (user_version)
  db/sql/000N_*.sql        schema, one file per migration
src-tauri/
  src/lib.rs               builder, plugins, managed state, command registry
  src/commands/*.rs        one file per area; each command is a few lines
  src/error.rs             CmdError { code, message }
  tauri.conf.json          window, CSP, asset protocol scope
  capabilities/default.json
src/
  api.ts                   Api interface + Tauri implementation
  bindings/                GENERATED TS types (commit them; regenerate with `pnpm bindings`)
  router.tsx               route table
  routes/                  route modules (loader / action / Component)
  components/              Sidebar, NoteEditor, Calendar, QuickSwitcher, …
  editor/                  CodeMirror setup and extensions
  lib/                     pure helpers with Vitest tests
```

---

## 3. vault-core

### The `Vault` facade

`Vault` owns one `rusqlite::Connection` plus the data directory. Each feature module adds methods to it with `impl Vault { … }`. Callers only ever see `Vault`, its methods and the `model` types.

```rust
let mut v = Vault::open(data_dir)?;      // creates dir, opens vault.db, runs migrations
v.create_note(&id, None, "Title")?;
v.save_note_body(&id, "- [ ] task")?;
```

`Vault::open_in_memory()` is for tests. It has no data directory, so attachments and export return `Error::Invalid`.

### Rules every write follows

These hold for every mutation in the codebase. New code must keep them.

| Rule | Where |
|---|---|
| One write is one SQLite transaction | each `Vault` method opens `self.conn.transaction()` |
| Every change to a syncable row calls `changes::log(tx, entity, id, op, now)` in **that same transaction** | `folders.rs`, `notes.rs`, `settings.rs`, `attachments/mod.rs` |
| Rows are never physically deleted: set `deleted_at`, and also bump `updated_at` | `notes::soft_delete`, `delete_folder` |
| Reads return only live rows (`deleted_at IS NULL`) | every query |
| IDs come from the client, are validated by `ids::check`, and are never reused (a soft-deleted id is still taken) | `create_*`, `insert` helpers |
| Shared insert logic is a `pub(crate) fn insert(conn, …)` that takes a `&Connection`, so other modules can call it inside their own transaction | `folders::insert`, `notes::insert` (used by `daily.rs`) |
| A failed operation leaves nothing behind: return early before `commit()` and the transaction rolls back when dropped | everywhere |

### Errors

`Error` has the variants `NotFound`, `Invalid`, `Conflict`, `Db`, `Io` and `Image`. Each has a stable `code()`: `not_found`, `invalid`, `conflict`, `db`, `io`, `image`. The Tauri layer sends `{ code, message }`, and `api.ts` turns that into `ApiError`. The UI checks `code`, never the message text.

### Pure modules

`tasks/parser.rs`, `attachments/image.rs`, `search::fts_query`, `export::sanitize` / `rewrite_attachment_links`, and `links::normalize_title` never touch the database. Most edge-case tests target these.

---

## 4. Data model

All timestamps are **Unix milliseconds (UTC)** stored as `INTEGER`. Daily-note dates are a local calendar date stored as `TEXT 'YYYY-MM-DD'`, with no time zone.

### Synced data (the source of truth)

| Table | Columns | Notes |
|---|---|---|
| `folders` | `id, parent_id, name, created_at, updated_at, deleted_at` | `parent_id NULL` = root. A move cannot create a cycle (checked with a recursive CTE). |
| `notes` | `id, folder_id, title, body, date, created_at, updated_at, deleted_at` | `folder_id NULL` = root. `date` has a partial unique index (at most one live note per date). |
| `settings` | `key, value, updated_at` | Currently only `daily_folder_id`. |
| `attachments` | `hash, original_name, mime, size, width, height, created_at` | Content-addressed and immutable, so no `updated_at` / `deleted_at`. The file is `attachments/<hash>.webp`. |
| `changes` | `seq, entity, entity_id, op, at` | Append-only. `seq` is a local order, **not** a synced id. `entity` is one of `folder`, `note`, `setting`, `attachment`; `op` is one of `create`, `update`, `delete`. |

IDs are **UUIDv7**, generated by the client (`src/lib/id.ts`, which stays monotonic within a millisecond). The core accepts only the lowercase, hyphenated form. Anything that will sync never uses autoincrement IDs.

### Derived data (rebuilt locally, never synced)

| Table | Built from | Kept in sync by |
|---|---|---|
| `tasks (id, note_id, line_hash, text, done, done_at, position)` | note bodies | `tasks::reindex_note`, called inside `save_note_body`'s transaction. Rows are removed in `notes::soft_delete`. |
| `notes_fts` (FTS5: `note_id UNINDEXED, title, body`) | notes | SQL triggers on insert, on update of title, body or deleted_at, and on delete (migration 0005) |

`notes_fts` is a regular FTS5 table, **not** an external-content one. `notes` has no `INTEGER PRIMARY KEY`, so `VACUUM` may renumber its implicit rowids, and an external-content index would silently break.

### Migrations

`db/migrations.rs` keeps an ordered list of `Migration { sql, after }`. The current version is stored in `PRAGMA user_version`. Each migration runs in its own transaction. `after` is an optional Rust step that runs inside that transaction, for example the tasks backfill in 0003.

To add one:
1. Create `db/sql/000N_name.sql`.
2. Append a `Migration { … }` entry.
3. **Never edit a migration that has already run** on a real database.

Opening a database whose schema is newer than the app fails with `Invalid`. Current version: **5**.

---

## 5. How the main features work

### Saving a note body (autosave)
1. In `NoteEditor`, every editor change calls `save(doc)`, which is debounced by 500 ms.
2. Pending saves are written immediately on unmount (navigation), on window blur, and before the window closes (`api.onBeforeClose`, which Tauri waits for).
3. `api.saveNoteBody` calls `Vault::save_note_body`, which runs in one transaction:
   1. Load the note. If the body is unchanged, stop here; nothing is logged.
   2. `UPDATE notes` sets the body and `updated_at`. The FTS trigger re-indexes the note.
   3. `changes::log(note, update)`.
   4. `tasks::reindex_note` rebuilds the task rows and keeps or sets `done_at`.
4. Saves still in flight are kept in a map in `NoteEditor.tsx`. Note loaders call `waitForPendingSaves()` first, so reopening a note never shows an older body.

Autosave deliberately does **not** go through a router action. Actions revalidate every loader, and doing that on each keystroke would be wasteful. Structural changes (create, rename, move, delete, set date) go through the `/tree` action, so the sidebar refreshes.

### Tasks
- **Parsing** (`tasks/parser.rs`) uses pulldown-cmark's task-list support, so code blocks, inline code, nested lists and blockquotes behave exactly as a Markdown renderer would.
- **Identity:** `line_hash` = FNV-1a of (task text with spaces normalized, then the occurrence index among tasks with the same text). The checkbox state and line number are not part of it. The task id is `<note_id>:<line_hash>`, which stays the same while the text is unchanged.
- **`done_at`:**
  - newly checked: set to now
  - already checked under the same hash: keep the previous value
  - unchecked: cleared
- **Toggling from the views:** `set_task_done(id, done)` → `parser::set_done` rewrites the one character inside the brackets → `save_note_body`, the normal save pipeline.
- **Toggling in the editor:** the checkbox widget edits the document, and autosave does the rest.

### Daily notes
`ensure_daily_note(date, note_id, folder_id)` is idempotent:
- It returns the existing note for `date`, or creates one titled with the date.
- New daily notes go in the folder named by `settings.daily_folder_id`. If that folder doesn't exist (first use, or it was deleted), it creates a folder named "Daily" with the id the client supplied.
- The folder is tracked by id, so renaming it is fine.

The frontend computes "today" in local time (`lib/date.ts`):
- `/` redirects to `/daily/<today>`.
- Opening today creates the note.
- Other dates show a "Create note" button instead, so browsing days doesn't create empty notes.

### `[[links]]`
- A Lezer Markdown extension (`editor/markdown.ts`) adds a `WikiLink` syntax node, so links inside code are never detected.
- It supports `[[Target]]`, `[[Target|alias]]` and `[[Target#heading]]`; the heading part is ignored.
- Clicking a link calls `api.resolveLink`, which uses `Vault::resolve_link`:
  - case-insensitive and Unicode-aware, with whitespace normalized
  - if several notes share the title, the most recently updated one wins
  - no match shows a toast

### Images
1. **Input:** paste or drop (HTML5 `File`), or the file picker (dialog plugin, path).
2. **Sending to Rust:**
   - Pasted or dropped bytes go as raw binary IPC (`InvokeBody::Raw`), with the file name in the `x-filename` header.
   - Picked files are read from their path in Rust.
3. **Processing:** `attachments::process_image` decodes, applies EXIF orientation, fits the image within 2560 px, and encodes WebP at quality 82. Re-encoding drops all metadata. This step runs **without** the vault lock.
4. **Storage:** `store_attachment`:
   - computes the SHA-256 of the WebP bytes
   - writes `attachments/<hash>.webp` via a temp file and rename
   - inserts the row (or reuses an existing one)
   - logs the change
5. **In the note:** `![](att:<hash>)`. `editor/images.ts` renders it as a block widget below the line, using a StateField, because block widgets can't come from a ViewPlugin. The raw Markdown is hidden unless the cursor is on that line.
6. **Display:** the URL comes from `api.attachmentUrl(hash)`, which uses `convertFileSrc` (asset protocol) on the attachments directory loaded by `api.init()`.

### Search
`search::fts_query` quotes every word and adds prefix matching (`"word"*`), so FTS operators are always treated as text. Results are ranked with `bm25(notes_fts, 0, 10, 1)`, where title matches weigh 10× body matches. Snippets mark matches with `\u0001` and `\u0002`, and `lib/snippet.ts` splits them for highlighting, so note text is never treated as HTML.

### Export
`Vault::export(parent)` creates a new `Notes export` folder (`… 2`, `… 3` if one exists) and writes:
- the folder tree, with names made safe for every OS
- one `.md` per live note; name clashes get ` (2)` suffixes, compared case-insensitively
- a copy of `attachments/`

Image links `att:<hash>` are rewritten to relative paths (`../attachments/<hash>.webp`), using the parser, so links inside code are left alone.

---

## 6. The Tauri layer

- **State:** `AppState(Mutex<Vault>)`. Single user, so one connection behind a mutex is enough. SQLite runs in WAL mode.
- **Commands** are `#[tauri::command(async)]`, so they run off the main thread. Each one is a single `with_vault(state, |v| v.method(...))` call. Long CPU work (image processing) runs before taking the lock.
- **Plugins:** `tauri-plugin-dialog` (image picker, export folder).
- **Capabilities:** `core:default`, `core:window:allow-destroy` (needed for close-after-flush), `dialog:allow-open`.
- **Security config:**
  - CSP: `default-src 'self'`, inline styles allowed (CodeMirror injects them), images from `asset:` / `http://asset.localhost`.
  - The asset protocol is scoped to `$APPDATA/attachments/**`.
- **`dragDropEnabled: false`:** the app uses HTML5 drag and drop everywhere (moving items in the sidebar, dropping images as `File` objects). This behaves the same on every platform and in a browser.
- **Data directory:** `~/Library/Application Support/com.gatopi.notes/` contains `vault.db` and `attachments/`.
- **Routing:** `createBrowserRouter` works in production because Tauri falls back to `index.html` for unknown paths.

### Adding a feature end to end
1. **Core:** a method on `Vault` in the right module, following the rules in §3, with unit tests. Put any new model type in `model.rs` with the `ts` derive.
2. **Tauri:** a command in `src-tauri/src/commands/<area>.rs`, registered in `generate_handler!` in `src-tauri/src/lib.rs`.
3. **Types:** run `pnpm bindings` and commit the changes in `src/bindings/`.
4. **Frontend:** add the method to the `Api` interface and to `tauriApi` in `src/api.ts`.
5. **UI:** call it from a loader or action, or directly for high-frequency writes like autosave.

---

## 7. Frontend

### `src/api.ts`
- It defines `interface Api` and exports one implementation (`tauriApi`).
- It is the only place that knows about `invoke`, `convertFileSrc`, the dialog plugin and window events.
- It generates UUIDv7s for created entities.
- `api.init()` (awaited by the root loader) loads platform configuration, currently just the attachments directory.

### Routes (React Router v7, data mode, SPA)

| Path | Module | Loader / action |
|---|---|---|
| `/` | `router.tsx` | redirects to `/daily/<today>` |
| `/notes/:noteId` | `routes/note.tsx` | `getNote` (after `waitForPendingSaves`). `?line=N` puts the cursor on line N; `?new=1` selects the title. |
| `/daily/:date` | `routes/daily.tsx` | today → `ensureDailyNote`; other dates → `getDailyNote`. The action creates the note on demand. |
| `/folders/:folderId` | `routes/folder.tsx` | uses the root loader data |
| `/tasks`, `/tasks/done` | `routes/tasks.tsx` | `listOpenTasks`, `listDoneTasks(limit)` (`?limit=` for "Show more") |
| `/search?q=` | `routes/search.tsx` | `search(q, 100)` |
| `/tree` (resource) | `routes/tree-action.ts` | all structural changes, as JSON `TreeIntent`s. Errors return `{ error }`, which shows a toast. |
| `/task` (resource) | `routes/tasks.tsx` | `setTaskDone` |

- The root loader provides `{ folders, notes }` (summaries without bodies) to the sidebar tree, calendar, breadcrumbs, link autocomplete and the quick switcher.
- The quick switcher (⌘K) is mounted in the root layout and listens on `window` in the capture phase, so it opens even from inside the editor.

### Editor (`src/editor/`)
- `Editor.tsx` is a thin React wrapper. It creates the `EditorView` once per mount; the parent keys it by note id. It reads callbacks through a ref, so the extensions never need rebuilding.
- `markdown.ts`: GFM plus the `WikiLink` syntax extension. The same grammar is used in tests.
- `wikilinks.ts`: link decorations, click handling, and `[[` autocomplete.
- `checkboxes.ts`: `TaskMarker` nodes rendered as checkbox widgets, with a strike-through style for checked lines.
- `images.ts`: `att:` image blocks, placeholders while uploading (their positions are mapped through later edits), and paste/drop handling.
- `theme.ts` and `styles.css`: the highlight style assigns class names only. Colors and dark mode are in CSS.

---

## 8. Generated types

The model structs in `vault-core` use `#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]`.

- `pnpm bindings` runs the ts-rs export tests with the `ts` feature and writes `src/bindings/*.ts`.
- `i64` timestamps are typed as `number` with `#[ts(type = "number")]`, because millisecond timestamps fit safely in a JavaScript number.
- The feature is off by default, so Android and server builds don't compile ts-rs.

---

## 9. Testing

| Suite | Command | Covers |
|---|---|---|
| Rust (65 tests) | `cargo test` | migrations and backfills, CRUD, cascades, cycle checks, change log, daily notes, task parser edge cases, `done_at`, link resolution, image pipeline (resize, EXIF orientation, metadata removal, alpha), storing each image once, FTS query safety and ranking, export layout and link rewriting |
| Vitest (36 tests) | `pnpm test` | uuidv7, debounce, tree building, date math, wiki-link and task grammar (including code-block exclusion), image Markdown helpers, task grouping, snippet splitting |
| Types | `pnpm typecheck` | strict TS, `noUncheckedIndexedAccess` |

Database tests use `Vault::open_in_memory()`. Tests that need files (attachments, export, reopening) use a uniquely named temporary directory and delete it afterwards. UI components have no automated tests.

---

## 10. Future phases

### Windows and Linux desktop
Most of the code is already portable: HTML5 drag and drop, `/` vs `\` handling in `attachmentUrl`, safe export names, and `Ctrl+K` alongside `⌘K`. Still to do:
- review keyboard shortcuts and the macOS-only `-apple-system` font stack
- test the asset protocol URL form (`http://asset.localhost` on Windows)
- build the installers

### Android (Tauri mobile)
- The crate types `staticlib`/`cdylib` and `#[cfg_attr(mobile, tauri::mobile_entry_point)]` are already in place.
- `vault-core` has no desktop-only dependencies. `webp` builds libwebp with `cc` and needs the Android NDK toolchain.
- **To do:** a responsive or collapsible sidebar, touch targets, the mobile dialog plugin, and replacing `onCloseRequested` flushing with app lifecycle events (pause/background).

### Web build
Write a second `Api` implementation (for example over HTTP to the sync server, or SQLite compiled to WASM) and choose it in `api.ts`. Platform-specific parts to replace:
- `attachmentUrl`: an HTTP URL to the server
- `pickImages`: `<input type=file>` → `addAttachment`
- `exportVault`: a server-side zip
- `onBeforeClose`: `visibilitychange` / `pagehide`

### Sync server
What phase 1 already provides:
- client-generated UUIDv7 ids
- `updated_at` and `deleted_at` on every syncable row
- the `changes` log written in the same transaction as each change
- `vault-core` reusable on the server

Open questions for that phase:
- **Change payloads:** `changes` records *that* a row changed, not *what* changed. Push the current row read by id, or add a payload column.
- **Merge strategy:** last-writer-wins on `updated_at` per row, or per field. Note bodies may need a text merge or a conflict copy.
- **Unique constraints that sync can break:**
  - at most one live note per `date` (two devices can create the same day's note offline)
  - `settings.daily_folder_id` (two devices can each create a "Daily" folder)
  - Decide how to merge these.
- **Foreign keys:** rows can arrive out of order (a note before its folder). Apply each batch inside one transaction with `PRAGMA defer_foreign_keys = ON`.
- **Derived tables:** `tasks` and `notes_fts` are rebuilt on each device. So `done_at` is the time *this* device first saw the box checked. If that matters across devices, move it into a synced table keyed by task id.
- **Attachments:** upload them by hash; they are immutable and deduplicated, which is a good fit. No garbage collection exists yet for unreferenced files.
- **Auth:** none exists, by design.

---

## 11. Known limitations

- Renaming a note doesn't update `[[links]]` that point to it, and there is no backlinks index.
- Duplicate tasks with identical text: deleting the first one passes its identity, including `done_at`, to the next.
- Animated GIFs keep only the first frame. HEIC is not supported by the decoder.
- Unused attachments are never deleted.
- Export writes note bodies only; daily-note dates are not written into the files.
- In-app trash or restore UI does not exist yet, though soft-deleted rows are kept in the database.
- `resolve_link` scans all note titles, which is fine for a personal vault. Add a normalized-title column with an index if that ever becomes slow.
