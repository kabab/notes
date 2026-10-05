-- Content-addressed image attachments: the file is attachments/<hash>.webp.
-- Immutable, so no updated_at/deleted_at.
CREATE TABLE attachments (
    hash          TEXT PRIMARY KEY NOT NULL, -- SHA-256 of the WebP bytes, hex
    original_name TEXT,
    mime          TEXT NOT NULL,
    size          INTEGER NOT NULL,
    width         INTEGER NOT NULL,
    height        INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
);
