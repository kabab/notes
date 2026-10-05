//! Schema migrations, tracked with SQLite's `user_version` pragma.
//! Append new entries to `MIGRATIONS`; never edit one that has shipped.

use rusqlite::Connection;

use crate::{Error, Result};

struct Migration {
    sql: &'static str,
    /// Optional Rust step run in the same transaction after the SQL (e.g. backfilling a derived index).
    after: Option<fn(&Connection) -> Result<()>>,
}

const MIGRATIONS: &[Migration] = &[
    Migration { sql: include_str!("sql/0001_init.sql"), after: None },
    Migration { sql: include_str!("sql/0002_settings.sql"), after: None },
    Migration { sql: include_str!("sql/0003_tasks.sql"), after: Some(crate::tasks::reindex_all) },
    Migration { sql: include_str!("sql/0004_attachments.sql"), after: None },
    Migration { sql: include_str!("sql/0005_search.sql"), after: None },
];

pub fn run(conn: &mut Connection) -> Result<()> {
    let current: usize = conn.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))? as usize;
    if current > MIGRATIONS.len() {
        return Err(Error::invalid(format!(
            "database schema v{current} is newer than this app (v{})",
            MIGRATIONS.len()
        )));
    }
    for (i, m) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction()?;
        tx.execute_batch(m.sql)?;
        if let Some(after) = m.after {
            after(&tx)?;
        }
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version(conn: &Connection) -> i64 {
        conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap()
    }

    #[test]
    fn runs_all_and_is_idempotent() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();
        assert_eq!(version(&conn), MIGRATIONS.len() as i64);
        run(&mut conn).unwrap();
        assert_eq!(version(&conn), MIGRATIONS.len() as i64);
    }

    #[test]
    fn refuses_newer_schema() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 999).unwrap();
        assert!(run(&mut conn).is_err());
    }
}
