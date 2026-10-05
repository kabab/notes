use tauri::State;
use vault_core::Note;

use super::with_vault;
use crate::AppState;
use crate::error::CmdResult;

#[tauri::command(async)]
pub fn get_daily_note(state: State<'_, AppState>, date: String) -> CmdResult<Option<Note>> {
    with_vault(state, |v| v.get_daily_note(&date))
}

#[tauri::command(async)]
pub fn ensure_daily_note(
    state: State<'_, AppState>,
    date: String,
    note_id: String,
    folder_id: String,
) -> CmdResult<Note> {
    with_vault(state, |v| v.ensure_daily_note(&date, &note_id, &folder_id))
}

#[tauri::command(async)]
pub fn set_note_date(state: State<'_, AppState>, id: String, date: Option<String>) -> CmdResult<Note> {
    with_vault(state, |v| v.set_note_date(&id, date.as_deref()))
}
