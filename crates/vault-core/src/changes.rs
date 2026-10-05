//! Append-only change log, written in the same transaction as every mutation.
//! Unused for now; it will feed sync later.

use rusqlite::{Connection, params};

use crate::Result;

#[derive(Clone, Copy)]
pub enum Entity {
    Folder,
    Note,
    Setting,
    Attachment,
}

#[derive(Clone, Copy)]
pub enum Op {
    Create,
    Update,
    Delete,
}

impl Entity {
    fn as_str(self) -> &'static str {
        match self {
            Entity::Folder => "folder",
            Entity::Note => "note",
            Entity::Setting => "setting",
            Entity::Attachment => "attachment",
        }
    }
}

impl Op {
    fn as_str(self) -> &'static str {
        match self {
            Op::Create => "create",
            Op::Update => "update",
            Op::Delete => "delete",
        }
    }
}

pub fn log(conn: &Connection, entity: Entity, id: &str, op: Op, at: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO changes (entity, entity_id, op, at) VALUES (?1, ?2, ?3, ?4)",
        params![entity.as_str(), id, op.as_str(), at],
    )?;
    Ok(())
}

#[cfg(test)]
pub fn all(conn: &Connection) -> Vec<(String, String, String)> {
    let mut stmt = conn.prepare("SELECT entity, entity_id, op FROM changes ORDER BY seq").unwrap();
    stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap()
        .map(|r| r.unwrap())
        .collect()
}
