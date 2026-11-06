mod agent;
mod ai;
mod db;
mod files;
mod mcp;
mod updates;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::Manager;
use tokio_util::sync::CancellationToken;
pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub data_dir: PathBuf,
    pub jobs: Mutex<HashMap<String, CancellationToken>>,
    pub slots: Arc<tokio::sync::Semaphore>,
    pub mcp_clients: Mutex<HashMap<String, Arc<mcp::Client>>>,
    pub mcp_approvals: Mutex<HashMap<String, mcp::Approval>>,
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = if let Some(dir) = std::env::var_os("MOJI_DATA_DIR") {
                PathBuf::from(dir)
            } else {
                app.path().app_data_dir()?
            };
            std::fs::create_dir_all(&data_dir)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&data_dir, std::fs::Permissions::from_mode(0o700))?;
            }
            let conn = db::open(&data_dir.join("moji.sqlite3"))?;
            app.manage(AppState {
                db: Mutex::new(conn),
                data_dir,
                jobs: Mutex::new(HashMap::new()),
                slots: Arc::new(tokio::sync::Semaphore::new(2)),
                mcp_clients: Mutex::new(HashMap::new()),
                mcp_approvals: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::load_workspace,
            db::save_workspace,
            db::load_chats,
            db::save_chat,
            db::data_location,
            files::export_file,
            files::import_files,
            files::print_document,
            ai::get_settings,
            ai::save_settings,
            ai::codex_status,
            ai::chat,
            ai::cancel_chat,
            mcp::list_mcp_servers,
            mcp::save_mcp_server,
            mcp::remove_mcp_server,
            mcp::connect_mcp_server,
            mcp::disconnect_mcp_server,
            mcp::approve_mcp_tool,
            updates::check_for_updates,
            updates::open_update_link
        ])
        .build(tauri::generate_context!())
        .expect("无法启动墨记")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                let state = app.state::<AppState>();
                if let Ok(jobs) = state.jobs.lock() {
                    for job in jobs.values() {
                        job.cancel();
                    }
                };
                if let Ok(mut approvals) = state.mcp_approvals.lock() {
                    approvals.clear();
                }
                if let Ok(mut clients) = state.mcp_clients.lock() {
                    clients.clear();
                };
            }
        });
}
