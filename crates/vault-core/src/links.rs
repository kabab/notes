//! `[[wiki links]]`: resolving a link target to a note.

use crate::{NoteSummary, Result, Vault};

/// Normalizes a title for link matching: trimmed, case-insensitive, inner whitespace collapsed.
pub fn normalize_title(title: &str) -> String {
    title.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

impl Vault {
    /// Finds the note a `[[target]]` points to. If several notes share the title,
    /// the most recently updated one wins.
    pub fn resolve_link(&self, target: &str) -> Result<Option<NoteSummary>> {
        let wanted = normalize_title(target);
        if wanted.is_empty() {
            return Ok(None);
        }
        // Unicode-aware matching happens in Rust (SQLite's NOCASE is ASCII-only).
        // A personal vault is small enough that scanning titles is fine.
        Ok(self
            .list_notes()?
            .into_iter()
            .filter(|n| normalize_title(&n.title) == wanted)
            .max_by_key(|n| n.updated_at))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::id;

    #[test]
    fn normalizes() {
        assert_eq!(normalize_title("  Hello   World "), "hello world");
        assert_eq!(normalize_title("ÉTÉ"), "été");
    }

    #[test]
    fn resolves_case_insensitively_and_ignores_deleted() {
        let mut v = Vault::open_in_memory().unwrap();
        let (a, b) = (id(), id());
        v.create_note(&a, None, "Reading List").unwrap();
        v.create_note(&b, None, "Été").unwrap();

        assert_eq!(v.resolve_link("reading  list").unwrap().unwrap().id, a);
        assert_eq!(v.resolve_link("été").unwrap().unwrap().id, b);
        assert!(v.resolve_link("missing").unwrap().is_none());
        assert!(v.resolve_link("   ").unwrap().is_none());

        v.delete_note(&a).unwrap();
        assert!(v.resolve_link("Reading List").unwrap().is_none());
    }

    #[test]
    fn duplicate_titles_pick_most_recent() {
        let mut v = Vault::open_in_memory().unwrap();
        let (a, b) = (id(), id());
        v.create_note(&a, None, "Dup").unwrap();
        v.create_note(&b, None, "Dup").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2));
        v.save_note_body(&a, "newer").unwrap();
        assert_eq!(v.resolve_link("Dup").unwrap().unwrap().id, a);
    }
}
