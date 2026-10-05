//! "Export vault": every live note as a `.md` file in its folder structure, plus the
//! attachments. Image links `att:<hash>` are rewritten to relative file paths so the
//! export works in any Markdown app.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use pulldown_cmark::{Event, Options, Parser, Tag};
use serde::Serialize;

use crate::{Folder, Result, Vault, attachments};

const EXPORT_DIR_NAME: &str = "Notes export";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ExportSummary {
    /// The directory that was created.
    pub path: String,
    pub notes: u32,
    pub attachments: u32,
}

impl Vault {
    /// Exports into a new directory inside `parent` (never overwrites an existing one).
    pub fn export(&self, parent: &Path) -> Result<ExportSummary> {
        let root = unique_dir(parent, EXPORT_DIR_NAME);
        std::fs::create_dir_all(&root)?;

        let folders = self.list_folders()?;
        let folder_paths = folder_paths(&folders);
        let mut used: HashMap<PathBuf, HashSet<String>> = HashMap::new(); // dir -> lowercase names taken
        for path in folder_paths.values() {
            std::fs::create_dir_all(root.join(path))?;
            if let (Some(parent), Some(name)) = (path.parent(), path.file_name()) {
                used.entry(parent.to_path_buf()).or_default().insert(name.to_string_lossy().to_lowercase());
            }
        }

        let mut notes = 0;
        for summary in self.list_notes()? {
            let note = self.get_note(&summary.id)?;
            let dir = note.folder_id.as_ref().and_then(|f| folder_paths.get(f)).cloned().unwrap_or_default();
            let name = unique_name(used.entry(dir.clone()).or_default(), &sanitize(&note.title), ".md");
            let depth = dir.components().count();
            let body = rewrite_attachment_links(&note.body, &format!("{}{}", "../".repeat(depth), attachments::DIR));
            std::fs::write(root.join(&dir).join(name), body)?;
            notes += 1;
        }

        let mut copied = 0;
        if let Ok(src) = self.attachments_dir()
            && src.is_dir()
        {
            let dest = root.join(attachments::DIR);
            std::fs::create_dir_all(&dest)?;
            for entry in std::fs::read_dir(&src)? {
                let path = entry?.path();
                if path.extension().is_some_and(|e| e == "webp") {
                    std::fs::copy(&path, dest.join(path.file_name().unwrap()))?;
                    copied += 1;
                }
            }
        }

        Ok(ExportSummary { path: root.to_string_lossy().into_owned(), notes, attachments: copied })
    }
}

/// Relative directory of every live folder, e.g. `Work/Projects`. Sibling folders whose
/// names collide after sanitizing get " (2)" suffixes. Folders in a cycle are skipped.
fn folder_paths(folders: &[Folder]) -> HashMap<String, PathBuf> {
    let mut children: HashMap<Option<&str>, Vec<&Folder>> = HashMap::new();
    let ids: HashSet<&str> = folders.iter().map(|f| f.id.as_str()).collect();
    for f in folders {
        // A parent that isn't live (shouldn't happen) is treated as the root.
        let parent = f.parent_id.as_deref().filter(|p| ids.contains(p));
        children.entry(parent).or_default().push(f);
    }
    let mut paths = HashMap::new();
    let mut stack = vec![(None::<&str>, PathBuf::new())];
    while let Some((parent, dir)) = stack.pop() {
        let mut taken = HashSet::new();
        for f in children.get(&parent).into_iter().flatten() {
            let path = dir.join(unique_name(&mut taken, &sanitize(&f.name), ""));
            paths.insert(f.id.clone(), path.clone());
            stack.push((Some(f.id.as_str()), path));
        }
    }
    paths
}

/// A file/folder name that is valid on macOS, Windows and Linux.
pub fn sanitize(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || r#"/\:*?"<>|"#.contains(c) { '-' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_end_matches(['.', ' ']).trim_start_matches('.').to_string();
    let cleaned: String = cleaned.chars().take(120).collect();
    if cleaned.is_empty() {
        return "Untitled".into();
    }
    const RESERVED: &[&str] = &["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2", "LPT3"];
    let stem = cleaned.split('.').next().unwrap_or("").to_uppercase();
    if RESERVED.contains(&stem.as_str()) { format!("_{cleaned}") } else { cleaned }
}

/// `name + ext`, or `name (2) + ext`, … whichever isn't in `taken` (case-insensitive).
fn unique_name(taken: &mut HashSet<String>, name: &str, ext: &str) -> String {
    let mut candidate = format!("{name}{ext}");
    let mut n = 2;
    while !taken.insert(candidate.to_lowercase()) {
        candidate = format!("{name} ({n}){ext}");
        n += 1;
    }
    candidate
}

fn unique_dir(parent: &Path, name: &str) -> PathBuf {
    let mut path = parent.join(name);
    let mut n = 2;
    while path.exists() {
        path = parent.join(format!("{name} {n}"));
        n += 1;
    }
    path
}

