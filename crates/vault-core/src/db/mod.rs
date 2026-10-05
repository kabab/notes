mod migrations;

use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;

use crate::Result;

pub fn open(path: &Path) -> Result<Connection> {
    let mut conn = Connection::open(path)?;
    conn.pragma_update_and_check(None, "journal_mode", "WAL", |r| r.get::<_, String>(0))?;
    configure(&mut conn)?;
    Ok(conn)
}

pub fn open_in_memory() -> Result<Connection> {
    let mut conn = Connection::open_in_memory()?;
    configure(&mut conn)?;
    Ok(conn)
}

#[cfg(test)]
pub fn run_migrations(conn: &mut Connection) -> Result<()> {
    migrations::run(conn)
}

fn configure(conn: &mut Connection) -> Result<()> {
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    migrations::run(conn)
}
