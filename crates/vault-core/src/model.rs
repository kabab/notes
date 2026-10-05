//! Types returned to callers. Serialized as camelCase JSON for the frontend;
//! with the `ts` feature, ts-rs generates matching TypeScript in `src/bindings`.
//! Soft-deleted rows are never returned, so `deleted_at` is not exposed.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Folder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub created_at: i64,
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Note {
    pub id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub body: String,
    /// Daily-note date, `YYYY-MM-DD`.
    pub date: Option<String>,
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub created_at: i64,
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Attachment {
    /// SHA-256 of the stored WebP file; referenced in notes as `att:<hash>`.
    pub hash: String,
    pub original_name: Option<String>,
    pub mime: String,
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub size: i64,
    pub width: u32,
    pub height: u32,
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub created_at: i64,
}

/// A full-text search result.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SearchHit {
    /// The note id.
    pub id: String,
    pub title: String,
    /// Excerpt with matches wrapped in `\u{1}` … `\u{2}`.
    pub snippet: String,
    pub folder_id: Option<String>,
    pub date: Option<String>,
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub updated_at: i64,
}

/// An entry of the task index, with its note's title for display.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Task {
    /// `<note_id>:<line_hash>`: stable while the task's text is unchanged.
    pub id: String,
    pub note_id: String,
    pub note_title: String,
    pub text: String,
    pub done: bool,
    #[cfg_attr(feature = "ts", ts(type = "number | null"))]
    pub done_at: Option<i64>,
    /// 0-based line number in the note.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub line: i64,
}

/// A note without its body, for lists and the sidebar tree.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct NoteSummary {
    pub id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub date: Option<String>,
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub updated_at: i64,
}
