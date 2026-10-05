//! Vault-level key/value settings. Changes are logged like any other entity.

use rusqlite::{Connection, OptionalExtension, params};

use crate::Result;
use crate::changes::{self, Entity, Op};

pub const DAILY_FOLDER: &str = "daily_folder_id";

pub fn get(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).optional()?)
}

pub fn set(conn: &Connection, key: &str, value: &str, now: i64) -> Result<()> {
    let existed = get(conn, key)?.is_some();
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now],
    )?;
    changes::log(conn, Entity::Setting, key, if existed { Op::Update } else { Op::Create }, now)
}
