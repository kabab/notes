-- Full-text index over live notes, kept in sync by triggers.
-- A regular (not external-content) FTS5 table keyed by note_id: notes has no INTEGER
-- PRIMARY KEY, so its implicit rowids may change on VACUUM and can't be relied on.
CREATE VIRTUAL TABLE notes_fts USING fts5(
    note_id UNINDEXED,
    title,
    body,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes WHEN new.deleted_at IS NULL BEGIN
    INSERT INTO notes_fts (note_id, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TRIGGER notes_fts_update AFTER UPDATE OF title, body, deleted_at ON notes BEGIN
    DELETE FROM notes_fts WHERE note_id = old.id;
    INSERT INTO notes_fts (note_id, title, body)
        SELECT new.id, new.title, new.body WHERE new.deleted_at IS NULL;
END;

CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN
    DELETE FROM notes_fts WHERE note_id = old.id;
END;

INSERT INTO notes_fts (note_id, title, body) SELECT id, title, body FROM notes WHERE deleted_at IS NULL;
