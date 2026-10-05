//! Full-text search over note titles and bodies (SQLite FTS5).

use rusqlite::params;

use crate::{Result, SearchHit, Vault};

/// Start/end markers around matched terms in snippets (control characters, so the
/// frontend can highlight without ever interpreting note text as HTML).
pub const MATCH_START: char = '\u{1}';
pub const MATCH_END: char = '\u{2}';

/// Turns free text into a safe FTS5 query: every word is quoted (so `AND`, `-`, `"`, `*`
/// and parentheses are literal) and prefix-matched, and all words must match.
pub fn fts_query(input: &str) -> Option<String> {
    let terms: Vec<String> = input
        .split_whitespace()
        .filter(|t| t.chars().any(char::is_alphanumeric))
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" "))
}

impl Vault {
    /// Best matches first; title matches weigh 10× body matches.
    pub fn search(&self, query: &str, limit: u32) -> Result<Vec<SearchHit>> {
        let Some(fts) = fts_query(query) else { return Ok(Vec::new()) };
        let mut stmt = self.conn.prepare(
            "SELECT n.id, n.title, snippet(notes_fts, -1, char(1), char(2), '…', 12),
                    n.folder_id, n.date, n.updated_at
             FROM notes_fts JOIN notes n ON n.id = notes_fts.note_id
             WHERE notes_fts MATCH ?1 AND n.deleted_at IS NULL
             ORDER BY bm25(notes_fts, 0.0, 10.0, 1.0)
             LIMIT ?2",
        )?;
        let hits = stmt
            .query_map(params![fts, limit], |r| {
                Ok(SearchHit {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    snippet: r.get(2)?,
                    folder_id: r.get(3)?,
                    date: r.get(4)?,
                    updated_at: r.get(5)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        Ok(hits)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::id;

    fn titles(v: &Vault, q: &str) -> Vec<String> {
        v.search(q, 50).unwrap().into_iter().map(|h| h.title).collect()
    }

    fn note(v: &mut Vault, title: &str, body: &str) -> String {
        let n = id();
        v.create_note(&n, None, title).unwrap();
        v.save_note_body(&n, body).unwrap();
        n
    }

    #[test]
    fn builds_safe_queries() {
        assert_eq!(fts_query("hello world").as_deref(), Some(r#""hello"* "world"*"#));
        assert_eq!(fts_query(r#"say "hi""#).as_deref(), Some(r#""say"* """hi"""*"#));
        assert_eq!(fts_query("  - * () "), None);
        assert_eq!(fts_query(""), None);
    }

    #[test]
    fn finds_by_title_and_body_with_prefixes() {
        let mut v = Vault::open_in_memory().unwrap();
        note(&mut v, "Groceries", "buy milk and eggs");
        note(&mut v, "Ideas", "a note about groceries delivery");
        note(&mut v, "Other", "nothing here");

        assert_eq!(titles(&v, "groc"), ["Groceries", "Ideas"], "title match ranks first");
        assert_eq!(titles(&v, "milk eggs"), ["Groceries"]);
        assert_eq!(titles(&v, "milk delivery"), Vec::<String>::new(), "all words must match");
    }

    #[test]
    fn ignores_case_and_diacritics() {
        let mut v = Vault::open_in_memory().unwrap();
        note(&mut v, "Café notes", "Crème brûlée recipe");
        assert_eq!(titles(&v, "cafe"), ["Café notes"]);
        assert_eq!(titles(&v, "CREME BRULEE"), ["Café notes"]);
    }

    #[test]
    fn operators_are_literal() {
        let mut v = Vault::open_in_memory().unwrap();
        note(&mut v, "Logic", "this AND that OR NOT those");
        for q in ["AND", "NOT", "a OR", "(that", "\"this", "that*", "-those", "NEAR(x"] {
            v.search(q, 10).unwrap_or_else(|e| panic!("query {q:?} failed: {e}"));
        }
        assert_eq!(titles(&v, "NOT"), ["Logic"]);
    }

    #[test]
    fn follows_edits_renames_and_deletes() {
        let mut v = Vault::open_in_memory().unwrap();
        let n = note(&mut v, "Draft", "alpha");
        v.save_note_body(&n, "beta").unwrap();
        assert!(titles(&v, "alpha").is_empty());
        assert_eq!(titles(&v, "beta"), ["Draft"]);

        v.rename_note(&n, "Final").unwrap();
        assert_eq!(titles(&v, "final"), ["Final"]);
        assert!(titles(&v, "draft").is_empty());

        v.delete_note(&n).unwrap();
        assert!(titles(&v, "beta").is_empty());
    }

    #[test]
    fn snippet_marks_matches() {
        let mut v = Vault::open_in_memory().unwrap();
        note(&mut v, "N", "the quick brown fox jumps");
        let hit = &v.search("brown", 10).unwrap()[0];
        assert!(hit.snippet.contains(&format!("{MATCH_START}brown{MATCH_END}")), "{:?}", hit.snippet);
    }

    #[test]
    fn migration_indexes_existing_notes() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        for sql in [
            include_str!("db/sql/0001_init.sql"),
            include_str!("db/sql/0002_settings.sql"),
            include_str!("db/sql/0003_tasks.sql"),
            include_str!("db/sql/0004_attachments.sql"),
        ] {
            conn.execute_batch(sql).unwrap();
        }
        conn.pragma_update(None, "user_version", 4).unwrap();
        conn.execute_batch(
            "INSERT INTO notes (id, title, body, created_at, updated_at) VALUES ('a', 'Kept', 'zebra', 1, 1);
             INSERT INTO notes (id, title, body, created_at, updated_at, deleted_at) VALUES ('b', 'Gone', 'zebra', 1, 1, 2);",
        )
        .unwrap();
        crate::db::run_migrations(&mut conn).unwrap();
        let ids: Vec<String> = conn
            .prepare("SELECT note_id FROM notes_fts WHERE notes_fts MATCH 'zebra'")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(ids, ["a"]);
    }
}
