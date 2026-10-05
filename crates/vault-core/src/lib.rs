//! Platform-independent core of the notes app: storage, business rules, parsing.
//! No Tauri types here, so this crate can be reused on Android and by a sync server.

pub mod attachments;
mod changes;
mod daily;
mod db;
mod error;
pub mod export;
mod folders;
mod ids;
mod links;
mod model;
mod notes;
pub mod search;
mod settings;
mod tasks;
mod time;

use std::path::{Path, PathBuf};

use rusqlite::Connection;

pub use error::{Error, Result};
pub use model::{Attachment, Folder, Note, NoteSummary, SearchHit, Task};

pub const DB_FILE: &str = "vault.db";

/// An open vault: one SQLite database plus (later) an attachments directory.
pub struct Vault {
    conn: Connection,
    data_dir: Option<PathBuf>,
}

impl Vault {
    /// Opens (creating if needed) the vault in `data_dir` and runs pending migrations.
    pub fn open(data_dir: impl AsRef<Path>) -> Result<Self> {
        let data_dir = data_dir.as_ref();
        std::fs::create_dir_all(data_dir)?;
        let conn = db::open(&data_dir.join(DB_FILE))?;
        Ok(Self { conn, data_dir: Some(data_dir.to_path_buf()) })
    }

    /// In-memory vault for tests.
    pub fn open_in_memory() -> Result<Self> {
        Ok(Self { conn: db::open_in_memory()?, data_dir: None })
    }
}

#[cfg(test)]
pub(crate) mod test_util {
    pub fn id() -> String {
        uuid::Uuid::now_v7().to_string()
    }
}
