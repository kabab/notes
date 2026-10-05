-- Derived index of `- [ ]` tasks, rebuilt per note on every body save. Not synced:
-- each device rebuilds it from note bodies. `id` is `<note_id>:<line_hash>`, stable across edits.
CREATE TABLE tasks (
    id        TEXT PRIMARY KEY NOT NULL,
    note_id   TEXT NOT NULL REFERENCES notes (id),
    line_hash TEXT NOT NULL,
    text      TEXT NOT NULL,
    done      INTEGER NOT NULL,
    done_at   INTEGER,
    position  INTEGER NOT NULL -- 0-based line number in the note
);
CREATE INDEX tasks_note ON tasks (note_id);
CREATE INDEX tasks_done_at ON tasks (done, done_at);
