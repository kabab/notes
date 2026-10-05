use rusqlite::{Connection, OptionalExtension, Row, params};

use crate::changes::{self, Entity, Op};
use crate::ids::{self, clean_name};
use crate::time::now_ms;
use crate::{Error, Note, NoteSummary, Result, Vault, folders, tasks};

const COLUMNS: &str = "id, folder_id, title, body, date, created_at, updated_at";
const SUMMARY_COLUMNS: &str = "id, folder_id, title, date, updated_at";

fn from_row(r: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: r.get(0)?,
        folder_id: r.get(1)?,
        title: r.get(2)?,
        body: r.get(3)?,
        date: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

fn summary_from_row(r: &Row) -> rusqlite::Result<NoteSummary> {
    Ok(NoteSummary {
        id: r.get(0)?,
        folder_id: r.get(1)?,
        title: r.get(2)?,
        date: r.get(3)?,
        updated_at: r.get(4)?,
    })
}

impl Vault {
    /// All live notes without bodies, sorted by title.
    pub fn list_notes(&self) -> Result<Vec<NoteSummary>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {SUMMARY_COLUMNS} FROM notes WHERE deleted_at IS NULL ORDER BY title COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map([], summary_from_row)?.collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    pub fn get_note(&self, id: &str) -> Result<Note> {
        get(&self.conn, id)
    }

    pub fn create_note(&mut self, id: &str, folder_id: Option<&str>, title: &str) -> Result<Note> {
        ids::check(id)?;
        let title = clean_name(title)?;
        let tx = self.conn.transaction()?;
        insert(&tx, id, folder_id, &title, None, now_ms())?;
        let note = get(&tx, id)?;
        tx.commit()?;
        Ok(note)
    }

    pub fn rename_note(&mut self, id: &str, title: &str) -> Result<Note> {
        let title = clean_name(title)?;
        self.update(id, "title = ?2", &title)
    }

    /// Saves the note body (autosave) and re-indexes its tasks in the same transaction.
    /// A no-op if the body is unchanged.
    pub fn save_note_body(&mut self, id: &str, body: &str) -> Result<Note> {
        let tx = self.conn.transaction()?;
        let current = get(&tx, id)?;
        if current.body == body {
            return Ok(current);
        }
        let now = now_ms();
        tx.execute("UPDATE notes SET body = ?2, updated_at = ?3 WHERE id = ?1", params![id, body, now])?;
        changes::log(&tx, Entity::Note, id, Op::Update, now)?;
        tasks::reindex_note(&tx, id, body, now)?;
        let note = get(&tx, id)?;
        tx.commit()?;
        Ok(note)
    }

    /// Moves a note into `folder_id`, or to the root when `None`.
    pub fn move_note(&mut self, id: &str, folder_id: Option<&str>) -> Result<Note> {
        if let Some(folder) = folder_id {
            folders::require(&self.conn, folder)?;
        }
        self.update(id, "folder_id = ?2", folder_id)
    }

    pub fn delete_note(&mut self, id: &str) -> Result<()> {
        let tx = self.conn.transaction()?;
        get(&tx, id)?;
        soft_delete(&tx, id, now_ms())?;
        tx.commit()?;
        Ok(())
    }

    /// Sets one column (`set` uses `?2` for the value), bumps `updated_at`, logs the change.
    pub(crate) fn update(&mut self, id: &str, set: &str, value: impl rusqlite::ToSql) -> Result<Note> {
        let tx = self.conn.transaction()?;
        let now = now_ms();
        let n = tx.execute(
            &format!("UPDATE notes SET {set}, updated_at = ?3 WHERE id = ?1 AND deleted_at IS NULL"),
            params![id, value, now],
        )?;
        if n == 0 {
            return Err(Error::NotFound("note"));
        }
        changes::log(&tx, Entity::Note, id, Op::Update, now)?;
        let note = get(&tx, id)?;
        tx.commit()?;
        Ok(note)
    }
}

/// Inserts an empty note (id and title already validated) and logs it. Callers own the transaction.
pub(crate) fn insert(
    conn: &Connection,
    id: &str,
    folder_id: Option<&str>,
    title: &str,
    date: Option<&str>,
    now: i64,
) -> Result<()> {
    if conn.query_row("SELECT 1 FROM notes WHERE id = ?1", [id], |_| Ok(())).optional()?.is_some() {
        return Err(Error::Conflict(format!("note {id} already exists")));
    }
    if let Some(folder) = folder_id {
        folders::require(conn, folder)?;
    }
    conn.execute(
        "INSERT INTO notes (id, folder_id, title, date, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, folder_id, title, date, now],
    )?;
    changes::log(conn, Entity::Note, id, Op::Create, now)
}

pub(crate) fn get(conn: &Connection, id: &str) -> Result<Note> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM notes WHERE id = ?1 AND deleted_at IS NULL"),
        [id],
        from_row,
    )
    .optional()?
    .ok_or(Error::NotFound("note"))
}

