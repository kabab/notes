// `async` runs these off the main thread so DB work never blocks the UI.

use tauri::State;
use vault_core::Folder;

use super::with_vault;
use crate::AppState;
use crate::error::CmdResult;

#[tauri::command(async)]
pub fn list_folders(state: State<'_, AppState>) -> CmdResult<Vec<Folder>> {
    with_vault(state, |v| v.list_folders())
}

#[tauri::command(async)]
pub fn create_folder(
    state: State<'_, AppState>,
    id: String,
    parent_id: Option<String>,
    name: String,
) -> CmdResult<Folder> {
    with_vault(state, |v| v.create_folder(&id, parent_id.as_deref(), &name))
}

#[tauri::command(async)]
pub fn rename_folder(state: State<'_, AppState>, id: String, name: String) -> CmdResult<Folder> {
    with_vault(state, |v| v.rename_folder(&id, &name))
}

#[tauri::command(async)]
pub fn move_folder(state: State<'_, AppState>, id: String, parent_id: Option<String>) -> CmdResult<Folder> {
    with_vault(state, |v| v.move_folder(&id, parent_id.as_deref()))
}

#[tauri::command(async)]
pub fn delete_folder(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    with_vault(state, |v| v.delete_folder(&id))
}
