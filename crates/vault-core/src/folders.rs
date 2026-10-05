use rusqlite::{Connection, OptionalExtension, Row, params};

use crate::changes::{self, Entity, Op};
use crate::ids::{self, clean_name};
use crate::time::now_ms;
use crate::{Error, Folder, Result, Vault};

const COLUMNS: &str = "id, parent_id, name, created_at, updated_at";

fn from_row(r: &Row) -> rusqlite::Result<Folder> {
    Ok(Folder {
        id: r.get(0)?,
        parent_id: r.get(1)?,
        name: r.get(2)?,
        created_at: r.get(3)?,
        updated_at: r.get(4)?,
    })
}

impl Vault {
    pub fn list_folders(&self) -> Result<Vec<Folder>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {COLUMNS} FROM folders WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map([], from_row)?.collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    pub fn create_folder(&mut self, id: &str, parent_id: Option<&str>, name: &str) -> Result<Folder> {
        ids::check(id)?;
        let name = clean_name(name)?;
        let tx = self.conn.transaction()?;
        insert(&tx, id, parent_id, &name, now_ms())?;
        let folder = get(&tx, id)?;
        tx.commit()?;
        Ok(folder)
    }

    pub fn rename_folder(&mut self, id: &str, name: &str) -> Result<Folder> {
        let name = clean_name(name)?;
        let tx = self.conn.transaction()?;
        let now = now_ms();
        let n = tx.execute(
            "UPDATE folders SET name = ?2, updated_at = ?3 WHERE id = ?1 AND deleted_at IS NULL",
            params![id, name, now],
        )?;
        if n == 0 {
            return Err(Error::NotFound("folder"));
        }
        changes::log(&tx, Entity::Folder, id, Op::Update, now)?;
        let folder = get(&tx, id)?;
        tx.commit()?;
        Ok(folder)
    }

    /// Moves a folder under `new_parent` (or to the root). Refuses to create cycles.
    pub fn move_folder(&mut self, id: &str, new_parent: Option<&str>) -> Result<Folder> {
        let tx = self.conn.transaction()?;
        require(&tx, id)?;
        if let Some(parent) = new_parent {
            require(&tx, parent)?;
            if subtree(&tx, id)?.iter().any(|f| f == parent) {
                return Err(Error::invalid("cannot move a folder into itself or one of its subfolders"));
            }
        }
        let now = now_ms();
        tx.execute(
            "UPDATE folders SET parent_id = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, new_parent, now],
        )?;
        changes::log(&tx, Entity::Folder, id, Op::Update, now)?;
        let folder = get(&tx, id)?;
        tx.commit()?;
        Ok(folder)
    }

    /// Soft-deletes the folder, all its subfolders and every note inside them.
    pub fn delete_folder(&mut self, id: &str) -> Result<()> {
        let tx = self.conn.transaction()?;
        require(&tx, id)?;
        let now = now_ms();
        for folder_id in subtree(&tx, id)? {
            let note_ids: Vec<String> = {
                let mut stmt =
                    tx.prepare("SELECT id FROM notes WHERE folder_id = ?1 AND deleted_at IS NULL")?;
                stmt.query_map([&folder_id], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?
            };
            for note_id in note_ids {
                crate::notes::soft_delete(&tx, &note_id, now)?;
            }
            tx.execute(
                "UPDATE folders SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1",
                params![folder_id, now],
            )?;
            changes::log(&tx, Entity::Folder, &folder_id, Op::Delete, now)?;
        }
        tx.commit()?;
        Ok(())
    }
}

/// Inserts a folder (id and name already validated) and logs it. Callers own the transaction.
pub(crate) fn insert(conn: &Connection, id: &str, parent_id: Option<&str>, name: &str, now: i64) -> Result<()> {
    if exists_any(conn, id)? {
        return Err(Error::Conflict(format!("folder {id} already exists")));
    }
    if let Some(parent) = parent_id {
        require(conn, parent)?;
    }
    conn.execute(
        "INSERT INTO folders (id, parent_id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, parent_id, name, now],
    )?;
    changes::log(conn, Entity::Folder, id, Op::Create, now)
}

fn get(conn: &Connection, id: &str) -> Result<Folder> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM folders WHERE id = ?1 AND deleted_at IS NULL"),
        [id],
        from_row,
    )
    .optional()?
    .ok_or(Error::NotFound("folder"))
}