/// Rewrites image destinations `att:<hash>` to `<dir>/<hash>.webp`, leaving code untouched.
pub fn rewrite_attachment_links(body: &str, dir: &str) -> String {
    let mut out = String::with_capacity(body.len());
    let mut last = 0;
    for (event, range) in Parser::new_ext(body, Options::ENABLE_TASKLISTS).into_offset_iter() {
        let Event::Start(Tag::Image { dest_url, .. }) = event else { continue };
        let Some(hash) = dest_url.strip_prefix("att:") else { continue };
        // Replace the destination text inside this image's source range.
        let Some(at) = body[range.clone()].rfind(&*dest_url).map(|i| range.start + i) else { continue };
        if at < last {
            continue;
        }
        out.push_str(&body[last..at]);
        out.push_str(&format!("{dir}/{hash}.webp"));
        last = at + dest_url.len();
    }
    out.push_str(&body[last..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::id;

    const HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

    #[test]
    fn sanitizes_names() {
        assert_eq!(sanitize("a/b:c*d?"), "a-b-c-d-");
        assert_eq!(sanitize("  .hidden. "), "hidden");
        assert_eq!(sanitize("..."), "Untitled");
        assert_eq!(sanitize("CON"), "_CON");
        assert_eq!(sanitize("con.txt"), "_con.txt");
        assert_eq!(sanitize("Été 2026"), "Été 2026");
        assert_eq!(sanitize(&"x".repeat(300)).len(), 120);
    }

    #[test]
    fn rewrites_only_attachment_images() {
        let body = format!(
            "![](att:{HASH})\n![alt](https://x.org/a.png)\n`![](att:{HASH})`\n```\n![](att:{HASH})\n```\n[link](att:{HASH})\n"
        );
        let out = rewrite_attachment_links(&body, "../attachments");
        assert_eq!(
            out,
            format!(
                "![](../attachments/{HASH}.webp)\n![alt](https://x.org/a.png)\n`![](att:{HASH})`\n```\n![](att:{HASH})\n```\n[link](att:{HASH})\n"
            )
        );
    }

    #[test]
    fn exports_tree_notes_and_attachments() {
        let base = std::env::temp_dir().join(format!("vault-export-{}", id()));
        let mut v = Vault::open(base.join("data")).unwrap();
        let (work, projects, gone) = (id(), id(), id());
        v.create_folder(&work, None, "Work").unwrap();
        v.create_folder(&projects, Some(&work), "Pro/jects").unwrap();
        v.create_folder(&gone, None, "Gone").unwrap();

        let att = {
            let mut png = std::io::Cursor::new(Vec::new());
            ::image::DynamicImage::new_rgb8(4, 4).write_to(&mut png, ::image::ImageFormat::Png).unwrap();
            v.add_attachment(png.get_ref(), None).unwrap()
        };

        let n1 = id();
        v.create_note(&n1, Some(&projects), "Plan").unwrap();
        v.save_note_body(&n1, &format!("# Plan\n![](att:{})\n", att.hash)).unwrap();
        v.create_note(&id(), Some(&projects), "plan").unwrap(); // case-insensitive duplicate
        v.create_note(&id(), None, "Root note").unwrap();
        v.create_note(&id(), Some(&gone), "Deleted").unwrap();
        v.delete_folder(&gone).unwrap();

        let out = base.join("out");
        std::fs::create_dir_all(&out).unwrap();
        let summary = v.export(&out).unwrap();
        assert_eq!((summary.notes, summary.attachments), (3, 1));

        let root = PathBuf::from(&summary.path);
        assert_eq!(root.file_name().unwrap(), "Notes export");
        let plan = std::fs::read_to_string(root.join("Work/Pro-jects/Plan.md")).unwrap();
        assert_eq!(plan, format!("# Plan\n![](../../attachments/{}.webp)\n", att.hash));
        assert!(root.join("Work/Pro-jects/plan (2).md").exists());
        assert!(root.join("Root note.md").exists());
        assert!(!root.join("Gone").exists());
        assert!(root.join(format!("attachments/{}.webp", att.hash)).exists());

        // A second export goes to a new directory.
        let again = v.export(&out).unwrap();
        assert!(again.path.ends_with("Notes export 2"));

        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn colliding_folder_names_get_suffixes() {
        let mut v = Vault::open_in_memory().unwrap();
        let (a, b) = (id(), id());
        v.create_folder(&a, None, "A:B").unwrap();
        v.create_folder(&b, None, "A/B").unwrap();
        let paths = folder_paths(&v.list_folders().unwrap());
        let mut names: Vec<_> = paths.values().map(|p| p.to_string_lossy().into_owned()).collect();
        names.sort();
        assert_eq!(names, ["A-B", "A-B (2)"]);
    }
}
