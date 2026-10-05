//! Pure task parsing: finds `- [ ]` / `- [x]` items in Markdown.
//!
//! Uses a CommonMark parser (pulldown-cmark) rather than line matching so that
//! fenced/indented code blocks, inline code and other false positives are ignored,
//! and nested or indented list items are handled exactly as a renderer would.

use pulldown_cmark::{Event, Options, Parser};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedTask {
    /// 0-based line number of the task.
    pub line: usize,
    /// Byte offset of the `[` of the marker in the body.
    pub marker: usize,
    pub done: bool,
    /// Text after the marker on the same line, trimmed.
    pub text: String,
    /// Stable identity across edits: hash of the normalized text plus the occurrence
    /// index among tasks with the same text. Independent of the checkbox state and line.
    pub hash: String,
}

pub fn parse(body: &str) -> Vec<ParsedTask> {
    let line_starts: Vec<usize> =
        std::iter::once(0).chain(body.match_indices('\n').map(|(i, _)| i + 1)).collect();

    let mut tasks = Vec::new();
    let mut seen: std::collections::HashMap<String, usize> = Default::default();

    for (event, range) in Parser::new_ext(body, Options::ENABLE_TASKLISTS).into_offset_iter() {
        let Event::TaskListMarker(done) = event else { continue };
        let Some(marker) = find_marker(body, range.start) else { continue };
        let line = line_starts.partition_point(|&s| s <= marker) - 1;
        let line_end = body[marker..].find('\n').map_or(body.len(), |i| marker + i);
        let text = body[marker + 3..line_end].trim().to_string();
        if text.is_empty() {
            continue;
        }
        let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
        let occurrence = seen.entry(normalized.clone()).or_default();
        let hash = format!("{:016x}", fnv1a(format!("{normalized}\0{occurrence}").as_bytes()));
        *occurrence += 1;
        tasks.push(ParsedTask { line, marker, done, text, hash });
    }
    tasks
}

/// Returns `body` with the task whose hash is `hash` set to `done`, or None if no such task.
pub fn set_done(body: &str, hash: &str, done: bool) -> Option<String> {
    let task = parse(body).into_iter().find(|t| t.hash == hash)?;
    let mut out = String::with_capacity(body.len());
    out.push_str(&body[..task.marker + 1]);
    out.push(if done { 'x' } else { ' ' });
    out.push_str(&body[task.marker + 2..]);
    Some(out)
}

/// The marker (`[ ]`, `[x]`, `[X]`) at or right after `from` on the same line.
/// (The event's range normally starts at the `[`; this guards against parser changes.)
fn find_marker(body: &str, from: usize) -> Option<usize> {
    let rest = &body[from..];
    let line = &rest[..rest.find('\n').unwrap_or(rest.len())];
    ["[ ]", "[x]", "[X]"].iter().filter_map(|m| line.find(m)).min().map(|i| from + i)
}

