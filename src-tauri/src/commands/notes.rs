use tauri::State;
use vault_core::{Note, NoteSummary};

use super::with_vault;
use crate::AppState;
use crate::error::CmdResult;

#[tauri::command(async)]
pub fn list_notes(state: State<'_, AppState>) -> CmdResult<Vec<NoteSummary>> {
    with_vault(state, |v| v.list_notes())
}

#[tauri::command(async)]
pub fn get_note(state: State<'_, AppState>, id: String) -> CmdResult<Note> {
    with_vault(state, |v| v.get_note(&id))
}

#[tauri::command(async)]
pub fn create_note(
    state: State<'_, AppState>,
    id: String,
    folder_id: Option<String>,
    title: String,
) -> CmdResult<Note> {
    with_vault(state, |v| v.create_note(&id, folder_id.as_deref(), &title))
}

#[tauri::command(async)]
pub fn rename_note(state: State<'_, AppState>, id: String, title: String) -> CmdResult<Note> {
    with_vault(state, |v| v.rename_note(&id, &title))
}

#[tauri::command(async)]
pub fn save_note_body(state: State<'_, AppState>, id: String, body: String) -> CmdResult<Note> {
    with_vault(state, |v| v.save_note_body(&id, &body))
}

#[tauri::command(async)]
pub fn move_note(state: State<'_, AppState>, id: String, folder_id: Option<String>) -> CmdResult<Note> {
    with_vault(state, |v| v.move_note(&id, folder_id.as_deref()))
}

#[tauri::command(async)]
pub fn delete_note(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    with_vault(state, |v| v.delete_note(&id))
}

#[tauri::command(async)]
pub fn resolve_link(state: State<'_, AppState>, target: String) -> CmdResult<Option<NoteSummary>> {
    with_vault(state, |v| v.resolve_link(&target))
}
