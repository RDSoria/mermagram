mod mcp_access;
mod mcp_server;
mod mcp_tools;
mod mcp_validation;
mod workspace;
mod workspace_commands;
mod workspace_store;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(mcp_validation::ValidationBridge::default())
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("workspaces.json");
            let store =
                workspace_store::WorkspaceStore::open(path).map_err(std::io::Error::other)?;
            app.manage(store);
            let mcp_settings = app.path().app_data_dir()?.join("mcp-settings.json");
            let mcp =
                mcp_server::McpServerState::open(mcp_settings).map_err(std::io::Error::other)?;
            app.manage(mcp);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mcp_validation::complete_mcp_validation,
            mcp_server::start_mcp_server,
            mcp_server::stop_mcp_server,
            mcp_server::set_mcp_port,
            mcp_server::select_mcp_port,
            mcp_server::get_mcp_status,
            mcp_server::get_mcp_connections,
            mcp_server::decide_mcp_approval,
            workspace_commands::list_workspaces,
            workspace_commands::get_workspace,
            workspace_commands::create_workspace,
            workspace_commands::create_workspace_document,
            workspace_commands::get_workspace_document,
            workspace_commands::update_workspace_document_source,
            workspace_commands::rename_workspace_document,
            workspace_commands::set_workspace_document_protected,
            workspace_commands::delete_workspace_document,
            workspace_commands::delete_workspace,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                mcp_server::stop_on_exit(app);
            }
        });
}
