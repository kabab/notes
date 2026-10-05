-- IDs are client-generated UUIDv7 strings. Timestamps are Unix milliseconds.
-- Rows are never physically deleted: `deleted_at` marks a soft delete.

CREATE TABLE folders (
    id         TEXT PRIMARY KEY NOT NULL,
    parent_id  TEXT REFERENCES folders (id),
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
);
CREATE INDEX folders_parent ON folders (parent_id) WHERE deleted_at IS NULL;

CREATE TABLE notes (
    id         TEXT PRIMARY KEY NOT NULL,
    folder_id  TEXT REFERENCES folders (id),
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    date       TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
);
CREATE INDEX notes_folder ON notes (folder_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX notes_date ON notes (date) WHERE date IS NOT NULL AND deleted_at IS NULL;

-- Append-only log for future sync. `seq` is a local ordering, not a synced id.
CREATE TABLE changes (
    seq       INTEGER PRIMARY KEY AUTOINCREMENT,
    entity    TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    op        TEXT NOT NULL,
    at        INTEGER NOT NULL
);
