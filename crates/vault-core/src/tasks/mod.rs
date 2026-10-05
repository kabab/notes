//! The task index: a derived table of every `- [ ]` item, kept in sync with note bodies.

pub mod parser;

use std::collections::HashMap;

use rusqlite::{Connection, Row, params};

use crate::{Error, Note, Result, Task, Vault};

/// Rebuilds the index rows of one note from its body. `done_at` is kept for tasks that
/// were already done (matched by hash), and set to `now` for newly checked ones.
pub(crate) fn reindex_note(conn: &Connection, note_id: &str, body: &str, now: i64) -> Result<()> {
    let previous: HashMap<String, (bool, Option<i64>)> = {
        let mut stmt = conn.prepare("SELECT line_hash, done, done_at FROM tasks WHERE note_id = ?1")?;
        stmt.query_map([note_id], |r| Ok((r.get(0)?, (r.get(1)?, r.get(2)?))))?
            .collect::<rusqlite::Result<_>>()?
    };
    remove_note(conn, note_id)?;

    let mut insert = conn.prepare(
        "INSERT INTO tasks (id, note_id, line_hash, text, done, done_at, position)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )?;
    for task in parser::parse(body) {
        let done_at = match (task.done, previous.get(&task.hash)) {
            (false, _) => None,
            (true, Some((true, Some(at)))) => Some(*at),
            (true, _) => Some(now),
        };
        insert.execute(params![
            format!("{note_id}:{}", task.hash),
            note_id,
            task.hash,
            task.text,
            task.done,
            done_at,
            task.line as i64,
        ])?;
    }
    Ok(())
}

pub(crate) fn remove_note(conn: &Connection, note_id: &str) -> Result<()> {
    conn.execute("DELETE FROM tasks WHERE note_id = ?1", [note_id])?;
    Ok(())
}

/// Rebuilds the whole index (used when the tasks table is created). Tasks already checked
/// get the note's last update time as their best-guess completion time.
pub(crate) fn reindex_all(conn: &Connection) -> Result<()> {
    let notes: Vec<(String, String, i64)> = {
        let mut stmt = conn.prepare("SELECT id, body, updated_at FROM notes WHERE deleted_at IS NULL")?;
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<rusqlite::Result<_>>()?
    };
    for (id, body, updated_at) in notes {
        reindex_note(conn, &id, &body, updated_at)?;
    }
    Ok(())
}

const SELECT: &str = "SELECT t.id, t.note_id, n.title, t.text, t.done, t.done_at, t.position
                      FROM tasks t JOIN notes n ON n.id = t.note_id
                      WHERE n.deleted_at IS NULL";

fn from_row(r: &Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: r.get(0)?,
        note_id: r.get(1)?,
        note_title: r.get(2)?,
        text: r.get(3)?,
        done: r.get(4)?,
        done_at: r.get(5)?,
        line: r.get(6)?,
    })
}