/// Marks a note deleted and logs it. Callers own the transaction.
pub(crate) fn soft_delete(conn: &Connection, id: &str, now: i64) -> Result<()> {
    conn.execute("UPDATE notes SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1", params![id, now])?;
    tasks::remove_note(conn, id)?;
    changes::log(conn, Entity::Note, id, Op::Delete, now)
}

#[cfg(test)]
mod tests {
    use crate::test_util::id;
    use crate::{Error, Vault, changes};

    fn vault() -> Vault {
        Vault::open_in_memory().unwrap()
    }

    #[test]
    fn create_get_rename_save() {
        let mut v = vault();
        let n = id();
        let created = v.create_note(&n, None, "First").unwrap();
        assert_eq!(created.body, "");
        assert_eq!(created.folder_id, None);

        v.rename_note(&n, "Renamed").unwrap();
        let saved = v.save_note_body(&n, "# Hello\n").unwrap();
        assert_eq!(saved.title, "Renamed");
        assert_eq!(v.get_note(&n).unwrap().body, "# Hello\n");
    }

    #[test]
    fn unchanged_body_is_not_logged() {
        let mut v = vault();
        let n = id();
        v.create_note(&n, None, "N").unwrap();
        v.save_note_body(&n, "x").unwrap();
        v.save_note_body(&n, "x").unwrap();
        assert_eq!(changes::all(&v.conn).len(), 2);
    }

    #[test]
    fn move_between_folders() {
        let mut v = vault();
        let (f, n) = (id(), id());
        v.create_folder(&f, None, "F").unwrap();
        v.create_note(&n, None, "N").unwrap();

        assert_eq!(v.move_note(&n, Some(&f)).unwrap().folder_id.as_deref(), Some(f.as_str()));
        assert_eq!(v.move_note(&n, None).unwrap().folder_id, None);
        assert!(matches!(v.move_note(&n, Some(&id())), Err(Error::NotFound(_))));
    }

    #[test]
    fn create_rejects_bad_input() {
        let mut v = vault();
        assert!(matches!(v.create_note("nope", None, "N"), Err(Error::Invalid(_))));
        assert!(matches!(v.create_note(&id(), None, "  "), Err(Error::Invalid(_))));
        assert!(matches!(v.create_note(&id(), Some(&id()), "N"), Err(Error::NotFound(_))));
        let n = id();
        v.create_note(&n, None, "N").unwrap();
        assert!(matches!(v.create_note(&n, None, "N"), Err(Error::Conflict(_))));
    }

    #[test]
    fn soft_delete_hides_note_and_blocks_updates() {
        let mut v = vault();
        let n = id();
        v.create_note(&n, None, "N").unwrap();
        v.delete_note(&n).unwrap();

        assert!(v.list_notes().unwrap().is_empty());
        assert!(matches!(v.get_note(&n), Err(Error::NotFound(_))));
        assert!(matches!(v.rename_note(&n, "x"), Err(Error::NotFound(_))));
        assert!(matches!(v.delete_note(&n), Err(Error::NotFound(_))));
        // The id stays reserved even though the row is deleted.
        assert!(matches!(v.create_note(&n, None, "N"), Err(Error::Conflict(_))));
    }

    #[test]
    fn deleting_a_folder_soft_deletes_moved_in_notes() {
        let mut v = vault();
        let (f, n) = (id(), id());
        v.create_folder(&f, None, "F").unwrap();
        v.create_note(&n, None, "N").unwrap();
        v.move_note(&n, Some(&f)).unwrap();
        v.delete_folder(&f).unwrap();
        assert!(v.list_notes().unwrap().is_empty());
    }

    #[test]
    fn persists_across_reopen() {
        let dir = std::env::temp_dir().join(format!("vault-core-test-{}", id()));
        let n = id();
        {
            let mut v = Vault::open(&dir).unwrap();
            v.create_note(&n, None, "Persisted").unwrap();
        }
        let v = Vault::open(&dir).unwrap();
        assert_eq!(v.get_note(&n).unwrap().title, "Persisted");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