/// Errors unless the folder exists and is not deleted.
pub(crate) fn require(conn: &Connection, id: &str) -> Result<()> {
    get(conn, id).map(|_| ())
}

/// True if a row with this id exists, deleted or not (ids are never reused).
fn exists_any(conn: &Connection, id: &str) -> Result<bool> {
    Ok(conn.query_row("SELECT 1 FROM folders WHERE id = ?1", [id], |_| Ok(())).optional()?.is_some())
}

/// The folder itself plus all live descendants.
fn subtree(conn: &Connection, id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "WITH RECURSIVE sub(id) AS (
             SELECT id FROM folders WHERE id = ?1
             UNION
             SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id WHERE f.deleted_at IS NULL
         )
         SELECT id FROM sub",
    )?;
    let ids = stmt.query_map([id], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use crate::test_util::id;
    use crate::{Error, Vault, changes};

    fn vault() -> Vault {
        Vault::open_in_memory().unwrap()
    }

    #[test]
    fn create_list_rename() {
        let mut v = vault();
        let a = id();
        v.create_folder(&a, None, " Work ").unwrap();
        let b = id();
        v.create_folder(&b, Some(&a), "Projects").unwrap();

        let all = v.list_folders().unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[1].name, "Work");
        assert_eq!(all[0].parent_id.as_deref(), Some(a.as_str()));

        let renamed = v.rename_folder(&b, "Side projects").unwrap();
        assert_eq!(renamed.name, "Side projects");
    }

    #[test]
    fn rejects_duplicate_id_and_missing_parent() {
        let mut v = vault();
        let a = id();
        v.create_folder(&a, None, "A").unwrap();
        assert!(matches!(v.create_folder(&a, None, "A again"), Err(Error::Conflict(_))));
        assert!(matches!(v.create_folder(&id(), Some(&id()), "Orphan"), Err(Error::NotFound(_))));
    }

    #[test]
    fn move_prevents_cycles() {
        let mut v = vault();
        let (a, b, c) = (id(), id(), id());
        v.create_folder(&a, None, "A").unwrap();
        v.create_folder(&b, Some(&a), "B").unwrap();
        v.create_folder(&c, Some(&b), "C").unwrap();

        assert!(matches!(v.move_folder(&a, Some(&a)), Err(Error::Invalid(_))));
        assert!(matches!(v.move_folder(&a, Some(&c)), Err(Error::Invalid(_))));

        let moved = v.move_folder(&c, None).unwrap();
        assert_eq!(moved.parent_id, None);
        v.move_folder(&a, Some(&c)).unwrap();
    }

    #[test]
    fn delete_cascades_to_subfolders_and_notes() {
        let mut v = vault();
        let (a, b, keep) = (id(), id(), id());
        v.create_folder(&a, None, "A").unwrap();
        v.create_folder(&b, Some(&a), "B").unwrap();
        v.create_folder(&keep, None, "Keep").unwrap();
        let (n1, n2, n3) = (id(), id(), id());
        v.create_note(&n1, Some(&a), "In A").unwrap();
        v.create_note(&n2, Some(&b), "In B").unwrap();
        v.create_note(&n3, Some(&keep), "In Keep").unwrap();

        v.delete_folder(&a).unwrap();

        let folders: Vec<_> = v.list_folders().unwrap().into_iter().map(|f| f.id).collect();
        assert_eq!(folders, vec![keep.clone()]);
        let notes: Vec<_> = v.list_notes().unwrap().into_iter().map(|n| n.id).collect();
        assert_eq!(notes, vec![n3]);
        assert!(matches!(v.get_note(&n1), Err(Error::NotFound(_))));
        assert!(matches!(v.rename_folder(&b, "x"), Err(Error::NotFound(_))));
    }

    #[test]
    fn mutations_are_logged() {
        let mut v = vault();
        let a = id();
        v.create_folder(&a, None, "A").unwrap();
        v.rename_folder(&a, "B").unwrap();
        v.delete_folder(&a).unwrap();
        let ops: Vec<_> = changes::all(&v.conn).into_iter().map(|(e, _, op)| format!("{e}:{op}")).collect();
        assert_eq!(ops, ["folder:create", "folder:update", "folder:delete"]);
    }
}
