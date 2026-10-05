use tauri::State;
use vault_core::{Note, Task};

use super::with_vault;
use crate::AppState;
use crate::error::CmdResult;

#[tauri::command(async)]
pub fn list_open_tasks(state: State<'_, AppState>) -> CmdResult<Vec<Task>> {
    with_vault(state, |v| v.list_open_tasks())
}

#[tauri::command(async)]
pub fn list_done_tasks(state: State<'_, AppState>, limit: u32) -> CmdResult<Vec<Task>> {
    with_vault(state, |v| v.list_done_tasks(limit))
}

#[tauri::command(async)]
pub fn set_task_done(state: State<'_, AppState>, id: String, done: bool) -> CmdResult<Note> {
    with_vault(state, |v| v.set_task_done(&id, done))
}
