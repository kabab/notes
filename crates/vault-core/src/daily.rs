//! Daily notes: one note per calendar date, kept in an auto-created "Daily" folder.

use rusqlite::{Connection, OptionalExtension};

use crate::time::{check_date, now_ms};
use crate::{Error, Note, Result, Vault, folders, ids, notes, settings};

const DAILY_FOLDER_NAME: &str = "Daily";

impl Vault {
    pub fn get_daily_note(&self, date: &str) -> Result<Option<Note>> {
        check_date(date)?;
        find_by_date(&self.conn, date)?.map(|id| notes::get(&self.conn, &id)).transpose()
    }

    /// Returns the note for `date`, creating it if needed. `note_id` and `folder_id` are
    /// client-generated ids used only when the note or the Daily folder must be created.
    pub fn ensure_daily_note(&mut self, date: &str, note_id: &str, folder_id: &str) -> Result<Note> {
        check_date(date)?;
        let tx = self.conn.transaction()?;
        if let Some(id) = find_by_date(&tx, date)? {
            return notes::get(&tx, &id);
        }
        ids::check(note_id)?;
        let now = now_ms();
        let folder = daily_folder(&tx, folder_id, now)?;
        notes::insert(&tx, note_id, Some(&folder), date, Some(date), now)?;
        let note = notes::get(&tx, note_id)?;
        tx.commit()?;
        Ok(note)
    }

    /// Sets or clears the date of any note. A date can belong to only one live note.
    pub fn set_note_date(&mut self, id: &str, date: Option<&str>) -> Result<Note> {
        if let Some(date) = date {
            check_date(date)?;
            if let Some(other) = find_by_date(&self.conn, date)?
                && other != id
            {
                return Err(Error::Conflict(format!("another note is already the daily note for {date}")));
            }
        }
        self.update(id, "date = ?2", date)
    }
}

fn find_by_date(conn: &Connection, date: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row("SELECT id FROM notes WHERE date = ?1 AND deleted_at IS NULL", [date], |r| r.get(0))
        .optional()?)
}

/// The Daily folder's id, creating the folder with `candidate_id` if it doesn't exist
/// (first use, or the previous one was deleted). Tracked by id, so renaming it is fine.
fn daily_folder(conn: &Connection, candidate_id: &str, now: i64) -> Result<String> {
    if let Some(id) = settings::get(conn, settings::DAILY_FOLDER)?
        && folders::require(conn, &id).is_ok()
    {
        return Ok(id);
    }
    ids::check(candidate_id)?;
    folders::insert(conn, candidate_id, None, DAILY_FOLDER_NAME, now)?;
    settings::set(conn, settings::DAILY_FOLDER, candidate_id, now)?;
    Ok(candidate_id.to_string())
}

#[cfg(test)]
mod tests {
    use crate::test_util::id;
    use crate::{Error, Vault, changes};

    #[test]
    fn creates_note_and_folder_once() {
        let mut v = Vault::open_in_memory().unwrap();
        assert!(v.get_daily_note("2026-10-05").unwrap().is_none());

        let (n, f) = (id(), id());
        let note = v.ensure_daily_note("2026-10-05", &n, &f).unwrap();
        assert_eq!(note.id, n);
        assert_eq!(note.title, "2026-10-05");
        assert_eq!(note.date.as_deref(), Some("2026-10-05"));
        assert_eq!(note.folder_id.as_deref(), Some(f.as_str()));
        assert_eq!(v.list_folders().unwrap()[0].name, "Daily");

        // Second call returns the existing note; the new ids are unused.
        let again = v.ensure_daily_note("2026-10-05", &id(), &id()).unwrap();
        assert_eq!(again.id, n);
        assert_eq!(v.list_folders().unwrap().len(), 1);
        assert_eq!(v.get_daily_note("2026-10-05").unwrap().unwrap().id, n);
    }

    #[test]
    fn reuses_renamed_folder_and_recreates_deleted_one() {
        let mut v = Vault::open_in_memory().unwrap();
        let f = id();
        v.ensure_daily_note("2026-10-05", &id(), &f).unwrap();
        v.rename_folder(&f, "Journal").unwrap();

        let next = v.ensure_daily_note("2026-10-06", &id(), &id()).unwrap();
        assert_eq!(next.folder_id.as_deref(), Some(f.as_str()));

        v.delete_folder(&f).unwrap(); // also deletes both daily notes
        let f2 = id();
        let recreated = v.ensure_daily_note("2026-10-05", &id(), &f2).unwrap();
        assert_eq!(recreated.folder_id.as_deref(), Some(f2.as_str()));
    }

    #[test]
    fn deleted_daily_note_is_replaced() {
        let mut v = Vault::open_in_memory().unwrap();
        let n = id();
        v.ensure_daily_note("2026-10-05", &n, &id()).unwrap();
        v.delete_note(&n).unwrap();
        assert!(v.get_daily_note("2026-10-05").unwrap().is_none());
        let n2 = id();
        assert_eq!(v.ensure_daily_note("2026-10-05", &n2, &id()).unwrap().id, n2);
    }

    #[test]
    fn rejects_invalid_dates() {
        let mut v = Vault::open_in_memory().unwrap();
        assert!(matches!(v.get_daily_note("2026-02-30"), Err(Error::Invalid(_))));
        assert!(matches!(v.ensure_daily_note("today", &id(), &id()), Err(Error::Invalid(_))));
    }

    #[test]
    fn set_note_date_enforces_uniqueness() {
        let mut v = Vault::open_in_memory().unwrap();
        let (a, b) = (id(), id());
        v.create_note(&a, None, "A").unwrap();
        v.create_note(&b, None, "B").unwrap();

        assert_eq!(v.set_note_date(&a, Some("2026-01-01")).unwrap().date.as_deref(), Some("2026-01-01"));
        v.set_note_date(&a, Some("2026-01-01")).unwrap(); // same note, same date: fine
        assert!(matches!(v.set_note_date(&b, Some("2026-01-01")), Err(Error::Conflict(_))));
        assert_eq!(v.set_note_date(&a, None).unwrap().date, None);
        v.set_note_date(&b, Some("2026-01-01")).unwrap();
        assert_eq!(v.get_daily_note("2026-01-01").unwrap().unwrap().id, b);
    }

    #[test]
    fn creation_is_logged_atomically() {
        let mut v = Vault::open_in_memory().unwrap();
        v.ensure_daily_note("2026-10-05", &id(), &id()).unwrap();
        let ops: Vec<_> = changes::all(&v.conn).into_iter().map(|(e, _, op)| format!("{e}:{op}")).collect();
        assert_eq!(ops, ["folder:create", "setting:create", "note:create"]);

        // A failed create (bad note id) leaves nothing behind.
        let mut v = Vault::open_in_memory().unwrap();
        assert!(v.ensure_daily_note("2026-10-05", "bad", &id()).is_err());
        assert!(v.list_folders().unwrap().is_empty());
        assert!(changes::all(&v.conn).is_empty());
    }
}
