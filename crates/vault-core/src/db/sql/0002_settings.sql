-- Small key/value store for vault-level settings (e.g. which folder holds daily notes).
CREATE TABLE settings (
    key        TEXT PRIMARY KEY NOT NULL,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