impl Vault {
    /// Open tasks, grouped by note (most recently edited note first), in document order.
    pub fn list_open_tasks(&self) -> Result<Vec<Task>> {
        let mut stmt = self.conn.prepare(&format!(
            "{SELECT} AND t.done = 0 ORDER BY n.updated_at DESC, n.id, t.position"
        ))?;
        let rows = stmt.query_map([], from_row)?.collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    /// Completed tasks, most recently completed first.
    pub fn list_done_tasks(&self, limit: u32) -> Result<Vec<Task>> {
        let mut stmt = self.conn.prepare(&format!(
            "{SELECT} AND t.done = 1 ORDER BY t.done_at DESC, n.id, t.position LIMIT ?1"
        ))?;
        let rows = stmt.query_map([limit], from_row)?.collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    /// Checks or unchecks a task by rewriting its line in the note's Markdown, then saving
    /// the note through the normal pipeline (which updates the index and `done_at`).
    pub fn set_task_done(&mut self, task_id: &str, done: bool) -> Result<Note> {
        let (note_id, hash) = task_id.split_once(':').ok_or(Error::NotFound("task"))?;
        let note = self.get_note(note_id)?;
        let body = parser::set_done(&note.body, hash, done).ok_or(Error::NotFound("task"))?;
        self.save_note_body(note_id, &body)
    }
}

#[cfg(test)]
mod tests {
    use crate::test_util::id;
    use crate::{Error, Vault};

    fn texts(tasks: &[crate::Task]) -> Vec<&str> {
        tasks.iter().map(|t| t.text.as_str()).collect()
    }

    #[test]
    fn index_follows_saves() {
        let mut v = Vault::open_in_memory().unwrap();
        let n = id();
        v.create_note(&n, None, "Groceries").unwrap();
        v.save_note_body(&n, "- [ ] milk\n- [x] eggs\n```\n- [ ] not a task\n```\n").unwrap();

        let open = v.list_open_tasks().unwrap();
        assert_eq!(texts(&open), ["milk"]);
        assert_eq!(open[0].note_title, "Groceries");
        assert_eq!(open[0].line, 0);
        let done = v.list_done_tasks(10).unwrap();
        assert_eq!(texts(&done), ["eggs"]);
        assert!(done[0].done_at.is_some());

        v.save_note_body(&n, "nothing left").unwrap();
        assert!(v.list_open_tasks().unwrap().is_empty());
        assert!(v.list_done_tasks(10).unwrap().is_empty());
    }

    #[test]
    fn done_at_is_set_on_check_and_kept_across_edits() {
        let mut v = Vault::open_in_memory().unwrap();
        let n = id();
        v.create_note(&n, None, "N").unwrap();
        v.save_note_body(&n, "- [ ] a\n- [ ] b\n").unwrap();
        v.save_note_body(&n, "- [ ] a\n- [x] b\n").unwrap();
        let first = v.list_done_tasks(10).unwrap()[0].done_at.unwrap();

        std::thread::sleep(std::time::Duration::from_millis(3));
        // Unrelated edit that also moves the done task: done_at unchanged.
        v.save_note_body(&n, "# Header\n\n- [x] b\n- [ ] a\n- [ ] c\n").unwrap();
        let task = &v.list_done_tasks(10).unwrap()[0];
        assert_eq!(task.done_at, Some(first));
        assert_eq!(task.line, 2);

        // Unchecking clears it; checking again sets a new time.
        v.save_note_body(&n, "- [ ] b\n").unwrap();
        assert!(v.list_done_tasks(10).unwrap().is_empty());
        std::thread::sleep(std::time::Duration::from_millis(3));
        v.save_note_body(&n, "- [x] b\n").unwrap();
        assert!(v.list_done_tasks(10).unwrap()[0].done_at.unwrap() > first);
    }

    #[test]
    fn set_task_done_rewrites_markdown() {
        let mut v = Vault::open_in_memory().unwrap();
        let n = id();
        v.create_note(&n, None, "N").unwrap();
        v.save_note_body(&n, "intro\n- [ ] a\n  - [ ] nested\n").unwrap();
        let nested = v.list_open_tasks().unwrap().into_iter().find(|t| t.text == "nested").unwrap();

        let note = v.set_task_done(&nested.id, true).unwrap();
        assert_eq!(note.body, "intro\n- [ ] a\n  - [x] nested\n");
        assert_eq!(texts(&v.list_done_tasks(10).unwrap()), ["nested"]);
        // The id is stable, so the same id unchecks it.
        assert_eq!(v.set_task_done(&nested.id, false).unwrap().body, "intro\n- [ ] a\n  - [ ] nested\n");

        assert!(matches!(v.set_task_done("garbage", true), Err(Error::NotFound(_))));
        assert!(matches!(v.set_task_done(&format!("{n}:0000"), true), Err(Error::NotFound(_))));
    }

    #[test]
    fn deleted_notes_drop_out() {
        let mut v = Vault::open_in_memory().unwrap();
        let (f, n) = (id(), id());
        v.create_folder(&f, None, "F").unwrap();
        v.create_note(&n, Some(&f), "N").unwrap();
        v.save_note_body(&n, "- [ ] a\n").unwrap();
        v.delete_folder(&f).unwrap();
        assert!(v.list_open_tasks().unwrap().is_empty());
    }

    #[test]
    fn open_tasks_grouped_by_recent_note() {
        let mut v = Vault::open_in_memory().unwrap();
        let (a, b) = (id(), id());
        v.create_note(&a, None, "A").unwrap();
        v.create_note(&b, None, "B").unwrap();
        v.save_note_body(&a, "- [ ] a1\n- [ ] a2\n").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        v.save_note_body(&b, "- [ ] b1\n").unwrap();
        assert_eq!(texts(&v.list_open_tasks().unwrap()), ["b1", "a1", "a2"]);
    }

    #[test]
    fn migration_backfills_existing_notes() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        // Simulate a v2 database with a note, then run the remaining migrations.
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        for sql in [include_str!("../db/sql/0001_init.sql"), include_str!("../db/sql/0002_settings.sql")] {
            conn.execute_batch(sql).unwrap();
        }
        conn.pragma_update(None, "user_version", 2).unwrap();
        conn.execute(
            "INSERT INTO notes (id, title, body, created_at, updated_at) VALUES ('n', 'Old', '- [x] done before', 1, 42)",
            [],
        )
        .unwrap();
        crate::db::run_migrations(&mut conn).unwrap();
        let (text, done_at): (String, i64) =
            conn.query_row("SELECT text, done_at FROM tasks", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!((text.as_str(), done_at), ("done before", 42));
    }
}