/// FNV-1a, 64-bit: tiny, stable across platforms and versions (unlike std's hasher).
fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |h, &b| (h ^ b as u64).wrapping_mul(0x100000001b3))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn summary(body: &str) -> Vec<(usize, bool, String)> {
        parse(body).into_iter().map(|t| (t.line, t.done, t.text)).collect()
    }

    #[test]
    fn basic_tasks() {
        let body = "# Title\n- [ ] buy milk\n- [x] call mom\n* [X] star bullet\n+ [ ] plus bullet\n";
        assert_eq!(
            summary(body),
            vec![
                (1, false, "buy milk".into()),
                (2, true, "call mom".into()),
                (3, true, "star bullet".into()),
                (4, false, "plus bullet".into()),
            ]
        );
    }

    #[test]
    fn marker_offset_points_at_bracket() {
        let body = "intro\n\n  - [ ] indented";
        let t = &parse(body)[0];
        assert_eq!(&body[t.marker..t.marker + 3], "[ ]");
        assert_eq!(t.line, 2);
    }

    #[test]
    fn nested_and_ordered_lists() {
        let body = "- [ ] parent\n  - [x] child\n    - [ ] grandchild\n1. [ ] ordered\n2. [x] ordered done\n";
        assert_eq!(
            summary(body),
            vec![
                (0, false, "parent".into()),
                (1, true, "child".into()),
                (2, false, "grandchild".into()),
                (3, false, "ordered".into()),
                (4, true, "ordered done".into()),
            ]
        );
    }

    #[test]
    fn nested_under_plain_items_and_in_blockquotes() {
        let body = "- plain\n  - [ ] nested task\n\n> - [x] quoted\n";
        assert_eq!(summary(body), vec![(1, false, "nested task".into()), (3, true, "quoted".into())]);
    }

    #[test]
    fn ignores_code_blocks_and_inline_code() {
        let body = "\
```
- [ ] in fenced code
```

~~~md
- [x] tilde fence
~~~

paragraph

    - [ ] indented code block

`- [ ] inline code`
- [ ] real one
";
        assert_eq!(summary(body), vec![(13, false, "real one".into())]);
    }

    #[test]
    fn task_inside_list_item_code_is_ignored() {
        let body = "- item\n\n  ```\n  - [ ] code in list\n  ```\n";
        assert!(parse(body).is_empty());
    }

    #[test]
    fn ignores_non_tasks() {
        let body = "[ ] not a list\n- [] no space\n- [ ]no space after\n- [y] wrong char\n- [ ]\n- [ ]   \nText - [ ] mid-line\n";
        assert!(parse(body).is_empty(), "{:?}", summary(body));
    }

    #[test]
    fn keeps_inline_markdown_in_text() {
        let body = "- [ ] read **[[Book]]** by `tomorrow`  \n";
        assert_eq!(parse(body)[0].text, "read **[[Book]]** by `tomorrow`");
    }

    #[test]
    fn crlf_line_endings() {
        let body = "- [ ] one\r\n- [x] two\r\n";
        assert_eq!(summary(body), vec![(0, false, "one".into()), (1, true, "two".into())]);
    }

    #[test]
    fn hash_is_stable_across_moves_and_toggles() {
        let a = parse("- [ ] alpha\n- [ ] beta\n");
        let b = parse("intro\n\n- [x] beta\n- [ ]   alpha\n");
        assert_eq!(a[0].hash, b[1].hash, "alpha: same text, moved, extra spaces");
        assert_eq!(a[1].hash, b[0].hash, "beta: toggled");
        assert_ne!(a[0].hash, a[1].hash);
    }

    #[test]
    fn duplicate_texts_get_distinct_hashes() {
        let t = parse("- [ ] same\n- [x] same\n- [ ] other\n");
        assert_ne!(t[0].hash, t[1].hash);
        // Removing the first duplicate shifts identities, as expected for indistinguishable lines.
        assert_eq!(parse("- [x] same\n")[0].hash, t[0].hash);
    }

    #[test]
    fn set_done_flips_only_the_target() {
        let body = "- [ ] a\n  - [ ] b\n```\n- [ ] b\n```\n";
        let b = parse(body)[1].hash.clone();
        let checked = set_done(body, &b, true).unwrap();
        assert_eq!(checked, "- [ ] a\n  - [x] b\n```\n- [ ] b\n```\n");
        assert_eq!(set_done(&checked, &b, false).unwrap(), body);
        assert_eq!(set_done(&checked, &b, true).unwrap(), checked, "idempotent");
        assert!(set_done(body, "nope", true).is_none());
    }

    #[test]
    fn set_done_preserves_unicode() {
        let body = "- [ ] café ☕\n- [X] naïve\n";
        let tasks = parse(body);
        assert_eq!(tasks[0].text, "café ☕");
        assert_eq!(set_done(body, &tasks[1].hash, false).unwrap(), "- [ ] café ☕\n- [ ] naïve\n");
    }
}
