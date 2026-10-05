use tauri::State;
use vault_core::SearchHit;
use vault_core::export::ExportSummary;

use super::with_vault;
use crate::AppState;
use crate::error::CmdResult;

#[tauri::command(async)]
pub fn search(state: State<'_, AppState>, query: String, limit: u32) -> CmdResult<Vec<SearchHit>> {
    with_vault(state, |v| v.search(&query, limit))
}

/// Exports into a new "Notes export" directory inside `parent` (chosen by the user).
#[tauri::command(async)]
pub fn export_vault(state: State<'_, AppState>, parent: String) -> CmdResult<ExportSummary> {
    with_vault(state, |v| v.export(std::path::Path::new(&parent)))
}
