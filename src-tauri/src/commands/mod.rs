pub mod attachments;
pub mod daily;
pub mod folders;
pub mod notes;
pub mod search;
pub mod tasks;

use tauri::State;
use vault_core::Vault;

use crate::AppState;
use crate::error::{CmdError, CmdResult};

/// Runs `f` with exclusive access to the vault.
pub(crate) fn with_vault<T>(
    state: State<'_, AppState>,
    f: impl FnOnce(&mut Vault) -> vault_core::Result<T>,
) -> CmdResult<T> {
    let mut vault = state.0.lock().map_err(|_| CmdError::poisoned())?;
    Ok(f(&mut vault)?)
}
