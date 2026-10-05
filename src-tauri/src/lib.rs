//! Tauri shell: opens the vault and exposes `vault-core` as commands.
//! No business logic lives here.

mod commands;
mod error;

use std::sync::Mutex;

use tauri::Manager;
use vault_core::Vault;

pub struct AppState(pub Mutex<Vault>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let vault = Vault::open(&data_dir)?;
            app.manage(AppState(Mutex::new(vault)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::folders::list_folders,
            commands::folders::create_folder,
            commands::folders::rename_folder,
            commands::folders::move_folder,
            commands::folders::delete_folder,
            commands::notes::list_notes,
            commands::notes::get_note,
            commands::notes::create_note,
            commands::notes::rename_note,
            commands::notes::save_note_body,
            commands::notes::move_note,
            commands::notes::delete_note,
            commands::notes::resolve_link,
            commands::daily::get_daily_note,
            commands::daily::ensure_daily_note,
            commands::daily::set_note_date,
            commands::tasks::list_open_tasks,
            commands::tasks::list_done_tasks,
            commands::tasks::set_task_done,
            commands::attachments::attachments_dir,
            commands::attachments::add_attachment,
            commands::attachments::add_attachment_from_path,
            commands::search::search,
            commands::search::export_vault,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
